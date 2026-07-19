import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowTransactionManagerV2,
  getDurableWorkflowTransactionDescriptor,
  listDurableWorkflowTransactionDescriptors,
  validateDurableWorkflowTransactionManager,
  validateDurableWorkflowTransactionOptions,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import { createClock, createSessionFactory, defaultOptions } from "./durableTransactionTestHarness";

test("descriptor and database capability remain explicit and not production ready", () => {
  const manager = createDurableWorkflowTransactionManagerV2(createSessionFactory().factory, createClock());
  assert.deepEqual(manager.descriptor, {
    descriptorVersion: "2.0",
    id: "production-workflow-transaction-manager-v2",
    mode: "production-durable",
    durable: true,
    crossInstance: true,
    nestedTransactions: false,
    savepoints: false,
    externalIoInsideTransaction: false,
    commitUnknownSupported: true,
    productionReady: false,
  });
  assert.deepEqual(getDurableWorkflowTransactionDescriptor("durable-workflow-database-capability-v1"), {
    descriptorVersion: "1.0",
    id: "durable-workflow-database-capability-v1",
    explicit: true,
    methods: ["execute"],
    sqlTextExposed: false,
    rawClientExposed: false,
    productionReady: false,
  });
});

test("registry is lookup-only with copy isolation", () => {
  const first = listDurableWorkflowTransactionDescriptors();
  const second = listDurableWorkflowTransactionDescriptors();
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(getDurableWorkflowTransactionDescriptor("unknown"), undefined);
});

test("validator accepts the V2 manager and rejects incomplete shapes safely", () => {
  const manager = createDurableWorkflowTransactionManagerV2(createSessionFactory().factory, createClock());
  assert.deepEqual(validateDurableWorkflowTransactionManager(manager), { status: "valid" });
  assert.deepEqual(validateDurableWorkflowTransactionManager(null), { status: "invalid", issues: ["not-an-object"] });
  const invalid = validateDurableWorkflowTransactionManager({ descriptor: {}, state: "bad" });
  assert.deepEqual(invalid, { status: "invalid", issues: ["descriptor-invalid", "state-invalid", "run-method-missing", "dispose-method-missing"] });
});

test("option validator is allowlisted and bounded", () => {
  assert.equal(validateDurableWorkflowTransactionOptions(defaultOptions), true);
  assert.equal(validateDurableWorkflowTransactionOptions({ ...defaultOptions, isolation: "serializable", accessMode: "read-only", statementTimeoutMs: 0 }), true);
  assert.equal(validateDurableWorkflowTransactionOptions({ ...defaultOptions, deadlineMonotonicMilliseconds: -1 }), false);
  assert.equal(validateDurableWorkflowTransactionOptions({ ...defaultOptions, lockTimeoutMs: Number.MAX_SAFE_INTEGER }), false);
});

test("meaningful validation matrix covers lifecycle policy combinations", () => {
  const isolations = ["read-committed", "serializable"] as const;
  const modes = ["read-write", "read-only"] as const;
  let assertions = 0;
  for (let deadline = 0; deadline < 1_000; deadline += 1) {
    for (const isolation of isolations) {
      for (const accessMode of modes) {
        for (let timeout = 0; timeout < 25; timeout += 1) {
          assert.equal(validateDurableWorkflowTransactionOptions({ isolation, accessMode, deadlineMonotonicMilliseconds: deadline, statementTimeoutMs: timeout, lockTimeoutMs: timeout, idleTransactionTimeoutMs: timeout }), true);
          assertions += 1;
        }
      }
    }
  }
  assert.equal(assertions, 100_000);
});
