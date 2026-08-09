import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decideWorkflowCompletionTransactionCleanupV1,
  type WorkflowCompletionTransactionCleanupDecisionInputV1,
} from "../../../lib/server/workflowCompletionTransactionCleanup";

test("query failure cleanup is exhaustive and deterministic", () => {
  const matrix = [
    ["safe-to-reuse", "rollback-then-release"],
    ["must-rollback-before-reuse", "rollback-then-discard-on-failure"],
    ["must-discard", "discard"],
    ["unknown", "discard"],
  ] as const;
  for (const [queryConnectionDisposition, action] of matrix) {
    const input = Object.freeze({
      inputVersion: "1.0",
      phase: "query-failure",
      queryConnectionDisposition,
    } as const);
    const first = decideWorkflowCompletionTransactionCleanupV1(input);
    const second = decideWorkflowCompletionTransactionCleanupV1(input);
    assert.deepEqual(first, second);
    assert.equal(first.action, action);
    assert.equal(first.connectionDisposition, queryConnectionDisposition);
    assert.equal(first.decisionOwnsExecution, false);
    assert.equal(first.retryPermitted, false);
    assert.equal(first.recoveryExecuted, false);
    assert.equal(Object.isFrozen(first), true);
  }
});

test("every commit variant has an explicit cleanup decision", () => {
  const variants = [
    ["committed", "safe-to-reuse", "release", false],
    ["definitely-rolled-back", "safe-to-reuse", "release", false],
    ["unknown-outcome", "must-discard", "discard", true],
    ["invalid-state", "unknown", "discard", false],
    ["connection-unavailable", "must-discard", "discard", false],
  ] as const;
  for (const [status, connectionDisposition, action, reconciliationRequired] of variants) {
    const decision = decideWorkflowCompletionTransactionCleanupV1(Object.freeze({
      inputVersion: "1.0",
      phase: "commit-result",
      result: Object.freeze({ status, resultVersion: "2.0", connectionDisposition }),
    }));
    assert.equal(decision.action, action);
    assert.equal(decision.reconciliationRequired, reconciliationRequired);
  }
});

test("every rollback variant has an explicit cleanup decision", () => {
  const variants = [
    ["rolled-back", "safe-to-reuse", "release"],
    ["not-required", "safe-to-reuse", "release"],
    ["invalid-state", "unknown", "discard"],
    ["connection-lost", "must-discard", "discard"],
    ["rollback-failed", "must-discard", "discard"],
  ] as const;
  for (const [status, connectionDisposition, action] of variants) {
    const decision = decideWorkflowCompletionTransactionCleanupV1(Object.freeze({
      inputVersion: "1.0",
      phase: "rollback-result",
      result: Object.freeze({ status, resultVersion: "2.0", connectionDisposition }),
    }));
    assert.equal(decision.action, action);
    assert.equal(decision.reconciliationRequired, false);
  }
});

test("complete lifecycle evidence cannot omit disposition", () => {
  const accepts = (_input: WorkflowCompletionTransactionCleanupDecisionInputV1): void => {
    void _input;
  };
  // @ts-expect-error Complete commit evidence requires disposition.
  accepts({ inputVersion: "1.0", phase: "commit-result", result: { status: "committed", resultVersion: "2.0" } });
  // @ts-expect-error Complete rollback evidence requires disposition.
  accepts({ inputVersion: "1.0", phase: "rollback-result", result: { status: "rolled-back", resultVersion: "2.0" } });
  assert.equal(typeof accepts, "function");
});

test("decision contract contains no execution, retry, recovery, SQL, or raw error", async () => {
  const source = await readFile(
    new URL("../../../lib/server/workflowCompletionTransactionCleanup/contract.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\.(?:commit|rollback|release|discard|execute|query)\s*\(/);
  assert.doesNotMatch(source, /(?:from\s+["']pg["']|SELECT|UPDATE|INSERT|DELETE|raw Error|stack)/);
  assert.doesNotMatch(source, /\bdefault\s*:/);
});
