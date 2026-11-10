/**
 * Offline Rollback Isolation and Transaction Control Logic
 * Scope: Local-only execution and automated testing.
 */

export const RUN_ID_REGEX = /^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
export const SEQUENCE_ID_REGEX = /^(?!0000)[0-9]{4}$/;

export type RollbackParameters = Readonly<{
  approvedOwnerUid: string;
  runId: string;
  idempotencyRegex: string;
  canonicalSourceRegex: string;
  normalizedUrlRegex: string;
  idempotencySeqRegex: string;
  canonicalSeqRegex: string;
  urlSeqRegex: string;
}>;

export function buildRollbackParameters(runId: string, approvedOwnerUid: string): RollbackParameters {
  if (!RUN_ID_REGEX.test(runId)) {
    throw new Error(`Invalid RUN_ID format: "${runId}". Must match ${RUN_ID_REGEX}`);
  }
  if (!approvedOwnerUid || approvedOwnerUid.trim().length === 0) {
    throw new Error("Approved Staging QA UID is required and cannot be empty.");
  }

  return Object.freeze({
    approvedOwnerUid,
    runId,
    idempotencyRegex: `^test-run\\.${runId}\\.(?!0000)[0-9]{4}$`,
    canonicalSourceRegex: `^synthetic\\.${runId}\\.(?!0000)[0-9]{4}$`,
    normalizedUrlRegex: `^https://www\\.tiktok\.com/@staging_test/video/${runId}\\.(?!0000)[0-9]{4}$`,
    idempotencySeqRegex: `^test-run\\.${runId}\\.((?!0000)[0-9]{4})$`,
    canonicalSeqRegex: `^synthetic\\.${runId}\\.((?!0000)[0-9]{4})$`,
    urlSeqRegex: `^https://www\\.tiktok\.com/@staging_test/video/${runId}\\.((?!0000)[0-9]{4})$`,
  });
}

export type SyntheticRecord = Readonly<{
  owner_uid: string | null;
  idempotency_key: string | null;
  canonical_source_id: string | null;
  normalized_url: string | null;
  platform: string;
  job_id: string | null;
  media_id: string | null;
}>;

export function evaluateRecordEligibility(
  record: SyntheticRecord,
  params: RollbackParameters,
): boolean {
  if (record.platform !== "tiktok") return false;
  if (record.owner_uid === null || record.idempotency_key === null || record.canonical_source_id === null || record.normalized_url === null) {
    return false;
  }
  if (record.owner_uid !== params.approvedOwnerUid) return false;
  if (!new RegExp(params.idempotencyRegex).test(record.idempotency_key)) return false;
  if (!new RegExp(params.canonicalSourceRegex).test(record.canonical_source_id)) return false;
  if (!new RegExp(params.normalizedUrlRegex).test(record.normalized_url)) return false;

  const keySeq = record.idempotency_key.match(new RegExp(params.idempotencySeqRegex))?.[1];
  const sourceSeq = record.canonical_source_id.match(new RegExp(params.canonicalSeqRegex))?.[1];
  const urlSeq = record.normalized_url.match(new RegExp(params.urlSeqRegex))?.[1];

  if (!keySeq || !sourceSeq || !urlSeq) return false;
  if (keySeq !== sourceSeq || keySeq !== urlSeq) return false;

  if (record.job_id !== null || record.media_id !== null) return false;

  return true;
}

export type MockQueryResult = { rows: any[]; rowCount?: number };

export interface DatabaseClient {
  query(sql: string, params?: any[]): Promise<MockQueryResult>;
  release(destroy?: boolean): void;
}

export interface ConnectionPool {
  connect(): Promise<DatabaseClient>;
}

export type RollbackExecutionResult =
  | { status: "success"; deletedCount: number }
  | { status: "aborted"; reason: string };

export async function executeConservativeRollback(
  pool: ConnectionPool,
  runId: string,
  approvedOwnerUid: string,
): Promise<RollbackExecutionResult> {
  const params = buildRollbackParameters(runId, approvedOwnerUid);
  const client = await pool.connect();

  let transactionActive = false;
  let connectionTainted = false;

  try {
    try {
      await client.query("BEGIN;");
      transactionActive = true;
    } catch (beginErr) {
      connectionTainted = true;
      throw new Error(`Failed to initiate transaction: ${(beginErr as Error).message}`);
    }

    await client.query("SET LOCAL lock_timeout = '5s';");
    await client.query("SET LOCAL statement_timeout = '30s';");

    // 1. Precheck
    const precheckRes = await client.query("PRECHECK_AUDIT", [
      params.approvedOwnerUid,
      params.idempotencyRegex,
      params.canonicalSourceRegex,
      params.normalizedUrlRegex,
      params.idempotencySeqRegex,
      params.canonicalSeqRegex,
      params.urlSeqRegex,
    ]);

    const { total_tiktok, ineligible_or_malformed_tiktok, active_fk_references } = precheckRes.rows[0] ?? {
      total_tiktok: 0,
      ineligible_or_malformed_tiktok: 0,
      active_fk_references: 0,
    };

    if (Number(ineligible_or_malformed_tiktok) > 0) {
      throw new Error(`Rollback aborted: ${ineligible_or_malformed_tiktok} ineligible or malformed TikTok records found.`);
    }
    if (Number(active_fk_references) > 0) {
      throw new Error(`Rollback aborted: ${active_fk_references} target records have active foreign keys.`);
    }

    // 2. DELETE
    const deleteRes = await client.query("DELETE_SYNTHETIC", [
      params.approvedOwnerUid,
      params.idempotencyRegex,
      params.canonicalSourceRegex,
      params.normalizedUrlRegex,
      params.idempotencySeqRegex,
      params.canonicalSeqRegex,
      params.urlSeqRegex,
    ]);
    const deletedCount = deleteRes.rowCount ?? 0;

    // 3. Postcheck
    const postcheckRes = await client.query("POSTCHECK_AUDIT");
    const remainingCount = Number(postcheckRes.rows[0]?.count ?? 0);
    if (remainingCount > 0) {
      throw new Error(`Rollback aborted: ${remainingCount} TikTok records remain after deletion.`);
    }

    // 4. Constraint restoration
    await client.query("ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;");
    await client.query("ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube');");

    // 5. COMMIT
    try {
      await client.query("COMMIT;");
      transactionActive = false;
      return { status: "success", deletedCount };
    } catch (commitErr) {
      connectionTainted = true;
      transactionActive = false;
      throw new Error(`COMMIT outcome uncertain. Connection destroyed. Manual reconciliation required: ${(commitErr as Error).message}`);
    }
  } catch (err) {
    if (transactionActive) {
      try {
        await client.query("ROLLBACK;");
        transactionActive = false;
      } catch (rollbackErr) {
        connectionTainted = true;
        throw new AggregateError([err, rollbackErr], "Transaction failed AND explicit ROLLBACK failed. Connection destroyed.");
      }
    }
    if (connectionTainted) {
      throw err;
    }
    return { status: "aborted", reason: (err as Error).message };
  } finally {
    if (connectionTainted) {
      client.release(true);
    } else {
      client.release();
    }
  }
}
