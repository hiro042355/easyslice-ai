import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { createDurableMediaOwnershipRepository, createMediaStorageKey } from "@/lib/server/durableMediaOwnership";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const form = await request.formData();
  const video = form.get("video");
  if (!(video instanceof File) || video.type !== "video/mp4" || video.size === 0) return NextResponse.json({ error: "invalid-media" }, { status: 400 });
  try {
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const jobId = randomUUID();
      const mediaId = randomUUID();
      const storageKey = createMediaStorageKey(jobId, mediaId, "input", video.type);
      await bucket.file(storageKey).save(Buffer.from(await video.arrayBuffer()), { resumable: false, contentType: video.type });
      const transaction = await pool.connect();
      try {
        await transaction.query("BEGIN");
        const repository = createDurableMediaOwnershipRepository(transaction);
        await repository.createJobWithId(jobId, authentication.context.identity.userId);
        const media = await repository.createMediaWithId(mediaId, jobId, authentication.context.identity.userId, "input", video.type);
        if (!media) throw new Error("media-admission-failed");
        await transaction.query("COMMIT");
        return NextResponse.json({ jobId, mediaId });
      } catch (error) {
        await transaction.query("ROLLBACK").catch(() => undefined);
        await bucket.file(storageKey).delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      } finally {
        transaction.release();
      }
    });
  } catch { return NextResponse.json({ error: "media-admission-failed" }, { status: 500 }); }
}
