import assert from "node:assert/strict";
import test from "node:test";
import { projectReconciliationAtomicConflictV1 } from "@/lib/server/productionWorkflowRuntime/reconciliation";
import { normalizeExpectedPriorStates } from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";

test("expected prior states are non-empty, unique, non-terminal, normalized and mutation isolated", () => {
  assert.deepEqual(normalizeExpectedPriorStates("claimed"), ["claimed"]);
  const source = ["claimed", "observing"];
  const normalized = normalizeExpectedPriorStates(source);
  source[0] = "resolved";
  assert.deepEqual(normalized, ["claimed", "observing"]);
  assert.equal(Object.isFrozen(normalized), true);
  for (const invalid of [[], ["claimed", "claimed"], ["resolved"], ["unknown"], null]) assert.equal(normalizeExpectedPriorStates(invalid), undefined);
});

test("atomic conflict projector preserves every safe class without a database read", () => {
  assert.deepEqual([projectReconciliationAtomicConflictV1("stale-revision"), projectReconciliationAtomicConflictV1("stale-fence"), projectReconciliationAtomicConflictV1("writer-epoch-mismatch"), projectReconciliationAtomicConflictV1("wrong-prior-state"), projectReconciliationAtomicConflictV1("semantic-conflict"), projectReconciliationAtomicConflictV1("terminal-preserved")], ["authoritative-reread", "stop-stale-worker", "wait-for-writer-authority", "reevaluate-state", "fail-conflict", "preserve-terminal"]);
});
