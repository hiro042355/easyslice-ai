import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { createDurableMediaOwnershipRepository, isUuid } from "@/lib/server/durableMediaOwnership";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<Readonly<{ jobId: string; mediaId: string }>> }>;

export async function GET(request: Request, context: Context) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const { jobId, mediaId } = await context.params;
  if (!isUuid(jobId) || !isUuid(mediaId)) return NextResponse.json({ error: "invalid-resource" }, { status: 400 });
  const ownerUid = authentication.context.identity.userId;

  return withProductionMediaRuntime(async ({ pool, bucket }) => {
    const repository = createDurableMediaOwnershipRepository(pool);
    if (!await repository.resolveOwnedJob(jobId, ownerUid)) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
    const media = await repository.resolveOwnedMedia(mediaId, ownerUid);
    if (!media || media.jobId !== jobId) return NextResponse.json({ error: "resource-not-found" }, { status: 404 });

    const object = bucket.file(media.storageKey);
    const [metadata] = await object.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0) return NextResponse.json({ error: "media-unavailable" }, { status: 500 });
    const rangeHeader = request.headers.get("range");
    const requestedRange = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
    if (rangeHeader && !requestedRange) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const start = requestedRange?.[1] ? Number(requestedRange[1]) : 0;
    const end = requestedRange?.[2] ? Math.min(Number(requestedRange[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = object.createReadStream({ start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: requestedRange ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
        ...(requestedRange ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  });
}
