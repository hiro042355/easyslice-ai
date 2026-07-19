import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDurableWorkflowStoreTestAdapterFactory } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableTransactionTestAdapter";
import { protectedIdentity } from "@/lib/server/productionWorkflowRuntime/storeContracts/storeContractUtils";

const root = join(process.cwd(), "lib", "server", "productionWorkflowRuntime", "storeContracts");

test("failure controller is environment-local, one-shot, resettable, and safe", async () => {
  const factory = createDurableWorkflowStoreTestAdapterFactory();
  const first = await factory.createEnvironment();
  const second = await factory.createEnvironment();
  first.failures.inject("record-read", "corrupted-result");
  assert.deepEqual(first.failures.consume("record-read"), { failure: "corrupted-result", resolution: "still-unknown" });
  assert.equal(first.failures.consume("record-read"), undefined);
  assert.equal(second.failures.consume("record-read"), undefined);
  first.failures.inject("cas", "conflict");
  first.failures.reset();
  assert.equal(first.failures.consume("cas"), undefined);
});

test("safe diagnostics contain only contract, store, operation, and issue classes", async () => {
  const environment = await createDurableWorkflowStoreTestAdapterFactory().createEnvironment();
  environment.failures.inject("transaction-commit", "unknown-outcome", "still-unknown");
  const result = await environment.atomic.commit({
    groupVersion: "1.0",
    result: { recordVersion: "1.0", identity: protectedIdentity("result", "safe"), revision: 1, status: "terminal", legalHold: false, valueClass: "safe", orderedValues: [] },
    referenceIndex: protectedIdentity("reference-index", "protected"),
    outboxEvent: protectedIdentity("outbox-event", "protected"),
    outboxPayload: { eventClass: "safe-terminal" },
  });
  assert.deepEqual(result, { status: "unknown" });
  const encoded = JSON.stringify(result);
  for (const forbidden of ["Story", "Lyrics", "Scene", "Prompt", "Credential", "Session", "Handle", "raw error"]) assert.equal(encoded.includes(forbidden), false);
});

test("store Contract production modules remain server-only and dependency-free", () => {
  const files = readdirSync(root).filter((file) => file.endsWith(".ts"));
  assert.equal(files.length >= 6, true);
  const forbidden = [
    '"use client"', "react", "app/", "components/", "hooks/", "window", "document", "localStorage", "sessionStorage", "fetch", "console", "process.env", "globalThis", "Symbol.for", "node:fs", "node:test", "Date.now", "new Date", "setTimeout", "as any", "unknown as",
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const token of forbidden) assert.equal(source.includes(token), false, `${file}:${token}`);
    assert.equal(/from ["'][^"']*(postgres|redis|kafka|sqs|kms|database|queue)[^"']*["']/.test(source), false, file);
  }
});

test("test adapter descriptor explicitly denies durability and production readiness", async () => {
  const environment = await createDurableWorkflowStoreTestAdapterFactory().createEnvironment();
  assert.deepEqual(environment.descriptor, {
    descriptorVersion: "1.0",
    id: "durable-workflow-store-test-adapter-v1",
    mode: "contract-test-only",
    durable: false,
    crossProcess: false,
    crossInstance: true,
    productionReady: false,
  });
});
