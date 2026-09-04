import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import type { Bucket } from "@google-cloud/storage";
import type { AssetImportResult, AssetImportSuccess, CanonicalAssetImportSource } from "@/lib/assetImport/types";
import { YtDlpProcessFailure } from "../packagedYtDlp";
import { createAssetImportFingerprint } from "./fingerprint";
import { AssetImportIdempotencyRepository } from "./idempotencyRepository";
import { importYouTubeDirect } from "./directYouTubeImporter";
import type { AssetImportRecord } from "./idempotencyRepository";

const failure = (code: "acquisition_retryable" | "acquisition_final" | "persistence_failure" | "timeout", retryable: boolean): AssetImportResult =>
  Object.freeze({ responseVersion: "1.0", status: "failed", code, retryable });

export async function finalizeImportedAsset(input: Readonly<{ complete: () => Promise<void>;
  commit: () => Promise<void>; rollback: () => Promise<void>; compensate: () => Promise<void> }>): Promise<void> {
  let commitAttempted = false;
  try {
    await input.complete();
    commitAttempted = true;
    await input.commit();
  } catch (error) {
    await input.rollback().catch(() => undefined);
    if (!commitAttempted) await input.compensate().catch(() => undefined);
    throw error;
  }
}

type AssetImportResponse = Readonly<{ statusCode: number; body: AssetImportResult | Readonly<{
  responseVersion: "1.0"; status: "failed"; code: "duplicate_conflict"; retryable: false;
}> }>;

export function projectExistingAssetImport(record: AssetImportRecord, fingerprint: Buffer): AssetImportResponse {
  if (record.fingerprint.byteLength !== fingerprint.byteLength || !timingSafeEqual(record.fingerprint, fingerprint)) {
    return Object.freeze({ statusCode: 409, body: Object.freeze({ responseVersion: "1.0", status: "failed", code: "duplicate_conflict", retryable: false }) });
  }
  if (!record.result) return Object.freeze({ statusCode: 202, body: Object.freeze({ responseVersion: "1.0", status: "in_progress", retryAfterClass: "short" }) });
  return Object.freeze({ statusCode: record.state === "succeeded" ? 200 : record.state === "reconciliation_required" ? 202
    : record.state === "failed_retryable" ? 503 : 422, body: record.result });
}

export async function executeAssetImport(input: Readonly<{ ownerUid: string; idempotencyKey: string;
  source: CanonicalAssetImportSource; pool: Pool; bucket: Bucket; signal: AbortSignal }>): Promise<AssetImportResponse> {
  const repository = new AssetImportIdempotencyRepository(input.pool);
  const fingerprint = createAssetImportFingerprint(input.source);
  const claimed = await repository.claim({ ownerUid: input.ownerUid, idempotencyKey: input.idempotencyKey, fingerprint,
    source: input.source });
  if (!claimed.created) return projectExistingAssetImport(claimed.record, fingerprint);
  const jobId = randomUUID();
  const mediaId = randomUUID();
  try {
    const imported = await importYouTubeDirect({ ...input, jobId, mediaId });
    const result: AssetImportSuccess = Object.freeze({ responseVersion: "1.0", status: "succeeded", jobId, mediaId,
      durationSeconds: imported.durationSeconds, source: input.source });
    try {
      await finalizeImportedAsset({ complete: () => repository.complete(imported.transaction, claimed.record, result, "succeeded"),
        commit: () => imported.transaction.query("COMMIT").then(() => undefined),
        rollback: () => imported.transaction.query("ROLLBACK").then(() => undefined), compensate: imported.compensate });
    } catch (error) { throw error; }
    finally { imported.transaction.release(); }
    return Object.freeze({ statusCode: 200, body: result });
  } catch (error) {
    const mapped = error instanceof YtDlpProcessFailure
      ? failure(error.reason === "yt-dlp-timeout" ? "timeout" : error.reason === "network-failure" ? "acquisition_retryable" : "acquisition_final", error.reason === "network-failure")
      : failure("persistence_failure", true);
    const state = error instanceof YtDlpProcessFailure
      ? (mapped.status === "failed" && mapped.retryable ? "failed_retryable" : "failed_final")
      : "reconciliation_required";
    const durable: AssetImportResult = state === "reconciliation_required"
      ? Object.freeze({ responseVersion: "1.0", status: "reconciliation_required", retryAfterClass: "short" })
      : mapped;
    try { await repository.settle(claimed.record, durable, state); }
    catch {
      return Object.freeze({ statusCode: 202, body: Object.freeze({ responseVersion: "1.0", status: "reconciliation_required", retryAfterClass: "short" }) });
    }
    return Object.freeze({ statusCode: state === "reconciliation_required" ? 202 : mapped.status === "failed" && mapped.code === "timeout" ? 504 : mapped.status === "failed" && mapped.retryable ? 503 : 422, body: durable });
  }
}
