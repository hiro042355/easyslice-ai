import type { Pool, PoolClient } from "pg";
import type { AssetImportResult, AssetImportState, CanonicalAssetImportSource } from "@/lib/assetImport/types";

export type AssetImportRecord = Readonly<{
  ownerUid: string; idempotencyKey: string; fingerprint: Buffer; state: AssetImportState;
  source: CanonicalAssetImportSource; jobId?: string; mediaId?: string; durationSeconds?: number; result?: AssetImportResult; revision: number;
}>;

type Row = Readonly<{ owner_uid: string; idempotency_key: string; request_fingerprint: Buffer; state: AssetImportState;
  platform: "youtube"; canonical_source_id: string; normalized_url: string; job_id: string | null; media_id: string | null;
  duration_seconds: number | null; failure_code: "acquisition_retryable" | "acquisition_final" | "timeout" | null;
  retryable: boolean | null; revision: string }>;

const map = (row: Row): AssetImportRecord => {
  const source = Object.freeze({ platform: row.platform, videoId: row.canonical_source_id, normalizedUrl: row.normalized_url });
  const result: AssetImportResult | undefined = row.state === "succeeded" && row.job_id && row.media_id && row.duration_seconds
    ? Object.freeze({ responseVersion: "1.0", status: "succeeded", jobId: row.job_id, mediaId: row.media_id,
      durationSeconds: row.duration_seconds, source })
    : row.state === "failed_retryable" && row.failure_code
      ? Object.freeze({ responseVersion: "1.0", status: "failed", code: row.failure_code, retryable: true })
      : row.state === "failed_final" && row.failure_code
        ? Object.freeze({ responseVersion: "1.0", status: "failed", code: row.failure_code, retryable: false })
        : row.state === "reconciliation_required"
          ? Object.freeze({ responseVersion: "1.0", status: "reconciliation_required", retryAfterClass: "short" })
          : undefined;
  return Object.freeze({ ownerUid: row.owner_uid, idempotencyKey: row.idempotency_key, fingerprint: row.request_fingerprint,
    state: row.state, source, ...(row.job_id ? { jobId: row.job_id } : {}), ...(row.media_id ? { mediaId: row.media_id } : {}),
    ...(row.duration_seconds ? { durationSeconds: row.duration_seconds } : {}), ...(result ? { result } : {}), revision: Number(row.revision) });
};

export class AssetImportIdempotencyRepository {
  constructor(private readonly pool: Pool) {}

  async claim(input: Readonly<{ ownerUid: string; idempotencyKey: string; fingerprint: Buffer; source: CanonicalAssetImportSource }>): Promise<Readonly<{ created: boolean; record: AssetImportRecord }>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<Row>(`INSERT INTO workflow.asset_import_requests
        (owner_uid,idempotency_key,command_version,request_fingerprint,platform,canonical_source_id,normalized_url,state)
        VALUES ($1,$2,'1.0',$3,'youtube',$4,$5,'acquiring') ON CONFLICT DO NOTHING
        RETURNING owner_uid,idempotency_key,request_fingerprint,state,platform,canonical_source_id,normalized_url,job_id,media_id,duration_seconds,failure_code,retryable,revision`,
        [input.ownerUid, input.idempotencyKey, input.fingerprint, input.source.videoId, input.source.normalizedUrl]);
      const created = inserted.rowCount === 1;
      const selected = created ? inserted : await client.query<Row>(`SELECT owner_uid,idempotency_key,request_fingerprint,state,
        platform,canonical_source_id,normalized_url,job_id,media_id,duration_seconds,failure_code,retryable,revision FROM workflow.asset_import_requests
        WHERE owner_uid=$1 AND idempotency_key=$2 FOR UPDATE`, [input.ownerUid, input.idempotencyKey]);
      await client.query("COMMIT");
      return Object.freeze({ created, record: map(selected.rows[0]!) });
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async complete(client: PoolClient, record: AssetImportRecord, result: AssetImportResult, state: AssetImportState): Promise<void> {
    const failureCode = result.status === "failed" ? result.code : null;
    const retryable = result.status === "failed" ? result.retryable : null;
    const success = result.status === "succeeded" ? result : undefined;
    const updated = await client.query(`UPDATE workflow.asset_import_requests SET state=$1,job_id=$2,media_id=$3,duration_seconds=$4,
      failure_code=$5,retryable=$6,revision=revision+1,updated_at=transaction_timestamp()
      WHERE owner_uid=$7 AND idempotency_key=$8 AND revision=$9 AND state='acquiring'`,
      [state, success?.jobId ?? null, success?.mediaId ?? null, success?.durationSeconds ?? null, failureCode, retryable,
        record.ownerUid, record.idempotencyKey, record.revision]);
    if (updated.rowCount !== 1) throw new Error("asset-import-state-conflict");
  }

  async settle(record: AssetImportRecord, result: AssetImportResult, state: Exclude<AssetImportState, "acquiring" | "succeeded">): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.complete(client, record, result, state);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
