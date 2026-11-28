import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { startPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { PostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment/foundation";

// Audit of V000037 against a throwaway PostgreSQL container. No Staging, Production
// or user database is involved; every environment is removed when its test ends.

const NEW_TABLES = [
  "publication_adapter_leases",
  "publication_adapter_rate_limits",
  "publication_reconciliation_attempts",
] as const;

async function history(pool: Pool): Promise<Array<{ version: string; success: boolean; checksum: number | null }>> {
  const result = await pool.query<{ version: string; success: boolean; checksum: number | null }>(
    "SELECT version, success, checksum FROM public.flyway_schema_history WHERE type = 'SQL' ORDER BY installed_rank",
  );
  return result.rows;
}

async function headIdentifier(pool: Pool): Promise<string> {
  const result = await pool.query<{ migration_head_identifier: string }>(
    "SELECT migration_head_identifier FROM workflow.workflow_schema_metadata WHERE metadata_key = 'slice-a'",
  );
  return result.rows[0].migration_head_identifier;
}

async function columnSnapshot(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ line: string }>(
    `SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS line
       FROM information_schema.columns WHERE table_schema = 'workflow' ORDER BY 1`,
  );
  return result.rows.map(row => row.line);
}

async function tableNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'workflow' AND table_name = ANY($1) ORDER BY 1",
    [NEW_TABLES],
  );
  return result.rows.map(row => row.table_name);
}

async function expectRejected(pool: Pool, sql: string, params: unknown[] = []): Promise<void> {
  await assert.rejects(pool.query(sql, params), "statement must be rejected by a constraint");
}

async function withEnvironment<T>(
  options: Readonly<{ migrationTarget?: string }>,
  run: (environment: PostgreSqlTestEnvironment) => Promise<T>,
): Promise<T> {
  const environment = await startPostgreSqlTestEnvironment(options);
  try {
    return await run(environment);
  } finally {
    await environment.stop();
  }
}

test("V000037 on a fresh database creates three additive tables with their keys, indexes and checks", async () => {
  await withEnvironment({}, async ({ pool, flyway, validateMigrations, replayMigrations }) => {
    assert.equal(flyway.migrate.succeeded, true);
    assert.equal(flyway.validate.succeeded, true, "Flyway validate passes, so checksums of applied migrations match");
    assert.equal(await headIdentifier(pool), "V000037");

    const applied = await history(pool);
    const v37 = applied.find(row => row.version === "000037");
    assert.ok(v37?.success, "V000037 is recorded as a successful Flyway migration");
    assert.equal(applied.filter(row => !row.success).length, 0, "no failed migration rows in history");

    assert.deepEqual(await tableNames(pool), [...NEW_TABLES].sort());

    const fk = await pool.query<{ referenced: string; on_delete: string }>(
      `SELECT confrelid::regclass::text AS referenced, confdeltype::text AS on_delete
         FROM pg_constraint WHERE conrelid = 'workflow.publication_reconciliation_attempts'::regclass AND contype = 'f'`,
    );
    assert.deepEqual(fk.rows, [{ referenced: "workflow.publication_intents", on_delete: "c" }], "FK to publication_intents with ON DELETE CASCADE");

    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'workflow' AND tablename LIKE 'publication_adapter%' OR tablename = 'publication_reconciliation_attempts' ORDER BY 1",
    );
    assert.deepEqual(
      indexes.rows.map((row: { indexname: string }) => row.indexname),
      [
        "publication_adapter_leases_expiry_idx",
        "publication_adapter_leases_pkey",
        "publication_adapter_rate_limits_pkey",
        "publication_reconciliation_attempts_checked_idx",
        "publication_reconciliation_attempts_pkey",
      ],
    );

    await expectRejected(pool, "INSERT INTO workflow.publication_adapter_rate_limits VALUES ('t', 'DELETE', now(), 1)");
    await expectRejected(pool, "INSERT INTO workflow.publication_adapter_rate_limits VALUES ('t', 'PUBLISH', now(), -1)");
    await expectRejected(pool, "INSERT INTO workflow.publication_adapter_leases VALUES ('t', 'l1', now(), now())");
    await expectRejected(pool, "INSERT INTO workflow.publication_adapter_leases VALUES ('t', '', now(), now() + interval '1 minute')");

    const rerun = await replayMigrations();
    assert.equal(rerun.succeeded, true, "re-running migrate on an up-to-date database is a no-op");
    assert.equal((await history(pool)).length, applied.length, "re-run adds no history rows");
    assert.equal((await validateMigrations()).succeeded, true);
  });
});

test("V000037 applied to an existing V000036 database changes nothing that already existed", async () => {
  await withEnvironment({ migrationTarget: "000036" }, async ({ pool, replayMigrations }) => {
    assert.equal(await headIdentifier(pool), "V000036");
    assert.deepEqual(await tableNames(pool), [], "the new tables do not exist before V000037");
    const beforeHistory = await history(pool);
    const beforeColumns = await columnSnapshot(pool);
    assert.ok(beforeHistory.every(row => row.success), "every V000036 history row succeeded");
    assert.equal(beforeHistory.some(row => row.version === "000037"), false);

    const upgraded = await replayMigrations();
    assert.equal(upgraded.succeeded, true);

    const afterHistory = await history(pool);
    const afterByVersion = new Map(afterHistory.map(row => [row.version, row]));
    for (const before of beforeHistory) {
      assert.deepEqual(afterByVersion.get(before.version), before, `V${before.version} checksum and status are unchanged`);
    }
    assert.equal(afterByVersion.get("000037")?.success, true);

    const afterColumns = await columnSnapshot(pool);
    const added = afterColumns.filter(line => !beforeColumns.includes(line));
    const removed = beforeColumns.filter(line => !afterColumns.includes(line));
    assert.deepEqual(removed, [], "no existing column is removed or altered");
    assert.deepEqual([...new Set(added.map(line => line.split(".")[0]))].sort(), [...NEW_TABLES].sort(), "only the three new tables are added");
    assert.equal(await headIdentifier(pool), "V000037");
  });
});

test("a failed V000037 apply rolls back every statement and leaves the head at V000036", async () => {
  await withEnvironment({ migrationTarget: "000036" }, async ({ pool, replayMigrations }) => {
    // A pre-existing table with the same name but no checked_at column makes the
    // index statement fail after the first two tables have already been created.
    await pool.query("CREATE TABLE workflow.publication_reconciliation_attempts (unrelated integer)");
    await assert.rejects(replayMigrations(), "a conflicting object makes V000037 fail");

    assert.deepEqual(await tableNames(pool), ["publication_reconciliation_attempts"], "the two earlier-created tables were rolled back");
    assert.equal(await headIdentifier(pool), "V000036", "metadata head is not advanced by a failed apply");
    const v37 = (await history(pool)).find(row => row.version === "000037");
    assert.notEqual(v37?.success, true, "the failed migration is not recorded as successful");
  });
});
