import { createHash } from "node:crypto";

import type { SessionId } from "../productionIdentity/types";
import type {
  PostgreSQLConnection,
  PostgreSQLConnectionPool,
  PostgreSQLParameter,
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLRow,
  PostgreSQLTransactionConnectionV4,
} from "../productionWorkflowRuntime/postgresqlDriver/types";
import { compareProductionWorkflowApiCsrfDigests } from "./productionWorkflowApiCsrfToken";
import type {
  ProductionWorkflowApiCsrfAuthority,
  ProductionWorkflowApiCsrfIssueResult,
  ProductionWorkflowApiCsrfPersistenceMaterial,
  ProductionWorkflowApiCsrfRevision,
  ProductionWorkflowApiCsrfRevocationResult,
  ProductionWorkflowApiCsrfTokenId,
  ProductionWorkflowApiCsrfValidationInput,
  ProductionWorkflowApiCsrfValidationResult,
} from "./productionWorkflowApiCsrfTypes";

/** ASCII "CSRF". This is coordination namespace, not authentication authority. */
export const PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_DECIMAL = 1_129_534_022 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_HEX = "0x43535246" as const;

export function deriveProductionWorkflowApiCsrfSessionLockKey(sessionId: SessionId): number {
  const digest = createHash("sha256").update(sessionId, "utf8").digest();
  return digest.readInt32BE(0);
}

const stringParameter = (value: string): PostgreSQLParameter => Object.freeze({ kind: "string", value });
const bytesParameter = (value: Uint8Array): PostgreSQLParameter => Object.freeze({ kind: "bytea", value });
const timestampParameter = (value: number): PostgreSQLParameter =>
  Object.freeze({ kind: "utc-timestamp", value: new Date(value).toISOString() });
const integerParameter = (value: number): PostgreSQLParameter => Object.freeze({ kind: "safe-integer", value });

function request(
  statementId: string,
  text: string,
  values: readonly PostgreSQLParameter[],
  expectedResult: PostgreSQLQueryRequest["expectedResult"],
): PostgreSQLQueryRequest {
  return Object.freeze({ statementId, text, values: Object.freeze(values), expectedResult });
}

function decodeTokenId(tokenId: ProductionWorkflowApiCsrfTokenId): Uint8Array | undefined {
  if (typeof tokenId !== "string" || tokenId.length !== 22 || !/^[A-Za-z0-9_-]{22}$/u.test(tokenId)) return undefined;
  const decoded = Buffer.from(tokenId, "base64url");
  return decoded.byteLength === 16 && decoded.toString("base64url") === tokenId
    ? new Uint8Array(decoded)
    : undefined;
}

function encodeTokenId(value: unknown): ProductionWorkflowApiCsrfTokenId | undefined {
  return value instanceof Uint8Array && value.byteLength === 16
    ? Buffer.from(value).toString("base64url") as ProductionWorkflowApiCsrfTokenId
    : undefined;
}

function canonicalRevision(value: unknown): ProductionWorkflowApiCsrfRevision | undefined {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const maximum = "9223372036854775807";
  if (value.length > maximum.length || (value.length === maximum.length && value > maximum)) return undefined;
  return value as ProductionWorkflowApiCsrfRevision;
}

function queryFailed(result: PostgreSQLQueryResult): boolean {
  return result.status === "failure" || result.status === "cardinality-conflict";
}

async function acquireSessionLock(
  transaction: PostgreSQLTransactionConnectionV4,
  sessionId: SessionId,
): Promise<boolean> {
  const result = await transaction.query(request(
    "workflow-api.csrf.session-lock",
    "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
    [
      integerParameter(PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_DECIMAL),
      integerParameter(deriveProductionWorkflowApiCsrfSessionLockKey(sessionId)),
    ],
    "many",
  ));
  return result.status === "success";
}

async function rollbackAndRelease(transaction: PostgreSQLTransactionConnectionV4): Promise<void> {
  await transaction.rollbackV2();
  transaction.release();
}

async function begin(pool: PostgreSQLConnectionPool): Promise<
  | Readonly<{ connection: PostgreSQLConnection; transaction: PostgreSQLTransactionConnectionV4 }>
  | undefined
> {
  const connection = await pool.checkout();
  if ("status" in connection) return undefined;
  const transaction = await connection.begin();
  if ("status" in transaction) { connection.release(); return undefined; }
  return Object.freeze({ connection, transaction });
}

export class PostgresqlProductionWorkflowApiCsrfAuthority implements ProductionWorkflowApiCsrfAuthority {
  readonly authorityVersion = "1.0" as const;

  constructor(private readonly pool: PostgreSQLConnectionPool) {}

  async issueWithAtomicCeiling(
    material: ProductionWorkflowApiCsrfPersistenceMaterial,
  ): Promise<ProductionWorkflowApiCsrfIssueResult> {
    const tokenId = decodeTokenId(material.tokenId);
    if (!tokenId || material.digest.byteLength !== 32 || !Number.isSafeInteger(material.issuedAt)
      || !Number.isSafeInteger(material.expiresAt) || material.sessionId.length === 0) {
      return Object.freeze({ status: "malformed" });
    }
    const started = await begin(this.pool);
    if (!started) return Object.freeze({ status: "unavailable" });
    const { transaction } = started;
    try {
      if (!await acquireSessionLock(transaction, material.sessionId)) {
        await rollbackAndRelease(transaction); return Object.freeze({ status: "unavailable" });
      }
      const active = await transaction.query(request(
        "workflow-api.csrf.issue.active-valid",
        `SELECT token_id FROM workflow.production_workflow_api_csrf_tokens
         WHERE session_id=$1 AND lifecycle_state='active' AND transaction_timestamp() < expires_at
         ORDER BY issued_at ASC, token_id ASC FOR UPDATE`,
        [stringParameter(material.sessionId)], "many",
      ));
      if (active.status !== "success" || active.rows.length > 4) {
        await rollbackAndRelease(transaction);
        return Object.freeze({ status: active.status === "success" ? "malformed" : "unavailable" });
      }
      let revokedOldestTokenId: ProductionWorkflowApiCsrfTokenId | undefined;
      if (active.rows.length === 4) {
        const oldest = active.rows[0]?.token_id;
        revokedOldestTokenId = encodeTokenId(oldest);
        if (!revokedOldestTokenId || !(oldest instanceof Uint8Array)) {
          await rollbackAndRelease(transaction); return Object.freeze({ status: "malformed" });
        }
        const revoked = await transaction.query(request(
          "workflow-api.csrf.issue.revoke-oldest",
          `UPDATE workflow.production_workflow_api_csrf_tokens
           SET lifecycle_state='revoked', revoked_at=transaction_timestamp(), revision=revision+1
           WHERE token_id=$1 AND session_id=$2 AND lifecycle_state='active'
           RETURNING revision::text AS revision`,
          [bytesParameter(oldest), stringParameter(material.sessionId)], "single",
        ));
        if (revoked.status !== "success" || !canonicalRevision(revoked.rows[0]?.revision)) {
          await rollbackAndRelease(transaction); return Object.freeze({ status: "unavailable" });
        }
      }
      const inserted = await transaction.query(request(
        "workflow-api.csrf.issue.insert",
        `INSERT INTO workflow.production_workflow_api_csrf_tokens
         (token_id,session_id,digest_algorithm,digest_version,digest,issued_at,expires_at,lifecycle_state,revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',0)
         RETURNING revision::text AS revision`,
        [bytesParameter(tokenId), stringParameter(material.sessionId), stringParameter(material.digestAlgorithm),
          stringParameter(material.digestVersion), bytesParameter(material.digest), timestampParameter(material.issuedAt),
          timestampParameter(material.expiresAt)], "single",
      ));
      if (inserted.status !== "success") {
        await rollbackAndRelease(transaction); return Object.freeze({ status: "unavailable" });
      }
      const revision = canonicalRevision(inserted.rows[0]?.revision);
      if (!revision) { await rollbackAndRelease(transaction); return Object.freeze({ status: "malformed" }); }
      const committed = await transaction.commitV2();
      transaction.release();
      if (committed.status !== "committed") return Object.freeze({ status: "unavailable" });
      return Object.freeze({ status: "issued", tokenId: material.tokenId, expiresAt: material.expiresAt, revision,
        ...(revokedOldestTokenId ? { revokedOldestTokenId } : {}) });
    } catch {
      await rollbackAndRelease(transaction);
      return Object.freeze({ status: "unavailable" });
    }
  }

  async validate(input: ProductionWorkflowApiCsrfValidationInput): Promise<ProductionWorkflowApiCsrfValidationResult> {
    const tokenId = decodeTokenId(input.tokenId);
    if (!tokenId || input.digest.byteLength !== 32 || input.sessionId.length === 0 || !Number.isSafeInteger(input.now)) {
      return Object.freeze({ status: "malformed" });
    }
    const connection = await this.pool.checkout();
    if ("status" in connection) return Object.freeze({ status: "unavailable" });
    try {
      const result = await connection.query(request(
        "workflow-api.csrf.validate",
        `SELECT session_id,digest,lifecycle_state,
                (transaction_timestamp() >= expires_at) AS expired,
                revision::text AS revision
         FROM workflow.production_workflow_api_csrf_tokens WHERE token_id=$1`,
        [bytesParameter(tokenId)], "single",
      ));
      if (result.status === "not-found") return Object.freeze({ status: "invalid" });
      if (result.status !== "success") return Object.freeze({ status: "unavailable" });
      const row = result.rows[0] as PostgreSQLRow;
      if (row.session_id !== input.sessionId) return Object.freeze({ status: "wrong-session" });
      if (row.lifecycle_state === "revoked") return Object.freeze({ status: "revoked" });
      if (row.lifecycle_state !== "active") return Object.freeze({ status: "malformed" });
      if (row.expired === true) return Object.freeze({ status: "expired" });
      if (!(row.digest instanceof Uint8Array) || !compareProductionWorkflowApiCsrfDigests(row.digest, input.digest)) {
        return Object.freeze({ status: "invalid" });
      }
      const revision = canonicalRevision(row.revision);
      return revision ? Object.freeze({ status: "valid", revision }) : Object.freeze({ status: "malformed" });
    } finally { connection.release(); }
  }

  async revokeToken(input: Readonly<{ sessionId: SessionId; tokenId: ProductionWorkflowApiCsrfTokenId; now: number }>): Promise<ProductionWorkflowApiCsrfRevocationResult> {
    const tokenId = decodeTokenId(input.tokenId);
    if (!tokenId || input.sessionId.length === 0 || !Number.isSafeInteger(input.now)) return Object.freeze({ status: "malformed" });
    return this.revoke(input.sessionId, tokenId);
  }

  async revokeSession(input: Readonly<{ sessionId: SessionId; now: number }>): Promise<ProductionWorkflowApiCsrfRevocationResult> {
    if (input.sessionId.length === 0 || !Number.isSafeInteger(input.now)) return Object.freeze({ status: "malformed" });
    return this.revoke(input.sessionId);
  }

  private async revoke(sessionId: SessionId, tokenId?: Uint8Array): Promise<ProductionWorkflowApiCsrfRevocationResult> {
    const started = await begin(this.pool);
    if (!started) return Object.freeze({ status: "unavailable" });
    const { transaction } = started;
    try {
      if (!await acquireSessionLock(transaction, sessionId)) {
        await rollbackAndRelease(transaction); return Object.freeze({ status: "unavailable" });
      }
      const result = await transaction.query(request(
        tokenId ? "workflow-api.csrf.revoke-token" : "workflow-api.csrf.revoke-session",
        `UPDATE workflow.production_workflow_api_csrf_tokens
         SET lifecycle_state='revoked', revoked_at=transaction_timestamp(), revision=revision+1
         WHERE session_id=$1 AND lifecycle_state='active'${tokenId ? " AND token_id=$2" : ""}
         RETURNING revision::text AS revision`,
        tokenId ? [stringParameter(sessionId), bytesParameter(tokenId)] : [stringParameter(sessionId)], "many",
      ));
      if (queryFailed(result) || result.status !== "success") {
        await rollbackAndRelease(transaction); return Object.freeze({ status: "unavailable" });
      }
      const count = result.rowCount;
      if (count === 0) { await rollbackAndRelease(transaction); return Object.freeze({ status: "not-found" }); }
      if (result.rows.some((row) => !canonicalRevision(row.revision))) {
        await rollbackAndRelease(transaction); return Object.freeze({ status: "malformed" });
      }
      const committed = await transaction.commitV2();
      transaction.release();
      return committed.status === "committed"
        ? Object.freeze({ status: "revoked", revokedCount: count })
        : Object.freeze({ status: "unavailable" });
    } catch {
      await rollbackAndRelease(transaction);
      return Object.freeze({ status: "unavailable" });
    }
  }
}
