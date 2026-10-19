import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Pool, PoolClient } from "pg";
import type { Bucket } from "@google-cloud/storage";
import type { CanonicalAssetImportSource } from "@/lib/assetImport/types";
import { createDurableMediaOwnershipRepository, createMediaStorageKey } from "../durableMediaOwnership";
import { checkMediaCancellation, withRequestMediaWorkspace } from "../requestMediaWorkspace";
import { resolvePackagedFfmpeg } from "../packagedFfmpeg";
import { probePackagedYtDlpVersion, PACKAGED_YT_DLP_VERSION, runPackagedYtDlp } from "../packagedYtDlp";
import { createYouTubeAcquisitionArguments, inspectIngestedVideo, YOUTUBE_ACQUISITION_TIMEOUT_MS } from "../youtubeIngestion";

export type DirectImportResult = Readonly<{ durationSeconds: number; transaction: PoolClient; compensate: () => Promise<void> }>;

export async function importYouTubeDirect(input: Readonly<{ ownerUid: string; jobId: string; mediaId: string;
  source: CanonicalAssetImportSource; pool: Pool; bucket: Bucket; signal: AbortSignal }>): Promise<DirectImportResult> {
  return withRequestMediaWorkspace(async workspace => {
  const mediaPath = workspace.file("youtube-source.mp4");
  const storageKey = createMediaStorageKey(input.jobId, input.mediaId, "input", "video/mp4");
  let uploaded = false; let transaction: PoolClient | undefined;
  try {
    if (await probePackagedYtDlpVersion() !== PACKAGED_YT_DLP_VERSION) throw new Error("acquisition-runtime-invalid");
    await runPackagedYtDlp(createYouTubeAcquisitionArguments(input.source.normalizedUrl, mediaPath), {
      timeoutMs: YOUTUBE_ACQUISITION_TIMEOUT_MS, signal: input.signal,
    });
    await workspace.assertRegular("youtube-source.mp4");
    checkMediaCancellation(input.signal);
    const inspection = await inspectIngestedVideo(resolvePackagedFfmpeg(), mediaPath);
    checkMediaCancellation(input.signal);
    const object = input.bucket.file(storageKey); uploaded = true;
    await pipeline(createReadStream(mediaPath), object.createWriteStream({ resumable: true, metadata: { contentType: "video/mp4" } }), { signal: input.signal });
    transaction = await input.pool.connect(); await transaction.query("BEGIN");
    const ownership = createDurableMediaOwnershipRepository(transaction);
    await ownership.createJobWithId(input.jobId, input.ownerUid);
    const media = await ownership.createMediaWithId(input.mediaId, input.jobId, input.ownerUid, "input", "video/mp4");
    if (!media || media.storageKey !== storageKey) throw new Error("media-registration-failed");
    return Object.freeze({ durationSeconds: inspection.durationSeconds, transaction,
      compensate: () => input.bucket.file(storageKey).delete({ ignoreNotFound: true }).then(() => undefined) });
  } catch (error) {
    if (transaction) { await transaction.query("ROLLBACK").catch(() => undefined); transaction.release(); }
    if (uploaded) await input.bucket.file(storageKey).delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
  }, input.signal);
}
