import { createHash, randomUUID } from "node:crypto";
import type { UploadSessionState } from "../domain/youtube/resumable-upload";
import { buildUploadReceipt, type ReceiptStage } from "../domain/youtube/upload-receipt";
import {
  decodePublicationRecord,
  type PublicationQueryClient,
  type PublicationQueryResult,
  type PublicationRecord,
} from "../publicationRecords/repository";
import {
  FAKE_UPLOAD_TRANSPORT,
  planPublicationUpload,
} from "./contracts";

export type PublicationUploadChunk = Readonly<{
  chunkIndex: number;
  byteOffset: number;
  byteLength: number;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  attempts: number;
  confirmedAt: string | null;
}>;

export type PublicationUploadSession = Readonly<{
  id: string;
  publicationId: string;
  ownerUid: string;
  attemptId: string;
  state: UploadSessionState;
  transportKind: typeof FAKE_UPLOAD_TRANSPORT;
  sessionRef: string;
  sessionBinding: string;
  totalBytes: number;
  chunkBytes: number;
  totalChunks: number;
  confirmedChunks: number;
  confirmedOffset: number;
  retryCount: number;
  lastErrorCode: string | null;
  remoteVideoId: string | null;
  reconciliationState: string | null;
  receipt: Readonly<Record<string, unknown>> | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  chunks: readonly PublicationUploadChunk[];
}>;

export type UploadActionResult =
  | Readonly<{ code: "APPLIED"; record: PublicationRecord; session: PublicationUploadSession }>
  | Readonly<{ code: "NOOP"; record: PublicationRecord; session: PublicationUploadSession }>
  | Readonly<{ code: "NOT_FOUND" }>
  | Readonly<{ code: "CONFLICT"; record?: PublicationRecord; session?: PublicationUploadSession }>
  | Readonly<{ code: "INVALID_STATE"; record?: PublicationRecord; session?: PublicationUploadSession }>
  | Readonly<{ code: "RIGHTS_REQUIRED"; record?: PublicationRecord }>
  | Readonly<{ code: "INVALID_COUNT"; record?: PublicationRecord; session?: PublicationUploadSession }>
  | Readonly<{ code: "INVALID_PLAN" }>;

type Row = Readonly<Record<string, unknown>>;
type TransactionConnection = Readonly<{
  query<RowType>(text: string, values?: readonly unknown[]): Promise<PublicationQueryResult<RowType>>;
  release(): void;
}>;
type TransactionalClient = PublicationQueryClient & Readonly<{
  connect?: () => Promise<TransactionConnection>;
}>;

const STATES: readonly UploadSessionState[] = Object.freeze([
  "CREATED", "INITIALIZING", "UPLOADING", "RESUME_PENDING",
  "COMPLETED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "COMMIT_UNKNOWN",
]);

const isState = (value: unknown): value is UploadSessionState =>
  typeof value === "string" && (STATES as readonly string[]).includes(value);

const text = (value: unknown, max = 512): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;

const nullableText = (value: unknown, max = 512): string | null | undefined =>
  value === null || value === undefined ? null : text(value, max);

const integer = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
};

const iso = (value: unknown): string | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
};

const objectOrNull = (value: unknown): Readonly<Record<string, unknown>> | null | undefined => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.freeze({ ...(value as Record<string, unknown>) });
};

function decodeChunk(value: unknown): PublicationUploadChunk | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Row;
  const chunkIndex = integer(row.chunk_index);
  const byteOffset = integer(row.byte_offset);
  const byteLength = integer(row.byte_length);
  const status = row.status;
  const attempts = integer(row.attempts);
  const confirmedAt = row.confirmed_at === null || row.confirmed_at === undefined
    ? null : iso(row.confirmed_at);
  if (chunkIndex === undefined || byteOffset === undefined || byteLength === undefined || byteLength < 1 ||
      (status !== "PENDING" && status !== "CONFIRMED" && status !== "FAILED") ||
      attempts === undefined || confirmedAt === undefined) return undefined;
  return Object.freeze({ chunkIndex, byteOffset, byteLength, status, attempts, confirmedAt });
}

function decodeSession(row: unknown, chunks: readonly unknown[]): PublicationUploadSession | undefined {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const value = row as Row;
  const id = text(value.id, 64);
  const publicationId = text(value.publication_id, 64);
  const ownerUid = text(value.owner_uid);
  const attemptId = text(value.attempt_id);
  const state = value.state;
  const transportKind = value.transport_kind;
  const sessionRef = text(value.session_ref, 2048);
  const sessionBinding = text(value.session_binding, 64);
  const totalBytes = integer(value.total_bytes);
  const chunkBytes = integer(value.chunk_bytes);
  const totalChunks = integer(value.total_chunks);
  const confirmedChunks = integer(value.confirmed_chunks);
  const confirmedOffset = integer(value.confirmed_offset);
  const retryCount = integer(value.retry_count);
  const lastErrorCode = nullableText(value.last_error_code, 2000);
  const remoteVideoId = nullableText(value.remote_video_id);
  const reconciliationState = nullableText(value.reconciliation_state);
  const receipt = objectOrNull(value.receipt);
  const revision = integer(value.revision);
  const createdAt = iso(value.created_at);
  const updatedAt = iso(value.updated_at);
  if (!id || !publicationId || !ownerUid || !attemptId || !isState(state) ||
      transportKind !== FAKE_UPLOAD_TRANSPORT || !sessionRef ||
      !sessionBinding || !/^[a-f0-9]{64}$/.test(sessionBinding) ||
      totalBytes === undefined || totalBytes < 1 || chunkBytes === undefined ||
      chunkBytes < 262144 || chunkBytes % 262144 !== 0 || totalChunks === undefined ||
      totalChunks < 1 || confirmedChunks === undefined || confirmedChunks > totalChunks ||
      confirmedOffset === undefined || confirmedOffset > totalBytes || retryCount === undefined ||
      lastErrorCode === undefined || remoteVideoId === undefined || reconciliationState === undefined ||
      receipt === undefined || revision === undefined || revision < 1 || !createdAt || !updatedAt) return undefined;
  const decodedChunks = chunks.map(decodeChunk);
  if (decodedChunks.some(chunk => chunk === undefined)) return undefined;
  return Object.freeze({
    id, publicationId, ownerUid, attemptId, state, transportKind, sessionRef, sessionBinding,
    totalBytes, chunkBytes, totalChunks, confirmedChunks, confirmedOffset, retryCount,
    lastErrorCode, remoteVideoId, reconciliationState, receipt, revision, createdAt, updatedAt,
    chunks: Object.freeze(decodedChunks as PublicationUploadChunk[]),
  });
}

const sessionBinding = (
  ownerUid: string,
  publicationId: string,
  attemptId: string,
  mediaDigest: string,
): string => createHash("sha256")
  .update(JSON.stringify([ownerUid, publicationId, attemptId, mediaDigest]))
  .digest("hex");

const completeStages: readonly ReceiptStage[] = Object.freeze([
  "REQUEST_ACCEPTED", "SESSION_INITIALIZED", "BYTES_TRANSFERRED",
  "PROVIDER_COMPLETED", "VIDEO_IDENTIFIED", "VISIBILITY_CONFIRMED", "RESULT_RECONCILED",
]);

function fakeVideoId(sessionId: string): string {
  return `fake-${createHash("sha256").update(sessionId).digest("hex").slice(0, 16)}`;
}

function completeReceipt(
  record: PublicationRecord,
  session: PublicationUploadSession,
  reconciliationState: "NOT_REQUIRED" | "RECONCILED",
): Readonly<Record<string, unknown>> {
  const now = Date.now();
  const videoId = fakeVideoId(session.id);
  return buildUploadReceipt({
    receiptId: `fake-receipt-${session.id}`,
    tenantId: record.tenantId,
    authorityId: record.operationId,
    actorRef: session.ownerUid,
    googleAccountId: record.channelId ?? "unbound",
    operationId: record.operationId,
    attemptId: session.attemptId,
    assetId: record.asset.artifactId,
    mediaDigest: record.asset.mediaDigest,
    metadataDigest: record.metadataDigest,
    approvalId: record.id,
    provider: "YOUTUBE",
    videoId,
    visibility: "private",
    uploadState: "COMPLETED",
    stages: completeStages,
    confirmedOffset: session.totalBytes,
    totalBytes: session.totalBytes,
    providerEvidenceRef: `FAKE_DETERMINISTIC:${reconciliationState}`,
    verification: "NOT_VERIFIED",
    completionTimestampMs: now,
    createdAtMs: now,
  }) as unknown as Readonly<Record<string, unknown>>;
}

async function readSession(
  client: PublicationQueryClient,
  ownerUid: string,
  publicationId: string,
  forUpdate = false,
): Promise<PublicationUploadSession | undefined> {
  const session = await client.query<Row>(
    `SELECT * FROM workflow.publication_upload_sessions
     WHERE owner_uid=$1 AND publication_id=$2${forUpdate ? " FOR UPDATE" : ""}`,
    [ownerUid, publicationId],
  );
  if (!session.rows[0]) return undefined;
  const id = text(session.rows[0].id, 64);
  if (!id) return undefined;
  const chunks = await client.query<Row>(
    `SELECT chunk_index, byte_offset, byte_length, status, attempts, confirmed_at
     FROM workflow.publication_upload_chunks WHERE session_id=$1 ORDER BY chunk_index`,
    [id],
  );
  return decodeSession(session.rows[0], chunks.rows);
}

async function readIntent(
  client: PublicationQueryClient,
  ownerUid: string,
  publicationId: string,
  forUpdate = false,
): Promise<PublicationRecord | undefined> {
  const result = await client.query<Row>(
    `SELECT * FROM workflow.publication_intents
     WHERE owner_uid=$1 AND id=$2${forUpdate ? " FOR UPDATE" : ""}`,
    [ownerUid, publicationId],
  );
  return result.rows[0] ? decodePublicationRecord(result.rows[0]) : undefined;
}

async function transaction<T>(
  client: TransactionalClient,
  action: (connection: PublicationQueryClient) => Promise<T>,
): Promise<T> {
  if (!client.connect) return action(client);
  const connection = await client.connect();
  try {
    await connection.query("BEGIN");
    const result = await action(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export function createPublicationUploadRepository(client: TransactionalClient) {
  return Object.freeze({
    async get(ownerUid: string, publicationId: string): Promise<PublicationUploadSession | undefined> {
      return readSession(client, ownerUid, publicationId);
    },

    async start(ownerUid: string, publicationId: string, expectedRevision: number): Promise<UploadActionResult> {
      return transaction(client, async connection => {
        const record = await readIntent(connection, ownerUid, publicationId, true);
        if (!record) return Object.freeze({ code: "NOT_FOUND" });
        if (record.state !== "QUEUED") return Object.freeze({ code: "INVALID_STATE", record });
        if (!record.channelId || !record.rightsEvidenceRef) {
          return Object.freeze({ code: "RIGHTS_REQUIRED", record });
        }
        if (await readSession(connection, ownerUid, publicationId)) {
          return Object.freeze({ code: "CONFLICT", record });
        }
        const planned = planPublicationUpload(record.asset.size);
        if (!planned.ok) return Object.freeze({ code: "INVALID_PLAN" });
        const sessionId = randomUUID();
        const attemptId = `fake-attempt-${randomUUID()}`;
        const binding = sessionBinding(ownerUid, publicationId, attemptId, record.asset.mediaDigest);
        const sessionRef = `fake://youtube/upload/${sessionId}`;
        await connection.query(
          `INSERT INTO workflow.publication_upload_sessions
            (id, publication_id, owner_uid, attempt_id, state, transport_kind, session_ref,
             session_binding, total_bytes, chunk_bytes, total_chunks)
           VALUES ($1,$2,$3,$4,'UPLOADING',$5,$6,$7,$8,$9,$10)`,
          [sessionId, publicationId, ownerUid, attemptId, FAKE_UPLOAD_TRANSPORT, sessionRef, binding,
            record.asset.size, planned.plan.chunkBytes, planned.plan.totalChunks],
        );
        await connection.query(
          `INSERT INTO workflow.publication_upload_chunks
            (session_id, chunk_index, byte_offset, byte_length)
           SELECT $1, x.chunk_index, x.byte_offset, x.byte_length
           FROM jsonb_to_recordset($2::jsonb) AS x(chunk_index integer, byte_offset bigint, byte_length integer)`,
          [sessionId, JSON.stringify(planned.plan.chunks.map(chunk => ({
            chunk_index: chunk.index, byte_offset: chunk.offset, byte_length: chunk.length,
          })))],
        );
        const updated = await connection.query<Row>(
          `UPDATE workflow.publication_intents
           SET state='UPLOADING', revision=revision+1, updated_at=transaction_timestamp(),
               upload_session=$3::jsonb, verification_state='REMOTE_STATE_UNKNOWN',
               transport_kind='FAKE_DETERMINISTIC', last_error=NULL
           WHERE owner_uid=$1 AND id=$2 AND revision=$4 AND state='QUEUED'
           RETURNING *`,
          [ownerUid, publicationId, JSON.stringify({
            sessionId, attemptId, state: "UPLOADING", transport: FAKE_UPLOAD_TRANSPORT,
            totalBytes: record.asset.size, uploadedBytes: 0,
            chunkBytes: planned.plan.chunkBytes, totalChunks: planned.plan.totalChunks,
            confirmedChunks: 0, retryCount: 0, sessionRef,
          }), expectedRevision],
        );
        if (!updated.rows[0]) return Object.freeze({ code: "CONFLICT", record });
        await connection.query(
          `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
           VALUES ($1,$2,'UPLOADING',$3)`,
          [publicationId, ownerUid, "fake-upload:started"],
        );
        const next = decodePublicationRecord(updated.rows[0]);
        const session = await readSession(connection, ownerUid, publicationId);
        if (!next || !session) return Object.freeze({ code: "INVALID_PLAN" });
        return Object.freeze({ code: "APPLIED", record: next, session });
      });
    },

    async advance(
      ownerUid: string,
      publicationId: string,
      expectedSessionRevision: number,
      chunkCount: number,
    ): Promise<UploadActionResult> {
      return transaction(client, async connection => {
        const record = await readIntent(connection, ownerUid, publicationId, true);
        if (!record) return Object.freeze({ code: "NOT_FOUND" });
        const session = await readSession(connection, ownerUid, publicationId, true);
        if (!session) return Object.freeze({ code: "NOT_FOUND" });
        if (session.state !== "UPLOADING") return Object.freeze({ code: "INVALID_STATE", record, session });
        if (session.revision !== expectedSessionRevision) {
          return Object.freeze({ code: "CONFLICT", record, session });
        }
        const remaining = session.totalChunks - session.confirmedChunks;
        if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > remaining) {
          return Object.freeze({ code: "INVALID_COUNT", record, session });
        }
        const pending = await connection.query<Row>(
          `SELECT chunk_index FROM workflow.publication_upload_chunks
           WHERE session_id=$1 AND status='PENDING' ORDER BY chunk_index LIMIT $2`,
          [session.id, chunkCount],
        );
        if (pending.rows.length !== chunkCount) {
          return Object.freeze({ code: "CONFLICT", record, session });
        }
        const indexes = pending.rows.map(row => integer(row.chunk_index)).filter((value): value is number => value !== undefined);
        await connection.query(
          `UPDATE workflow.publication_upload_chunks
           SET status='CONFIRMED', attempts=attempts+1, confirmed_at=transaction_timestamp()
           WHERE session_id=$1 AND chunk_index = ANY($2::int[])`,
          [session.id, indexes],
        );
        const totals = await connection.query<Row>(
          `SELECT COUNT(*) FILTER (WHERE status='CONFIRMED')::int AS confirmed,
                  COALESCE(SUM(byte_length) FILTER (WHERE status='CONFIRMED'), 0)::bigint AS offset
           FROM workflow.publication_upload_chunks WHERE session_id=$1`,
          [session.id],
        );
        const confirmedChunks = integer(totals.rows[0]?.confirmed);
        const confirmedOffset = integer(totals.rows[0]?.offset);
        if (confirmedChunks === undefined || confirmedOffset === undefined) {
          return Object.freeze({ code: "INVALID_STATE", record, session });
        }
        if (confirmedChunks === session.totalChunks) {
          const receipt = completeReceipt(record, session, "NOT_REQUIRED");
          const videoId = fakeVideoId(session.id);
          const completed = await connection.query<Row>(
            `UPDATE workflow.publication_upload_sessions
             SET state='COMPLETED', confirmed_chunks=$2, confirmed_offset=$3,
                 remote_video_id=$4, reconciliation_state='NOT_REQUIRED', receipt=$5::jsonb,
                 revision=revision+1, updated_at=transaction_timestamp(), last_error_code=NULL
             WHERE id=$1 RETURNING *`,
            [session.id, confirmedChunks, confirmedOffset, videoId, JSON.stringify(receipt)],
          );
          if (!completed.rows[0]) return Object.freeze({ code: "CONFLICT", record, session });
          const updatedRecord = await connection.query<Row>(
            `UPDATE workflow.publication_intents
             SET state='PUBLISHED_PRIVATE', revision=revision+1, updated_at=transaction_timestamp(),
                 upload_session=$3::jsonb, remote_video_id=$4, remote_processing_status='SIMULATION_ONLY',
                 reconciliation_state='NOT_REQUIRED', receipt=$5::jsonb,
                 verification_state='SIMULATION_COMPLETED', transport_kind='FAKE_DETERMINISTIC',
                 last_error=NULL
             WHERE owner_uid=$1 AND id=$2 AND state='UPLOADING' RETURNING *`,
            [ownerUid, publicationId, JSON.stringify({
              sessionId: session.id, attemptId: session.attemptId, state: "COMPLETED",
              transport: FAKE_UPLOAD_TRANSPORT, totalBytes: session.totalBytes,
              uploadedBytes: confirmedOffset, chunkBytes: session.chunkBytes,
              totalChunks: session.totalChunks, confirmedChunks, retryCount: session.retryCount,
              sessionRef: session.sessionRef, remoteVideoId: videoId,
            }), videoId, JSON.stringify(receipt)],
          );
          await connection.query(
            `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
             VALUES ($1,$2,'PUBLISHED_PRIVATE',$3)`,
            [publicationId, ownerUid, "fake-upload:simulation-completed"],
          );
          const next = updatedRecord.rows[0] ? decodePublicationRecord(updatedRecord.rows[0]) : undefined;
          const nextSession = await readSession(connection, ownerUid, publicationId);
          if (!next || !nextSession) return Object.freeze({ code: "INVALID_STATE", record });
          return Object.freeze({ code: "APPLIED", record: next, session: nextSession });
        }
        const updatedSession = await connection.query<Row>(
          `UPDATE workflow.publication_upload_sessions
           SET confirmed_chunks=$2, confirmed_offset=$3, revision=revision+1,
               updated_at=transaction_timestamp(), last_error_code=NULL
           WHERE id=$1 RETURNING *`,
          [session.id, confirmedChunks, confirmedOffset],
        );
        if (!updatedSession.rows[0]) return Object.freeze({ code: "CONFLICT", record, session });
        const updatedRecord = await connection.query<Row>(
          `UPDATE workflow.publication_intents
           SET upload_session=$3::jsonb, updated_at=transaction_timestamp()
           WHERE owner_uid=$1 AND id=$2 AND state='UPLOADING' RETURNING *`,
          [ownerUid, publicationId, JSON.stringify({
            sessionId: session.id, attemptId: session.attemptId, state: "UPLOADING",
            transport: FAKE_UPLOAD_TRANSPORT, totalBytes: session.totalBytes,
            uploadedBytes: confirmedOffset, chunkBytes: session.chunkBytes,
            totalChunks: session.totalChunks, confirmedChunks, retryCount: session.retryCount,
            sessionRef: session.sessionRef,
          })],
        );
        const next = updatedRecord.rows[0] ? decodePublicationRecord(updatedRecord.rows[0]) : undefined;
        const nextSession = await readSession(connection, ownerUid, publicationId);
        if (!next || !nextSession) return Object.freeze({ code: "INVALID_STATE", record });
        return Object.freeze({ code: "APPLIED", record: next, session: nextSession });
      });
    },

    async interrupt(ownerUid: string, publicationId: string, expectedSessionRevision: number): Promise<UploadActionResult> {
      return this.simpleStateChange(ownerUid, publicationId, expectedSessionRevision, "interrupt");
    },

    async resume(ownerUid: string, publicationId: string, expectedSessionRevision: number): Promise<UploadActionResult> {
      return this.simpleStateChange(ownerUid, publicationId, expectedSessionRevision, "resume");
    },

    async markAmbiguous(ownerUid: string, publicationId: string, expectedSessionRevision: number): Promise<UploadActionResult> {
      return this.simpleStateChange(ownerUid, publicationId, expectedSessionRevision, "ambiguous");
    },

    async reconcile(ownerUid: string, publicationId: string, expectedSessionRevision: number): Promise<UploadActionResult> {
      return transaction(client, async connection => {
        const record = await readIntent(connection, ownerUid, publicationId, true);
        if (!record) return Object.freeze({ code: "NOT_FOUND" });
        const session = await readSession(connection, ownerUid, publicationId, true);
        if (!session) return Object.freeze({ code: "NOT_FOUND" });
        if (session.state !== "COMMIT_UNKNOWN") return Object.freeze({ code: "INVALID_STATE", record, session });
        if (session.revision !== expectedSessionRevision) return Object.freeze({ code: "CONFLICT", record, session });
        // The fake transport's ambiguous-final-chunk case: the provider may have
        // received the last chunk but did not return a usable confirmation. The
        // deterministic reconciler confirms the remaining byte range once, then
        // records a NOT_VERIFIED fake receipt. No real provider is contacted.
        await connection.query(
          `UPDATE workflow.publication_upload_chunks
           SET status='CONFIRMED', attempts=attempts+1, confirmed_at=transaction_timestamp()
           WHERE session_id=$1 AND status='PENDING'`,
          [session.id],
        );
        const totals = await connection.query<Row>(
          `SELECT COUNT(*) FILTER (WHERE status='CONFIRMED')::int AS confirmed,
                  COALESCE(SUM(byte_length) FILTER (WHERE status='CONFIRMED'), 0)::bigint AS offset
           FROM workflow.publication_upload_chunks WHERE session_id=$1`,
          [session.id],
        );
        if (integer(totals.rows[0]?.confirmed) !== session.totalChunks ||
            integer(totals.rows[0]?.offset) !== session.totalBytes) {
          return Object.freeze({ code: "INVALID_STATE", record, session });
        }
        const reconciledSession = Object.freeze({
          ...session,
          confirmedChunks: session.totalChunks,
          confirmedOffset: session.totalBytes,
        });
        const receipt = completeReceipt(record, reconciledSession, "RECONCILED");
        const videoId = fakeVideoId(session.id);
        const completed = await connection.query<Row>(
          `UPDATE workflow.publication_upload_sessions
           SET state='COMPLETED', confirmed_chunks=$4, confirmed_offset=$5,
               remote_video_id=$2, reconciliation_state='RECONCILED',
               receipt=$3::jsonb, revision=revision+1, updated_at=transaction_timestamp()
           WHERE id=$1 RETURNING *`,
          [session.id, videoId, JSON.stringify(receipt), session.totalChunks, session.totalBytes],
        );
        if (!completed.rows[0]) return Object.freeze({ code: "CONFLICT", record, session });
        const updatedRecord = await connection.query<Row>(
          `UPDATE workflow.publication_intents
           SET state='PUBLISHED_PRIVATE', revision=revision+1, updated_at=transaction_timestamp(),
               upload_session=$3::jsonb, remote_video_id=$4, remote_processing_status='SIMULATION_ONLY',
               reconciliation_state='RECONCILED', receipt=$5::jsonb,
               verification_state='SIMULATION_COMPLETED', transport_kind='FAKE_DETERMINISTIC',
               last_error=NULL
           WHERE owner_uid=$1 AND id=$2 AND state='RECONCILING' RETURNING *`,
          [ownerUid, publicationId, JSON.stringify({
            sessionId: session.id, attemptId: session.attemptId, state: "COMPLETED",
            transport: FAKE_UPLOAD_TRANSPORT, totalBytes: session.totalBytes,
            uploadedBytes: session.totalBytes, chunkBytes: session.chunkBytes,
            totalChunks: session.totalChunks, confirmedChunks: session.totalChunks,
            retryCount: session.retryCount, sessionRef: session.sessionRef, remoteVideoId: videoId,
          }), videoId, JSON.stringify(receipt)],
        );
        await connection.query(
          `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
           VALUES ($1,$2,'PUBLISHED_PRIVATE',$3)`,
          [publicationId, ownerUid, "fake-upload:reconciled"],
        );
        const next = updatedRecord.rows[0] ? decodePublicationRecord(updatedRecord.rows[0]) : undefined;
        const nextSession = await readSession(connection, ownerUid, publicationId);
        if (!next || !nextSession) return Object.freeze({ code: "INVALID_STATE", record });
        return Object.freeze({ code: "APPLIED", record: next, session: nextSession });
      });
    },

    async simpleStateChange(
      ownerUid: string,
      publicationId: string,
      expectedSessionRevision: number,
      action: "interrupt" | "resume" | "ambiguous",
    ): Promise<UploadActionResult> {
      return transaction(client, async connection => {
        const record = await readIntent(connection, ownerUid, publicationId, true);
        if (!record) return Object.freeze({ code: "NOT_FOUND" });
        const session = await readSession(connection, ownerUid, publicationId, true);
        if (!session) return Object.freeze({ code: "NOT_FOUND" });
        if (session.revision !== expectedSessionRevision) return Object.freeze({ code: "CONFLICT", record, session });
        const from = session.state;
        const to: UploadSessionState = action === "interrupt" ? "FAILED_RETRYABLE"
          : action === "resume" ? "UPLOADING" : "COMMIT_UNKNOWN";
        if (action === "interrupt" && from !== "UPLOADING") return Object.freeze({ code: "INVALID_STATE", record, session });
        if (action === "resume" && from !== "FAILED_RETRYABLE") return Object.freeze({ code: "INVALID_STATE", record, session });
        if (action === "ambiguous" && (from !== "UPLOADING" || session.confirmedChunks < session.totalChunks - 1)) {
          return Object.freeze({ code: "INVALID_STATE", record, session });
        }
        const updatedSession = await connection.query<Row>(
          `UPDATE workflow.publication_upload_sessions
           SET state=$2, revision=revision+1,
               retry_count=CASE WHEN $3 THEN retry_count+1 ELSE retry_count END,
               last_error_code=$4, reconciliation_state=$5,
               updated_at=transaction_timestamp()
           WHERE id=$1 RETURNING *`,
          [session.id, to, action === "interrupt", action === "interrupt" ? "FAKE_INTERRUPTED" : null,
            action === "ambiguous" ? "REQUIRED" : session.reconciliationState],
        );
        if (!updatedSession.rows[0]) return Object.freeze({ code: "CONFLICT", record, session });
        const nextIntentState = action === "interrupt" ? "INTERRUPTED"
          : action === "resume" ? "UPLOADING" : "RECONCILING";
        const updatedRecord = await connection.query<Row>(
          `UPDATE workflow.publication_intents
           SET state=$3, revision=revision+1, updated_at=transaction_timestamp(),
               upload_session=$4::jsonb, last_error=$5,
               reconciliation_state=$6
           WHERE owner_uid=$1 AND id=$2 RETURNING *`,
          [ownerUid, publicationId, nextIntentState, JSON.stringify({
            sessionId: session.id, attemptId: session.attemptId, state: to,
            transport: FAKE_UPLOAD_TRANSPORT, totalBytes: session.totalBytes,
            uploadedBytes: session.confirmedOffset, chunkBytes: session.chunkBytes,
            totalChunks: session.totalChunks, confirmedChunks: session.confirmedChunks,
            retryCount: session.retryCount + (action === "interrupt" ? 1 : 0),
            sessionRef: session.sessionRef,
          }), action === "interrupt" ? "FAKE_TRANSPORT_INTERRUPTED" : null,
          action === "ambiguous" ? "REQUIRED" : session.reconciliationState],
        );
        await connection.query(
          `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
           VALUES ($1,$2,$3,$4)`,
          [publicationId, ownerUid, nextIntentState, `fake-upload:${action}`],
        );
        const next = updatedRecord.rows[0] ? decodePublicationRecord(updatedRecord.rows[0]) : undefined;
        const nextSession = await readSession(connection, ownerUid, publicationId);
        if (!next || !nextSession) return Object.freeze({ code: "INVALID_STATE", record });
        return Object.freeze({ code: "APPLIED", record: next, session: nextSession });
      });
    },
  });
}

export type PublicationUploadRepository = ReturnType<typeof createPublicationUploadRepository>;
