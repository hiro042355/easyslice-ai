import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "lib", "server", "productionWorkflowRuntime", "durableTransaction");
const files = readdirSync(root).filter((name) => name.endsWith(".ts"));
const source = files.map((name) => readFileSync(join(root, name), "utf8")).join("\n");

test("durable transaction V2 remains server-only and uses ALS only as a scope owner", () => {
  assert.equal(source.includes('from "node:async_hooks"'), true);
  assert.equal(source.includes(".run("), true);
  assert.equal(source.includes(".getStore("), true);
  for (const forbidden of [
    '"use client"', "React", "globalThis", "Symbol.for", "process.env", "enterWith(",
    "PoolClient", "new Pool", "pool.query", "fetch(", "XMLHttpRequest", "window.", "document.",
    "Date.now", "Math.random", "setInterval", "console.", " as any", "unknown as",
    "lib/providers", "workflowApi", "components/", "hooks/", "app/",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("database capability exposes execute without SQL or connection lifecycle", () => {
  const types = readFileSync(join(root, "types.ts"), "utf8");
  assert.equal(types.includes("DurableWorkflowDatabaseCapability"), true);
  assert.equal(types.includes("execute(command:"), true);
  assert.equal(types.includes("sql: string"), false);
  assert.equal(types.includes("text: string"), false);
  assert.equal(types.includes("commit():") && types.includes("DurableWorkflowDatabaseCapability ="), true);
  const capabilityBlock = types.slice(types.indexOf("export type DurableWorkflowDatabaseCapability"), types.indexOf("export type DurableWorkflowTransactionContext"));
  assert.equal(capabilityBlock.includes("commit"), false);
  assert.equal(capabilityBlock.includes("rollback"), false);
  assert.equal(capabilityBlock.includes("release"), false);
  assert.equal(capabilityBlock.includes("discard"), false);
});
