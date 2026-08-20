import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { decideCanonicalClipBoundary } from "@/lib/clipBoundary";
import {
  createSubtitleFilter, createSubtitleLines, getCreatorSubtitleRenderConfig,
  subtitleLinesToCreatorAss, subtitleLinesToSrt,
} from "@/lib/server/durableSubtitleBurn";
import {
  cleanupJobTempRoot, createDurableMediaOwnershipRepository, createJobTempDirectories, isUuid,
} from "@/lib/server/durableMediaOwnership";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

type DurableSubtitleBurnRequest = Readonly<{
  requestVersion: "1.0"; jobId: string; mediaId: string; transcript: string; subTranscript: string;
  subtitleMode: "single" | "dual"; start: number; end?: number; creatorStyleConfig: unknown;
}>;

const readRequest = async (request: Request): Promise<DurableSubtitleBurnRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body: unknown = await request.json();
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

const runFfmpeg = async (executable: string, args: readonly string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { shell: false, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg-failed")));
  });

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
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

      const paths = await createJobTempDirectories(body.jobId);
      const inputPath = path.join(paths.input, "source.mp4");
      const renderConfig = getCreatorSubtitleRenderConfig(body.creatorStyleConfig);
      const subtitlePath = path.join(paths.work, renderConfig.enabled ? "subtitle.ass" : "subtitle.srt");
      const outputPath = path.join(paths.output, "subtitled.mp4");
      try {
        await bucket.file(media.storageKey).download({ destination: inputPath });
        const lines = createSubtitleLines(
          body.transcript, body.subTranscript,
          body.subtitleMode === "dual" && Boolean(body.subTranscript.trim()),
        );
        await writeFile(
          subtitlePath,
          renderConfig.enabled ? subtitleLinesToCreatorAss(lines, renderConfig) : subtitleLinesToSrt(lines),
          "utf8",
        );
        await runFfmpeg(resolvePackagedFfmpeg(), [
          "-y", "-ss", String(boundary.start), "-t", String(boundary.duration), "-i", inputPath,
          "-vf", createSubtitleFilter(subtitlePath, renderConfig.enabled),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
          "-c:a", "aac", "-b:a", "128k", outputPath,
        ]);
        return new Response(await readFile(outputPath), {
          headers: { "Content-Type": "video/mp4", "Content-Disposition": "attachment; filename=subtitled.mp4" },
        });
      } finally {
        await cleanupJobTempRoot(body.jobId);
      }
    });
  } catch {
    console.error("durable-subtitle-burn-failed");
    return NextResponse.json({ success: false, error: "subtitle-burn-failed" }, { status: 500 });
  }
}
