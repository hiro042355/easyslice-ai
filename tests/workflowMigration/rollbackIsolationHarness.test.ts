import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRollbackParameters,
  evaluateRecordEligibility,
  executeConservativeRollback,
  type ConnectionPool,
  type DatabaseClient,
  type SyntheticRecord,
} from "../../lib/workflowMigration/rollbackIsolationHarness";

const RUN_ID = "20261108T180000Z-e4a7b219";
const OWNER_UID = "staging-qa-runner-uid";

const baseRecord: SyntheticRecord = {
  owner_uid: OWNER_UID,
  idempotency_key: `test-run.${RUN_ID}.0001`,
  canonical_source_id: `synthetic.${RUN_ID}.0001`,
  normalized_url: `https://www.tiktok.com/@staging_test/video/${RUN_ID}.0001`,
  platform: "tiktok",
  job_id: null,
  media_id: null,
};

test("Scope B: Rollback record eligibility evaluation", () => {
  const params = buildRollbackParameters(RUN_ID, OWNER_UID);

  // 1. One valid synthetic row for the target run
  assert.equal(evaluateRecordEligibility(baseRecord, params), true);

  // 2. Multiple valid rows for the target run (different sequence)
  const valid2: SyntheticRecord = {
    ...baseRecord,
    idempotency_key: `test-run.${RUN_ID}.0002`,
    canonical_source_id: `synthetic.${RUN_ID}.0002`,
    normalized_url: `https://www.tiktok.com/@staging_test/video/${RUN_ID}.0002`,
  };
  assert.equal(evaluateRecordEligibility(valid2, params), true);

  // 3. Different RUN_ID
  const diffRun: SyntheticRecord = {
    ...baseRecord,
    idempotency_key: `test-run.20261109T000000Z-11223344.0001`,
    canonical_source_id: `synthetic.20261109T000000Z-11223344.0001`,
    normalized_url: `https://www.tiktok.com/@staging_test/video/20261109T000000Z-11223344.0001`,
  };
  assert.equal(evaluateRecordEligibility(diffRun, params), false);

  // 4. Sequence 0000 is rejected
  const zeroSeq: SyntheticRecord = {
    ...baseRecord,
    idempotency_key: `test-run.${RUN_ID}.0000`,
    canonical_source_id: `synthetic.${RUN_ID}.0000`,
    normalized_url: `https://www.tiktok.com/@staging_test/video/${RUN_ID}.0000`,
  };
  assert.equal(evaluateRecordEligibility(zeroSeq, params), false);

  // 5. Different owner UID
  assert.equal(evaluateRecordEligibility({ ...baseRecord, owner_uid: "other-user" }, params), false);

  // 6. Malformed idempotency key (missing prefix or trailing characters)
  assert.equal(evaluateRecordEligibility({ ...baseRecord, idempotency_key: `bad-prefix.${RUN_ID}.0001` }, params), false);
  assert.equal(evaluateRecordEligibility({ ...baseRecord, idempotency_key: `test-run.${RUN_ID}.0001_extra` }, params), false);

  // 7. Malformed canonical source ID
  assert.equal(evaluateRecordEligibility({ ...baseRecord, canonical_source_id: `bad-source.${RUN_ID}.0001` }, params), false);

  // 8. Malformed normalized URL
  assert.equal(evaluateRecordEligibility({ ...baseRecord, normalized_url: `https://www.youtube.com/watch?v=123` }, params), false);

  // 9. NULL identifier fields
  assert.equal(evaluateRecordEligibility({ ...baseRecord, owner_uid: null }, params), false);
  assert.equal(evaluateRecordEligibility({ ...baseRecord, idempotency_key: null }, params), false);
  assert.equal(evaluateRecordEligibility({ ...baseRecord, canonical_source_id: null }, params), false);
  assert.equal(evaluateRecordEligibility({ ...baseRecord, normalized_url: null }, params), false);

  // 10. Non-NULL job_id / media_id
  assert.equal(evaluateRecordEligibility({ ...baseRecord, job_id: "00000000-0000-0000-0000-000000000001" }, params), false);
  assert.equal(evaluateRecordEligibility({ ...baseRecord, media_id: "00000000-0000-0000-0000-000000000002" }, params), false);

  // 11. Mismatched sequence between key, source, and url
  const mismatchedSeq: SyntheticRecord = {
    ...baseRecord,
    idempotency_key: `test-run.${RUN_ID}.0001`,
    canonical_source_id: `synthetic.${RUN_ID}.0002`,
    normalized_url: `https://www.tiktok.com/@staging_test/video/${RUN_ID}.0001`,
  };
  assert.equal(evaluateRecordEligibility(mismatchedSeq, params), false);

  // 12. Non-tiktok platform
  assert.equal(evaluateRecordEligibility({ ...baseRecord, platform: "youtube" }, params), false);
});

test("Scope B & C: Conservative Rollback transaction states and failure handling", async () => {
  // State 1: BEGIN outcome uncertain / failure
  {
    let releasedWithDestroy: boolean | undefined;
    const mockClient: DatabaseClient = {
      async query(sql) {
        if (sql === "BEGIN;") throw new Error("connection-broken-during-begin");
        return { rows: [] };
      },
      release(destroy) {
        releasedWithDestroy = destroy;
      },
    };
    const mockPool: ConnectionPool = { async connect() { return mockClient; } };

    await assert.rejects(
      async () => executeConservativeRollback(mockPool, RUN_ID, OWNER_UID),
      /Failed to initiate transaction/,
    );
    assert.equal(releasedWithDestroy, true, "Connection must be destroyed on BEGIN failure");
  }

  // State 2: Precheck fails (ineligible rows detected) -> clean ROLLBACK
  {
    const executed: string[] = [];
    let releasedWithDestroy: boolean | undefined;
    const mockClient: DatabaseClient = {
      async query(sql) {
        executed.push(sql);
        if (sql === "PRECHECK_AUDIT") {
          return { rows: [{ total_tiktok: 2, ineligible_or_malformed_tiktok: 1, active_fk_references: 0 }] };
        }
        return { rows: [] };
      },
      release(destroy) {
        releasedWithDestroy = destroy;
      },
    };
    const mockPool: ConnectionPool = { async connect() { return mockClient; } };

    const res = await executeConservativeRollback(mockPool, RUN_ID, OWNER_UID);
    assert.equal(res.status, "aborted");
    assert.match(res.reason, /ineligible or malformed TikTok records found/);
    assert.ok(executed.includes("ROLLBACK;"), "Explicit ROLLBACK must be dispatched");
    assert.equal(releasedWithDestroy, undefined, "Healthy connection released normally after clean rollback");
  }

  // State 3: ROLLBACK failure after query error
  {
    let releasedWithDestroy: boolean | undefined;
    const mockClient: DatabaseClient = {
      async query(sql) {
        if (sql === "PRECHECK_AUDIT") throw new Error("query-timeout");
        if (sql === "ROLLBACK;") throw new Error("network-reset-during-rollback");
        return { rows: [] };
      },
      release(destroy) {
        releasedWithDestroy = destroy;
      },
    };
    const mockPool: ConnectionPool = { async connect() { return mockClient; } };

    await assert.rejects(
      async () => executeConservativeRollback(mockPool, RUN_ID, OWNER_UID),
      (err: any) => {
        assert.ok(err instanceof AggregateError);
        assert.match(err.message, /Transaction failed AND explicit ROLLBACK failed/);
        return true;
      },
    );
    assert.equal(releasedWithDestroy, true, "Connection must be destroyed when ROLLBACK fails");
  }

  // State 4: COMMIT outcome uncertain -> connection destroyed, no ROLLBACK issued
  {
    const executed: string[] = [];
    let releasedWithDestroy: boolean | undefined;
    const mockClient: DatabaseClient = {
      async query(sql) {
        executed.push(sql);
        if (sql === "PRECHECK_AUDIT") return { rows: [{ total_tiktok: 1, ineligible_or_malformed_tiktok: 0, active_fk_references: 0 }] };
        if (sql === "DELETE_SYNTHETIC") return { rows: [], rowCount: 1 };
        if (sql === "POSTCHECK_AUDIT") return { rows: [{ count: 0 }] };
        if (sql === "COMMIT;") throw new Error("socket-hangup-during-commit");
        return { rows: [] };
      },
      release(destroy) {
        releasedWithDestroy = destroy;
      },
    };
    const mockPool: ConnectionPool = { async connect() { return mockClient; } };

    await assert.rejects(
      async () => executeConservativeRollback(mockPool, RUN_ID, OWNER_UID),
      /COMMIT outcome uncertain/,
    );
    assert.equal(executed.includes("ROLLBACK;"), false, "ROLLBACK must NEVER be issued after failed COMMIT");
    assert.equal(releasedWithDestroy, true, "Connection must be destroyed after failed COMMIT");
  }

  // State 5: Successful rollback execution and constraint restoration
  {
    const executed: string[] = [];
    let releasedWithDestroy: boolean | undefined;
    const mockClient: DatabaseClient = {
      async query(sql) {
        executed.push(sql);
        if (sql === "PRECHECK_AUDIT") return { rows: [{ total_tiktok: 2, ineligible_or_malformed_tiktok: 0, active_fk_references: 0 }] };
        if (sql === "DELETE_SYNTHETIC") return { rows: [], rowCount: 2 };
        if (sql === "POSTCHECK_AUDIT") return { rows: [{ count: 0 }] };
        return { rows: [] };
      },
      release(destroy) {
        releasedWithDestroy = destroy;
      },
    };
    const mockPool: ConnectionPool = { async connect() { return mockClient; } };

    const res = await executeConservativeRollback(mockPool, RUN_ID, OWNER_UID);
    assert.deepEqual(res, { status: "success", deletedCount: 2 });
    assert.ok(executed.includes("BEGIN;"));
    assert.ok(executed.includes("DELETE_SYNTHETIC"));
    assert.ok(executed.includes("ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;"));
    assert.ok(executed.includes("ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube');"));
    assert.ok(executed.includes("COMMIT;"));
    assert.equal(releasedWithDestroy, undefined, "Healthy connection returned normally to pool");
  }
});
