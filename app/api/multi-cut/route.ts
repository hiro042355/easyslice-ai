import {LOCAL_MEDIA_INPUT_OPTIONS,captureMediaProcess,runMediaProcess,withRequestMediaWorkspace} from '@/lib/server/requestMediaWorkspace';
import {downloadRequestMedia,readBoundedMediaOutput} from '@/lib/server/requestMediaIo';
import {readBoundedJsonBody} from '@/lib/server/boundedJsonBody';
import AdmZip from "adm-zip";
import { NextResponse } from "next/server";
import {
  createDurableMediaOwnershipRepository,
  isUuid,
} from "@/lib/server/durableMediaOwnership";
import {
  createMultiCutZipEntryName,
  normalizeMultiCutInstructions,
  type MultiCutInstructionInput,
} from "@/lib/server/durableMultiCut";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

type DurableMultiCutRequest = Readonly<{
  requestVersion: "1.0";
  jobId: string;
  mediaId: string;
  clips: readonly MultiCutInstructionInput[];
  outputFormat?: "original" | "shorts" | "normal";
}>;

const readRequest = async (request: Request): Promise<DurableMultiCutRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body: unknown = await readBoundedJsonBody(request,128*1024);
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  if (value.requestVersion !== "1.0" || !Array.isArray(value.clips)) return undefined;
  return {
    requestVersion: "1.0",
    jobId: String(value.jobId ?? ""),
    mediaId: String(value.mediaId ?? ""),
    clips: value.clips as readonly MultiCutInstructionInput[],
    outputFormat: value.outputFormat === "shorts" ? "shorts" : value.outputFormat === "original" ? "original" : "normal",
  };
};

const inspectDuration = async (executable: string, inputPath: string,signal:AbortSignal): Promise<number> => {
      const {stderr}=await captureMediaProcess(executable,['-nostdin','-hide_banner',...LOCAL_MEDIA_INPUT_OPTIONS,'-i',inputPath],signal);
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) throw new Error("media-duration-unavailable");
      const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      if(!Number.isFinite(duration)||duration<=0)throw new Error('media-duration-unavailable');
      return duration;
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;

  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({success:false,error:'invalid-origin'},{status:403});
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(300000)]);
    const body = await readRequest(request);
    if (!body) return NextResponse.json({ success: false, error: "durable-media-required" }, { status: 400 });
    if (!isUuid(body.jobId) || !isUuid(body.mediaId)) {
      return NextResponse.json({ success: false, error: "invalid-resource" }, { status: 400 });
    }
    if (body.clips.length === 0 || body.clips.length>64) {
      return NextResponse.json({ success: false, error: "clips-required" }, { status: 400 });
    }

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

      return withRequestMediaWorkspace(async workspace=>{
      const inputPath = workspace.file("source.mp4");
        await downloadRequestMedia(bucket.file(media.storageKey).createReadStream(),inputPath,signal);
        await workspace.assertRegular('source.mp4');
        const executable = resolvePackagedFfmpeg();
        const duration = await inspectDuration(executable, inputPath,signal);
        const clips = normalizeMultiCutInstructions(body.clips, duration);
        if (!clips) {
          return NextResponse.json({ success: false, error: "clip-range-invalid" }, { status: 400 });
        }

        const zip = new AdmZip();
        let totalBytes=0;
        const shorts = body.outputFormat === "shorts";
        for (const [offset, clip] of clips.entries()) {
          const index = offset + 1;
          const outputName = `clip-${String(index).padStart(4, "0")}.mp4`;
          const outputPath = workspace.file(outputName);
          const args = shorts
            ? ["-y", "-ss", String(clip.start), "-i", inputPath, "-t", String(clip.end - clip.start), "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280", "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath]
            : ["-y", "-ss", String(clip.start), "-i", inputPath, "-t", String(clip.end - clip.start), "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", outputPath];
          await runMediaProcess(executable,['-nostdin',...LOCAL_MEDIA_INPUT_OPTIONS,...args],signal);
          await workspace.assertRegular(outputName);
          const rendered=await readBoundedMediaOutput(outputPath);
          totalBytes+=rendered.length;
          if(totalBytes>256*1024*1024)throw new Error('zip-size-limit');
          zip.addFile(
            createMultiCutZipEntryName(index, shorts ? "shorts-9x16" : "original", clip),
            rendered,
          );
        }

        return new Response(zip.toBuffer(), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": "attachment; filename=clips.zip",
          },
        });
      },signal);
    });
  } catch {
    console.error("durable-multi-cut-failed");
    return NextResponse.json({ success: false, error: "multi-cut-failed" }, { status: 500 });
  }
}
