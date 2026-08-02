import type { DurableWorkflowDatabaseCapability, DurableWorkflowDatabaseRow, DurableWorkflowTransactionContext } from "../durableTransaction";
import { bytesField, execute, immutableJsonObject, stringField, validDigest, validUuid } from "./postgresqlStoreUtils";
import type { PostgreSQLFinalResultDraft, PostgreSQLFinalResultMutationResult, PostgreSQLFinalResultReadResult, PostgreSQLFinalResultRecord, PostgreSQLFinalResultStoreV2, PostgreSQLInternalUuidGenerator, PostgreSQLProtectedDigest } from "./types";
import { createSliceAInvalidRowFailureV2, projectSliceAJsonObjectV2 } from "./sliceAJsonConsumerV2";
import type { SliceADatabaseRowV2, SliceAJsonValidationFailureV2 } from "./sliceAJsonConsumerV2";

function parsePayload(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "string") return undefined;
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? immutableJsonObject(parsed as Record<string, unknown>) : undefined; } catch { return undefined; }
}

function buildFinalResultRecord(row: DurableWorkflowDatabaseRow, payload: Readonly<Record<string, unknown>>): PostgreSQLFinalResultRecord | undefined {
  const internalId = stringField(row, "result_id");
  const resultBytes = bytesField(row, "result_digest");
  const tenantBytes = bytesField(row, "tenant_digest");
  const region = stringField(row, "region"); const operation = stringField(row, "operation"); const status = stringField(row, "result_status");
  const revision = stringField(row, "revision"); const expiresAt = stringField(row, "expires_at");
  const retentionClass = stringField(row, "retention_class"); const deletionState = stringField(row, "deletion_state"); const legalHoldState = stringField(row, "legal_hold_state");
  if (!internalId || !validUuid(internalId) || !resultBytes || resultBytes.byteLength !== 32 || !tenantBytes || tenantBytes.byteLength !== 32 || !region || !revision || !payload || !expiresAt || !retentionClass) return undefined;
  if (!(["generate-vocal", "generate-music", "generate-mv"] as string[]).includes(operation ?? "") || !(["completed", "degraded", "partial", "failed", "cancelled"] as string[]).includes(status ?? "")) return undefined;
  if (!(["active", "deletion-pending", "deleted"] as string[]).includes(deletionState ?? "") || !(["none", "held"] as string[]).includes(legalHoldState ?? "")) return undefined;
  if (deletionState === "deleted" && legalHoldState === "held") return undefined;
  return Object.freeze({ internalId, resultIdentity: Object.freeze({ algorithm: "sha256", version: 1, bytes: resultBytes }), tenantIdentity: Object.freeze({ algorithm: "sha256", version: 1, bytes: tenantBytes }), region, operation: operation as PostgreSQLFinalResultRecord["operation"], status: status as PostgreSQLFinalResultRecord["status"], revision, terminalPayload: payload, expiresAt, retentionClass, deletionState: deletionState as PostgreSQLFinalResultRecord["deletionState"], legalHoldState: legalHoldState as PostgreSQLFinalResultRecord["legalHoldState"] });
}

export function parseFinalResultRow(row: DurableWorkflowDatabaseRow): PostgreSQLFinalResultRecord | undefined {
  const payload = parsePayload(row.terminal_payload);
  return payload ? buildFinalResultRecord(row, payload) : undefined;
}

export type PostgreSQLFinalResultRowProjectionV2 =
  | Readonly<{ status: "success"; record: PostgreSQLFinalResultRecord }>
  | SliceAJsonValidationFailureV2;

export function projectPostgreSQLFinalResultRowV2(row: SliceADatabaseRowV2): PostgreSQLFinalResultRowProjectionV2 {
  const payload = projectSliceAJsonObjectV2(row.terminal_payload);
  if (payload.status === "failure") return payload;
  const base = buildFinalResultRecord(row as DurableWorkflowDatabaseRow, payload.value);
  if (!base) return createSliceAInvalidRowFailureV2();
  return Object.freeze({
    status: "success",
    record: Object.freeze({ ...base, terminalPayload: payload.value }),
  });
}

async function read(database: DurableWorkflowDatabaseCapability, identity: PostgreSQLProtectedDigest): Promise<PostgreSQLFinalResultReadResult> {
  if (!validDigest(identity)) return { status: "corrupted" };
  const result = await execute(database, "slice-a.final.read", [identity.bytes], "single");
  if (result.status === "not-found") return { status: "not-found" };
  if (result.status !== "success" || !result.rows[0]) return { status: result.status === "failure" ? "unavailable" : "corrupted" };
  const record = parseFinalResultRow(result.rows[0]);
  return record ? { status: "found", record } : { status: "corrupted" };
}

export function createPostgreSQLFinalResultStore(generator: PostgreSQLInternalUuidGenerator): PostgreSQLFinalResultStoreV2 {
  return Object.freeze({
    storeVersion: "2.0",
    async commitIfAbsent(context: DurableWorkflowTransactionContext, draft: PostgreSQLFinalResultDraft): Promise<PostgreSQLFinalResultMutationResult> {
      const id = generator.generate();
      if (!validUuid(id) || !validDigest(draft.resultIdentity) || !validDigest(draft.tenantIdentity)) return { status: "corrupted" };
      const result = await execute(context.database, "slice-a.final.insert", [id, draft.resultIdentity.bytes, draft.tenantIdentity.bytes, draft.region, draft.operation, draft.status, draft.revision, JSON.stringify(draft.terminalPayload), draft.expiresAt, draft.retentionClass, draft.deletionState, draft.legalHoldState], "many");
      if (result.status === "success" && result.rows.length === 1) return { status: "created", record: Object.freeze({ ...draft, internalId: id }) };
      if (result.status === "success" && result.rows.length === 0) { const existing = await read(context.database, draft.resultIdentity); return existing.status === "found" ? { status: "found", record: existing.record } : existing; }
      return { status: result.status === "failure" ? "unavailable" : "corrupted" };
    },
    read: (session, identity) => read(session.database, identity),
    readInTransaction: (context, identity) => read(context.database, identity),
    async compareAndSet(context, identity, expectedRevision, lifecycle) {
      const result = await execute(context.database, "slice-a.final.cas", [identity.bytes, lifecycle.deletionState, lifecycle.legalHoldState, expectedRevision], "single");
      if (result.status === "not-found") { const existing = await read(context.database, identity); return existing.status === "found" ? { status: "conflict" } : existing; }
      if (result.status !== "success" || !result.rows[0]) return { status: result.status === "failure" ? "unavailable" : "corrupted" };
      const record = parseFinalResultRow(result.rows[0]); return record ? { status: "updated", record } : { status: "corrupted" };
    },
  });
}
