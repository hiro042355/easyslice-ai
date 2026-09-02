import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { SessionId } from "../../lib/server/productionIdentity/types";
import { PostgreSQLConnectionPoolAdapter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";
import {
  PostgresqlProductionWorkflowApiCsrfAuthority,
  PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_DECIMAL,
  PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_HEX,
  deriveProductionWorkflowApiCsrfSessionLockKey,
} from "../../lib/server/workflowApi/postgresqlProductionWorkflowApiCsrfAuthority";
import type {
  ProductionWorkflowApiCsrfDigest,
  ProductionWorkflowApiCsrfPersistenceMaterial,
  ProductionWorkflowApiCsrfTokenId,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfTypes";

const session = (value: string) => value as SessionId;
const tokenId = (value: number): ProductionWorkflowApiCsrfTokenId => {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(value, 12);
  return bytes.toString("base64url") as ProductionWorkflowApiCsrfTokenId;
};
const digest = (value: number) => Uint8Array.from({ length: 32 }, (_, index) => (value + index) & 255) as ProductionWorkflowApiCsrfDigest;
const material = (id: number, sessionId: SessionId, issuedAt: number, expiresAt = issuedAt + 1_800_000): ProductionWorkflowApiCsrfPersistenceMaterial => Object.freeze({
  materialVersion: "1.0",
  tokenId: tokenId(id),
  digest: digest(id),
  digestAlgorithm: "sha256",
  digestVersion: "csrf-digest-v1",
  sessionId,
  issuedAt,
  expiresAt,
  lifecycleState: "active",
});

test("CSRF advisory-lock V1 freezes namespace and deterministic signed-int32 vectors", () => {
  assert.equal(PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_DECIMAL, 1_129_534_022);
  assert.equal(PRODUCTION_WORKFLOW_API_CSRF_ADVISORY_LOCK_NAMESPACE_HEX, "0x43535246");
  assert.deepEqual([
    deriveProductionWorkflowApiCsrfSessionLockKey(session("session")),
    deriveProductionWorkflowApiCsrfSessionLockKey(session("trusted-session")),
    deriveProductionWorkflowApiCsrfSessionLockKey(session("Session")),
    deriveProductionWorkflowApiCsrfSessionLockKey(session(" session")),
  ], [1_060_827_628, 565_406_523, 1_767_486_485, -384_412_886]);
  assert.notEqual(deriveProductionWorkflowApiCsrfSessionLockKey(session("Session")), deriveProductionWorkflowApiCsrfSessionLockKey(session("session")));
  assert.equal(deriveProductionWorkflowApiCsrfSessionLockKey(session("trusted-session")), deriveProductionWorkflowApiCsrfSessionLockKey(session("trusted-session")));
});

test("V000007 statically freezes the minimal security schema without secret or cleanup authority", async () => {
  const sql = await readFile("db/workflow/migrations/V000007__add_production_workflow_api_csrf_authority.sql", "utf8");
  assert.match(sql, /CREATE TABLE workflow\.production_workflow_api_csrf_tokens/iu);
  assert.match(sql, /token_id bytea PRIMARY KEY/iu);
  assert.match(sql, /octet_length\(token_id\) = 16/iu);
  assert.match(sql, /session_id text NOT NULL/iu);
  assert.match(sql, /length\(session_id\) > 0/iu);
  assert.match(sql, /digest_algorithm = 'sha256'/iu);
  assert.match(sql, /digest_version = 'csrf-digest-v1'/iu);
  assert.match(sql, /octet_length\(digest\) = 32/iu);
  assert.match(sql, /expires_at <= issued_at \+ interval '30 minutes'/iu);
  assert.match(sql, /lifecycle_state = 'active' AND revoked_at IS NULL/iu);
  assert.match(sql, /lifecycle_state = 'revoked' AND revoked_at IS NOT NULL/iu);
  assert.match(sql, /revision bigint NOT NULL DEFAULT 0/iu);
  assert.match(sql, /revision >= 0/iu);
  assert.match(sql, /\(session_id, issued_at, token_id\)[\s\S]*WHERE lifecycle_state = 'active'/iu);
  assert.doesNotMatch(sql, /raw_token|raw_secret|user_id|email|browser|cleanup|retention/iu);
  assert.equal((sql.match(/CREATE INDEX/gu) ?? []).length, 1);
});

test("V000007 and PostgreSQL CSRF authority preserve schema, ceiling, revisions, isolation, rollback, and restart authority", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    assert.equal(environment.flyway.migrate.succeeded, true);
    assert.equal(environment.flyway.validate.succeeded, true);
    const columns = await environment.pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name,data_type,is_nullable FROM information_schema.columns
       WHERE table_schema='workflow' AND table_name='production_workflow_api_csrf_tokens' ORDER BY ordinal_position`,
    );
    assert.deepEqual(columns.rows.map((row) => [row.column_name, row.data_type, row.is_nullable]), [
      ["token_id", "bytea", "NO"], ["session_id", "text", "NO"], ["digest_algorithm", "text", "NO"],
      ["digest_version", "text", "NO"], ["digest", "bytea", "NO"], ["issued_at", "timestamp with time zone", "NO"],
      ["expires_at", "timestamp with time zone", "NO"], ["lifecycle_state", "text", "NO"],
      ["revoked_at", "timestamp with time zone", "YES"], ["revision", "bigint", "NO"],
    ]);
    const indexes = await environment.pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='workflow'
       AND tablename='production_workflow_api_csrf_tokens' ORDER BY indexname`,
    );
    assert.equal(indexes.rows.length, 2);
    assert.match(indexes.rows.find((row) => row.indexname === "ix_production_workflow_api_csrf_tokens_active_session")?.indexdef ?? "", /session_id, issued_at, token_id.*WHERE.*lifecycle_state.*active/iu);
    assert.equal(columns.rows.some((row) => /raw|secret/iu.test(row.column_name)), false);

    const pool = new PostgreSQLConnectionPoolAdapter({ ...environment.connection, maxConnections: 8, connectionTimeoutMs: 5_000, idleTimeoutMs: 5_000, queryTimeoutMs: 10_000, applicationName: "csrf-authority-test", tls: { mode: "disabled" } });
    assert.equal(await pool.start(), "ready");
    const firstAdapter = new PostgresqlProductionWorkflowApiCsrfAuthority(pool);
    const secondAdapter = new PostgresqlProductionWorkflowApiCsrfAuthority(pool);
    const sameSession = session("exact-session");
    const now = Date.now() - 60_000;

    for (let id = 1; id <= 4; id += 1) {
      const issued = await firstAdapter.issueWithAtomicCeiling(material(id, sameSession, now + id));
      assert.equal(issued.status, "issued");
      if (issued.status === "issued") assert.equal(issued.revision, "0");
    }
    const fifth = await firstAdapter.issueWithAtomicCeiling(material(5, sameSession, now + 5));
    assert.equal(fifth.status, "issued");
    if (fifth.status === "issued") {
      assert.equal(fifth.revision, "0");
      assert.equal(fifth.revokedOldestTokenId, tokenId(1));
    }
    const state = await environment.pool.query<{ token: string; lifecycle_state: string; revision: string }>(
      `SELECT encode(token_id,'base64') token,lifecycle_state,revision::text revision
       FROM workflow.production_workflow_api_csrf_tokens WHERE session_id=$1 ORDER BY issued_at,token_id`, [sameSession],
    );
    assert.deepEqual(state.rows.map((row) => [Buffer.from(row.token, "base64").toString("base64url"), row.lifecycle_state, row.revision]), [
      [tokenId(1), "revoked", "1"], [tokenId(2), "active", "0"], [tokenId(3), "active", "0"], [tokenId(4), "active", "0"], [tokenId(5), "active", "0"],
    ]);
    assert.equal((await environment.pool.query("SELECT count(*)::int count FROM workflow.production_workflow_api_csrf_tokens WHERE session_id=$1 AND lifecycle_state='active' AND transaction_timestamp()<expires_at", [sameSession])).rows[0]?.count, 4);

    const valid = await secondAdapter.validate({ sessionId: sameSession, tokenId: tokenId(5), digest: digest(5), now });
    assert.deepEqual(valid, { status: "valid", revision: "0" });
    assert.equal((await secondAdapter.validate({ sessionId: session("other"), tokenId: tokenId(5), digest: digest(5), now })).status, "wrong-session");
    assert.equal((await secondAdapter.validate({ sessionId: sameSession, tokenId: tokenId(5), digest: digest(99), now })).status, "invalid");
    assert.equal((await secondAdapter.validate({ sessionId: sameSession, tokenId: tokenId(1), digest: digest(1), now })).status, "revoked");

    assert.deepEqual(await firstAdapter.revokeToken({ sessionId: sameSession, tokenId: tokenId(2), now }), { status: "revoked", revokedCount: 1 });
    assert.deepEqual(await firstAdapter.revokeToken({ sessionId: sameSession, tokenId: tokenId(2), now }), { status: "not-found" });
    assert.equal((await environment.pool.query("SELECT revision::text revision FROM workflow.production_workflow_api_csrf_tokens WHERE token_id=$1", [Buffer.from(tokenId(2), "base64url")])).rows[0]?.revision, "1");

    const expiredSession = session("expired-session");
    await environment.pool.query(
      `INSERT INTO workflow.production_workflow_api_csrf_tokens
       (token_id,session_id,digest_algorithm,digest_version,digest,issued_at,expires_at,lifecycle_state,revision)
       VALUES ($1,$2,'sha256','csrf-digest-v1',$3,transaction_timestamp()-interval '20 minutes',transaction_timestamp()-interval '1 minute','active',0)`,
      [Buffer.from(tokenId(20), "base64url"), expiredSession, Buffer.from(digest(20))],
    );
    assert.equal((await firstAdapter.validate({ sessionId: expiredSession, tokenId: tokenId(20), digest: digest(20), now })).status, "expired");
    assert.equal((await firstAdapter.issueWithAtomicCeiling(material(21, expiredSession, now))).status, "issued");
    assert.equal((await environment.pool.query("SELECT revision::text revision,lifecycle_state FROM workflow.production_workflow_api_csrf_tokens WHERE token_id=$1", [Buffer.from(tokenId(20), "base64url")])).rows[0]?.revision, "0");
    assert.deepEqual(await firstAdapter.revokeSession({ sessionId: expiredSession, now }), { status: "revoked", revokedCount: 2 });
    const expiredRows = await environment.pool.query("SELECT lifecycle_state,revision::text revision FROM workflow.production_workflow_api_csrf_tokens WHERE session_id=$1 ORDER BY token_id", [expiredSession]);
    assert.deepEqual(expiredRows.rows, [{ lifecycle_state: "revoked", revision: "1" }, { lifecycle_state: "revoked", revision: "1" }]);
    assert.deepEqual(await firstAdapter.revokeSession({ sessionId: expiredSession, now }), { status: "not-found" });

    const rollbackSession = session("rollback-session");
    for (let id = 30; id <= 33; id += 1) assert.equal((await firstAdapter.issueWithAtomicCeiling(material(id, rollbackSession, now + id))).status, "issued");
    const duplicate = await firstAdapter.issueWithAtomicCeiling(material(33, rollbackSession, now + 40));
    assert.equal(duplicate.status, "unavailable");
    const rollbackRows = await environment.pool.query("SELECT lifecycle_state,revision::text revision FROM workflow.production_workflow_api_csrf_tokens WHERE session_id=$1 ORDER BY issued_at,token_id", [rollbackSession]);
    assert.equal(rollbackRows.rowCount, 4);
    assert.deepEqual(rollbackRows.rows, Array.from({ length: 4 }, () => ({ lifecycle_state: "active", revision: "0" })));

    const concurrentSession = session("concurrent-session");
    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? firstAdapter : secondAdapter).issueWithAtomicCeiling(material(100 + index, concurrentSession, now + 100 + index))));
    assert.equal(concurrent.every((result) => result.status === "issued"), true);
    assert.equal((await environment.pool.query("SELECT count(*)::int count FROM workflow.production_workflow_api_csrf_tokens WHERE session_id=$1 AND lifecycle_state='active' AND transaction_timestamp()<expires_at", [concurrentSession])).rows[0]?.count, 4);
    assert.equal(await pool.close(), "closed");
  });
});
