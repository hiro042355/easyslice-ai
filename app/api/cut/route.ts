import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { cleanupJobTempRoot, createDurableMediaOwnershipRepository, createExportStorageKey, createJobTempDirectories, isUuid } from "@/lib/server/durableMediaOwnership";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

const runFfmpeg = (args: readonly string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn("ffmpeg", args, { shell: false, stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg-failed")));
});

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const form = await request.formData();
  const jobId = String(form.get("jobId") ?? "");
  const mediaId = String(form.get("mediaId") ?? "");
  if (!isUuid(jobId) || !isUuid(mediaId)) return NextResponse.json({ error: "invalid-resource" }, { status: 400 });
  const ownerUid = authentication.context.identity.userId;
  try {
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(jobId, ownerUid)) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
      const media = await repository.resolveOwnedMedia(mediaId, ownerUid);
      if (!media || media.jobId !== jobId) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
      const start = Number(form.get("start"));
      const end = Number(form.get("end"));
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return NextResponse.json({ error: "invalid-boundary" }, { status: 400 });
      const paths = await createJobTempDirectories(jobId);
      const input = join(paths.input, "source.mp4");
      const output = join(paths.output, "cut.mp4");
      let uploadedKey: string | undefined;
      try {
        const [bytes] = await bucket.file(media.storageKey).download();
        await writeFile(input, bytes);
        await runFfmpeg(["-y", "-i", input, "-ss", String(start), "-to", String(end), "-c:v", "libx264", "-c:a", "aac", output]);
        const rendered = await readFile(output);
        const exportId = randomUUID();
        uploadedKey = createExportStorageKey(jobId, exportId, "video/mp4");
        await bucket.file(uploadedKey).save(rendered, { resumable: false, contentType: "video/mp4" });
        const exported = await repository.createExportWithId(exportId, jobId, ownerUid, "video/mp4");
        if (!exported) throw new Error("export-authority-failed");
        return new Response(rendered, { headers: { "Content-Type": "video/mp4", "Content-Disposition": "attachment; filename=cut.mp4", "X-Nexcut-Export-Id": exported.id } });
      } catch (error) {
        if (uploadedKey) await bucket.file(uploadedKey).delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      } finally { await cleanupJobTempRoot(jobId); }
    });
  } catch { return NextResponse.json({ error: "cut-failed" }, { status: 500 }); }
}
