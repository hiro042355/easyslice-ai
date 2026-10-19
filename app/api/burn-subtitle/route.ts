import { readFile, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { decideCanonicalClipBoundary } from "@/lib/clipBoundary";
import {
  createSubtitleFilter, createSubtitleLines, getCreatorSubtitleRenderConfig,
  subtitleLinesToCreatorAss, subtitleLinesToSrt,
} from "@/lib/server/durableSubtitleBurn";
import {
  createDurableMediaOwnershipRepository, isUuid,
} from "@/lib/server/durableMediaOwnership";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import {checkMediaCancellation,runMediaProcess,withRequestMediaWorkspace} from '@/lib/server/requestMediaWorkspace';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {readBoundedJsonBody} from '@/lib/server/boundedJsonBody';

export const runtime = "nodejs";

type DurableSubtitleBurnRequest = Readonly<{
  requestVersion: "1.0"; jobId: string; mediaId: string; transcript: string; subTranscript: string;
  subtitleMode: "single" | "dual"; start: number; end?: number; creatorStyleConfig: unknown;
}>;

const readRequest = async (request: Request): Promise<DurableSubtitleBurnRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body = await readBoundedJsonBody(request,128*1024);
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  if (value.requestVersion !== "1.0") return undefined;
  const start = Number(value.start ?? 0);
  const end = value.end === undefined ? undefined : Number(value.end);
  if (!Number.isFinite(start) || (end !== undefined && !Number.isFinite(end))) return undefined;
  return {
    requestVersion: "1.0", jobId: String(value.jobId ?? ""), mediaId: String(value.mediaId ?? ""),
    transcript: String(value.transcript ?? ""), subTranscript: String(value.subTranscript ?? ""),
    subtitleMode: value.subtitleMode === "dual" ? "dual" : "single", start, end,
    creatorStyleConfig: value.creatorStyleConfig ?? null,
  };
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({success:false,error:'invalid-origin'},{status:403});
  try {
    const body = await readRequest(request);
    if (!body) return NextResponse.json({ success: false, error: "durable-media-required" }, { status: 400 });
    if (!isUuid(body.jobId) || !isUuid(body.mediaId)) {
      return NextResponse.json({ success: false, error: "invalid-resource" }, { status: 400 });
    }
    if (!body.transcript.trim()) {
      return NextResponse.json({ success: false, error: "subtitle-required" }, { status: 400 });
    }

    const boundary = decideCanonicalClipBoundary({
      candidateKind: "requested-range", anchorSecond: body.start,
      evidence: body.end === undefined ? [] : [{ kind: "requested-end", second: body.end }],
    });
    const ownerUid = authentication.context.identity.userId;
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(body.jobId, ownerUid)) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }
      const media = await repository.resolveOwnedMedia(body.mediaId, ownerUid);
      if (!media || media.jobId !== body.jobId) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }

      return withRequestMediaWorkspace(async workspace => {
      const inputPath = workspace.file('source.mp4');
      const renderConfig = getCreatorSubtitleRenderConfig(body.creatorStyleConfig);
      const subtitleName = renderConfig.enabled ? 'subtitle.ass' : 'subtitle.srt';
      const subtitlePath = workspace.file(subtitleName);
      const outputPath = workspace.file('subtitled.mp4');
        await pipeline(bucket.file(media.storageKey).createReadStream(),createWriteStream(inputPath,{flags:'wx',mode:0o600}),{signal:request.signal});
        await workspace.assertRegular('source.mp4');
        checkMediaCancellation(request.signal);
        const lines = createSubtitleLines(
          body.transcript, body.subTranscript,
          body.subtitleMode === "dual" && Boolean(body.subTranscript.trim()),
        );
        await writeFile(
          subtitlePath,
          renderConfig.enabled ? subtitleLinesToCreatorAss(lines, renderConfig) : subtitleLinesToSrt(lines),
          "utf8",
        );
        await workspace.assertRegular(subtitleName);
        await runMediaProcess(resolvePackagedFfmpeg(), [
          "-nostdin", "-n", "-ss", String(boundary.start), "-t", String(boundary.duration), "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-i", inputPath,
          "-vf", createSubtitleFilter(subtitlePath, renderConfig.enabled),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
          "-c:a", "aac", "-b:a", "128k", outputPath,
        ], request.signal);
        await workspace.assertRegular('subtitled.mp4');
        checkMediaCancellation(request.signal);
        return new Response(await readFile(outputPath), {
          headers: { "Content-Type": "video/mp4", "Content-Disposition": "attachment; filename=subtitled.mp4" },
        });
      },request.signal);
    });
  } catch {
    console.error("durable-subtitle-burn-failed");
    return NextResponse.json({ success: false, error: "subtitle-burn-failed" }, { status: 500 });
  }
}
