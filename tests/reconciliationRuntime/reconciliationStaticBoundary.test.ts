import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("reconciliation foundation contains no production or client boundary escape", () => {
  const root = join(process.cwd(), "lib", "server", "productionWorkflowRuntime", "reconciliation");
  const source = readdirSync(root).filter((name) => name.endsWith(".ts")).map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  for (const forbidden of [
    "process.env", "globalThis", "Symbol.for", "setTimeout(", "setInterval(", "fetch(",
    "PoolClient", " from \"pg\"", " from \"react\"", "window.", "document.",
    "BEGIN", "COMMIT", "ROLLBACK", "provider.submit", "runtimeBundle.register",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(source.includes("productionReady: false"), true);
  assert.equal(source.includes("runtimeBundleRegistered: false"), true);
});
