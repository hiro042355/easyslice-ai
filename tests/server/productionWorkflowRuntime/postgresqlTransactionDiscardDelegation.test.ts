import assert from "node:assert/strict";
import test from "node:test";
import { PostgreSQLTransactionConnectionAdapter } from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver/postgresqlTransactionConnection";

const client = Object.freeze({ query: async () => Object.freeze({}) });
const execute = async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" } as const);

test("V2 lifecycle delegates discard once and exposes no cleanup internals", () => {
  let calls = 0;
  const transaction = new PostgreSQLTransactionConnectionAdapter(
    client as never,
    execute,
    () => undefined,
    () => { calls += 1; },
  );
  assert.equal(transaction.lifecycleVersion, "2.0");
  assert.deepEqual(transaction.discard(), { status: "discarded" });
  assert.deepEqual(transaction.discard(), { status: "discarded" });
  assert.equal(calls, 1);
  assert.equal("client" in Object.freeze({ lifecycleVersion: transaction.lifecycleVersion, discard: () => transaction.discard() }), false);
});

test("discard failure is safe and does not retry", () => {
  let calls = 0;
  const transaction = new PostgreSQLTransactionConnectionAdapter(
    client as never,
    execute,
    () => undefined,
    () => { calls += 1; throw new Error("private"); },
  );
  assert.deepEqual(transaction.discard(), {
    status: "discard-failure",
    safeReason: "postgresql-discard-failed",
  });
  assert.equal(calls, 1);
});
