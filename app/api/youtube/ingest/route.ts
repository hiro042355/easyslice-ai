import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import {
  cleanupJobTempRoot,
  createDurableMediaOwnershipRepository,
  createJobTempDirectories,
  createMediaStorageKey,
} from "@/lib/server/durableMediaOwnership";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { runPackagedYtDlp, YtDlpProcessFailure } from "@/lib/server/packagedYtDlp";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import {
  createYouTubeAcquisitionArguments,
  inspectIngestedVideo,
  validateYouTubeVideoUrl,
  YOUTUBE_ACQUISITION_TIMEOUT_MS,
  YouTubeIngestionFailure,
} from "@/lib/server/youtubeIngestion";

export const runtime = "nodejs";
export const maxDuration = 300;

const VIDEO_MIME = "video/mp4";

const isSameOrigin = (request: Request): boolean => request.headers.get("origin") === new URL(request.url).origin;

const readUrl = async (request: Request): Promise<unknown> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("url" in value)) return undefined;
  return value.url;
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });

  let validated;
  try {
    validated = validateYouTubeVideoUrl(await readUrl(request));
  } catch {
    return NextResponse.json({ error: "invalid-youtube-url" }, { status: 400 });
  }

  const ownerUid = authentication.context.identity.userId;
  const jobId = randomUUID();
  const mediaId = randomUUID();
  const paths = await createJobTempDirectories(jobId);
  const inputPath = path.join(paths.input, "youtube-source.mp4");
  const storageKey = createMediaStorageKey(jobId, mediaId, "input", VIDEO_MIME);
  let uploaded = false;
  let completed = false;

  try {
    await runPackagedYtDlp(createYouTubeAcquisitionArguments(validated.canonicalUrl, inputPath), {
      timeoutMs: YOUTUBE_ACQUISITION_TIMEOUT_MS,
      signal: request.signal,
    });
    const inspection = await inspectIngestedVideo(resolvePackagedFfmpeg(), inputPath);

    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const object = bucket.file(storageKey);
      try {
        uploaded = true;
        await pipeline(
          createReadStream(inputPath),
          object.createWriteStream({ resumable: true, metadata: { contentType: VIDEO_MIME } }),
          { signal: request.signal },
        );

        const transaction = await pool.connect();
        try {
          await transaction.query("BEGIN");
          const repository = createDurableMediaOwnershipRepository(transaction);
          await repository.createJobWithId(jobId, ownerUid);
          const media = await repository.createMediaWithId(mediaId, jobId, ownerUid, "input", VIDEO_MIME);
          if (!media || media.storageKey !== storageKey) throw new Error("youtube-media-registration-failed");
          await transaction.query("COMMIT");
          completed = true;
          return NextResponse.json({ jobId, mediaId, durationSeconds: inspection.durationSeconds });
        } catch (error) {
          await transaction.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          transaction.release();
        }
      } catch (error) {
        if (uploaded && !completed) await object.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof YouTubeIngestionFailure) {
      return NextResponse.json({ error: error.reason }, { status: 422 });
    }
    if (error instanceof YtDlpProcessFailure) {
      const status = error.reason === "yt-dlp-timeout" ? 504 : error.reason === "yt-dlp-cancelled" ? 499 : 422;
      return NextResponse.json({ error: error.reason }, { status });
    }
    return NextResponse.json({ error: "youtube-ingestion-failed" }, { status: 500 });
  } finally {
    await cleanupJobTempRoot(jobId);
  }
}
