import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const EXPECTED_TABLES = [
  "workflow_completion_states",
  "workflow_final_results",
  "workflow_outbox_events",
  "workflow_reconciliation_manual_repairs",
  "workflow_reconciliation_observations",
  "workflow_reconciliation_outbox_events",
  "workflow_reconciliation_requests",
  "workflow_reconciliation_resolutions",
  "workflow_result_references",
  "workflow_schema_metadata",
  "workflow_writer_epochs",
];

const EXPECTED_INDEXES = [
  "workflow_final_results_expiry_idx",
  "workflow_final_results_lifecycle_idx",
  "workflow_outbox_events_claim_poll_idx",
  "workflow_outbox_events_result_fk_idx",
  "workflow_result_references_expiry_idx",
  "workflow_result_references_result_fk_idx",
  "workflow_writer_epochs_one_active_uq",
];

test("migrates an empty database and exposes the Slice A catalog", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const tables = await environment.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'workflow' ORDER BY table_name",
    );
    assert.deepEqual(tables.rows.map((row) => row.table_name), EXPECTED_TABLES);

    const replayTable = await environment.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'multi_cut_replay_records_v2'",
    );
    assert.deepEqual(replayTable.rows, [
      { table_name: "multi_cut_replay_records_v2" },
    ]);

    const indexes = await environment.pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'workflow' ORDER BY indexname",
    );
    const names = indexes.rows.map((row) => row.indexname);
    for (const expected of EXPECTED_INDEXES) assert.equal(names.includes(expected), true, expected);

    const constraints = await environment.pool.query<{ constraint_name: string; constraint_type: string }>(
      "SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'workflow' ORDER BY constraint_name",
    );
    assert.equal(constraints.rows.filter((row) => row.constraint_type === "CHECK").length >= 30, true);
    assert.deepEqual(
      constraints.rows.filter((row) => row.constraint_type === "FOREIGN KEY").map((row) => row.constraint_name),
      [
        "workflow_outbox_events_result_fk",
        "workflow_reconciliation_manual_repairs_request_fk",
        "workflow_reconciliation_observations_request_fk",
        "workflow_reconciliation_outbox_events_request_fk",
        "workflow_reconciliation_resolutions_request_fk",
        "workflow_result_references_result_fk",
      ],
    );

    const revisions = await environment.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'workflow' AND column_name = 'revision' ORDER BY table_name",
    );
    assert.deepEqual(revisions.rows.map((row) => row.table_name), [
      "workflow_completion_states",
      "workflow_final_results",
      "workflow_outbox_events",
      "workflow_reconciliation_manual_repairs",
      "workflow_reconciliation_outbox_events",
      "workflow_reconciliation_requests",
      "workflow_result_references",
      "workflow_writer_epochs",
    ]);

    const metadata = await environment.pool.query<{ schema_contract_major: number; migration_head_identifier: string }>(
      "SELECT schema_contract_major, migration_head_identifier FROM workflow.workflow_schema_metadata WHERE metadata_key = 'slice-a'",
    );
    assert.deepEqual(metadata.rows[0], { schema_contract_major: 1, migration_head_identifier: "V000002" });
  });
});

test("replay is idempotent, validate succeeds, and migration version is unique", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const replay = await environment.replayMigrations();
    const validate = await environment.validateMigrations();
    assert.equal(replay.succeeded, true);
    assert.equal(validate.succeeded, true);

    const history = await environment.pool.query<{ version: string; success: boolean }>(
      "SELECT version, success FROM public.flyway_schema_history WHERE type = 'SQL' ORDER BY installed_rank",
    );
    assert.deepEqual(history.rows, [
      { version: "000001", success: true },
      { version: "000002", success: true },
      { version: "000003", success: true },
      { version: "000004", success: true },
      { version: "000005", success: true },
    ]);
  });
});
