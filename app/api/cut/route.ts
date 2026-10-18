import { randomUUID } from "node:crypto";
import {downloadRequestMedia,readBoundedMediaOutput} from '@/lib/server/requestMediaIo';
import {readBoundedMultipart} from '@/lib/server/mediaConvertCore';
import {LOCAL_MEDIA_INPUT_OPTIONS,runMediaProcess,withRequestMediaWorkspace} from '@/lib/server/requestMediaWorkspace';
import { NextResponse } from "next/server";
import { collectFfmpegBinaryDiagnostic } from "@/lib/server/audioHighlightInspection";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { createDurableMediaOwnershipRepository, createExportStorageKey, isUuid } from "@/lib/server/durableMediaOwnership";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import { buildCameraFfmpegFilter } from "@/lib/server/ffmpegCameraFilter";
import { validateCameraMovementArray } from "@/lib/camera/cameraEngine";

export const runtime = "nodejs";

const runFfmpeg = async (args: readonly string[],signal:AbortSignal): Promise<void> => {
  const executable = resolvePackagedFfmpeg();
  const diagnostic = await collectFfmpegBinaryDiagnostic(executable);
  if (!diagnostic.exists || !diagnostic.statSucceeded || !diagnostic.fOk) {
    throw new Error("ffmpeg-binary-missing");
  }
  if (process.platform !== "win32" && (!diagnostic.executableBit || !diagnostic.xOk)) {
    throw new Error("ffmpeg-not-executable");
  }

  await runMediaProcess(executable,args,signal);
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  try {
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'invalid-origin'},{status:403});
  const form = await readBoundedMultipart(request,128*1024);
  const jobId = String(form.get("jobId") ?? "");
  const mediaId = String(form.get("mediaId") ?? "");
  if (!isUuid(jobId) || !isUuid(mediaId)) return NextResponse.json({ error: "invalid-resource" }, { status: 400 });
  const ownerUid = authentication.context.identity.userId;
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(300000)]);
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(jobId, ownerUid)) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
      const media = await repository.resolveOwnedMedia(mediaId, ownerUid);
      if (!media || media.jobId !== jobId) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
      const start = Number(form.get("start"));
      const end = Number(form.get("end"));
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return NextResponse.json({ error: "invalid-boundary" }, { status: 400 });

      const rawCameraMovements = form.get("cameraMovements");
      let cameraFilter: string | null = null;
      if (typeof rawCameraMovements === "string" && rawCameraMovements.trim() !== "") {
        try {
          if (rawCameraMovements.length > 65536) return NextResponse.json({ error: "invalid-camera" }, { status: 400 });
          const parsedMovements = JSON.parse(rawCameraMovements);
          if (!Array.isArray(parsedMovements) || parsedMovements.length > 128 || !validateCameraMovementArray(parsedMovements, end - start).valid) return NextResponse.json({ error: "invalid-camera" }, { status: 400 });
          cameraFilter = buildCameraFfmpegFilter(parsedMovements, end - start);
          if (parsedMovements.length && !cameraFilter) return NextResponse.json({ error: "invalid-camera" }, { status: 400 });
        } catch {
          return NextResponse.json({ error: "invalid-camera" }, { status: 400 });
        }
      } else if (rawCameraMovements !== null && typeof rawCameraMovements !== "string") {
        return NextResponse.json({ error: "invalid-camera" }, { status: 400 });
      }

      return withRequestMediaWorkspace(async workspace=>{
      const input = workspace.file("source.mp4");
      const output = workspace.file("cut.mp4");
      let uploadedKey: string | undefined;
      try {
        await downloadRequestMedia(bucket.file(media.storageKey).createReadStream(),input,signal);
        await workspace.assertRegular('source.mp4');
        const ffmpegArgs: string[] = ["-nostdin","-y", "-ss", String(start), "-to", String(end),...LOCAL_MEDIA_INPUT_OPTIONS, "-i", input];
        if (cameraFilter) {
          ffmpegArgs.push("-vf", cameraFilter);
        }
        ffmpegArgs.push("-c:v", "libx264", "-c:a", "aac", output);
        await runFfmpeg([...ffmpegArgs],signal);
        await workspace.assertRegular('cut.mp4');
        const rendered = await readBoundedMediaOutput(output);
        const exportId = randomUUID();
        uploadedKey = createExportStorageKey(jobId, exportId, "video/mp4");
        await bucket.file(uploadedKey).save(rendered, { resumable: false, contentType: "video/mp4" });
        const exported = await repository.createExportWithId(exportId, jobId, ownerUid, "video/mp4");
        if (!exported) throw new Error("export-authority-failed");
        return new Response(Uint8Array.from(rendered), { headers: { "Content-Type": "video/mp4", "Content-Disposition": "attachment; filename=cut.mp4", "X-Nexcut-Export-Id": exported.id,"Cache-Control":"private, no-store" } });
      } catch (error) {
        if (uploadedKey) await bucket.file(uploadedKey).delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      }
      },signal);
    });
  } catch { return NextResponse.json({ error: "cut-failed" }, { status: 500 }); }
}
