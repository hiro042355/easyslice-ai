import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createDurableMediaOwnershipRepository, createMediaStorageKey, isUuid } from "@/lib/server/durableMediaOwnership";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";

const VIDEO_MIME = "video/mp4";
const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;

type InitiateRequest = Readonly<{ action: "initiate"; mime: string; size: number }>;
type FinalizeRequest = Readonly<{ action: "finalize"; jobId: string; mediaId: string }>;

const sameOrigin = (request: Request): string | undefined => {
  const requestOrigin = new URL(request.url).origin;
  return request.headers.get("origin") === requestOrigin ? requestOrigin : undefined;
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const origin = sameOrigin(request);
  if (!origin) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });

  let body: InitiateRequest | FinalizeRequest;
  try {
    body = await request.json() as InitiateRequest | FinalizeRequest;
  } catch {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const ownerUid = authentication.context.identity.userId;
  try {
    if (body.action === "initiate") {
      if (body.mime !== VIDEO_MIME || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > MAX_MEDIA_BYTES) {
        return NextResponse.json({ error: "invalid-media" }, { status: 400 });
      }
      return await withProductionMediaRuntime(async ({ bucket }) => {
        const jobId = randomUUID();
        const mediaId = randomUUID();
        const storageKey = createMediaStorageKey(jobId, mediaId, "input", body.mime);
        const [uploadUrl] = await bucket.file(storageKey).createResumableUpload({
          origin,
          private: true,
          metadata: {
            contentType: body.mime,
            metadata: {
              nexcutOwnerUid: ownerUid,
              nexcutJobId: jobId,
              nexcutMediaId: mediaId,
              nexcutExpectedSize: String(body.size),
            },
          },
        });
        return NextResponse.json({ jobId, mediaId, uploadUrl });
      });
    }

    if (body.action === "finalize") {
      if (!isUuid(body.jobId) || !isUuid(body.mediaId)) return NextResponse.json({ error: "invalid-resource" }, { status: 400 });
      return await withProductionMediaRuntime(async ({ pool, bucket }) => {
        const storageKey = createMediaStorageKey(body.jobId, body.mediaId, "input", VIDEO_MIME);
        const object = bucket.file(storageKey);
        const [metadata] = await object.getMetadata();
        const custom = metadata.metadata ?? {};
        if (
          metadata.contentType !== VIDEO_MIME ||
          custom.nexcutOwnerUid !== ownerUid ||
          custom.nexcutJobId !== body.jobId ||
          custom.nexcutMediaId !== body.mediaId ||
          String(metadata.size) !== custom.nexcutExpectedSize
        ) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });

        const transaction = await pool.connect();
        try {
          await transaction.query("BEGIN");
          const repository = createDurableMediaOwnershipRepository(transaction);
          const existingJob = await repository.resolveOwnedJob(body.jobId, ownerUid);
          const existingMedia = await repository.resolveOwnedMedia(body.mediaId, ownerUid);
          if (existingJob && existingMedia?.jobId === body.jobId && existingMedia.storageKey === storageKey) {
            await transaction.query("COMMIT");
            return NextResponse.json({ jobId: body.jobId, mediaId: body.mediaId });
          }
          if (existingJob || existingMedia) throw new Error("media-admission-conflict");
          await repository.createJobWithId(body.jobId, ownerUid);
          const media = await repository.createMediaWithId(body.mediaId, body.jobId, ownerUid, "input", VIDEO_MIME);
          if (!media || media.storageKey !== storageKey) throw new Error("media-admission-failed");
          await transaction.query("COMMIT");
          return NextResponse.json({ jobId: body.jobId, mediaId: body.mediaId });
        } catch (error) {
          await transaction.query("ROLLBACK").catch(() => undefined);
          await object.delete({ ignoreNotFound: true }).catch(() => undefined);
          throw error;
        } finally {
          transaction.release();
        }
      });
    }

    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "media-admission-failed" }, { status: 500 });
  }
}
