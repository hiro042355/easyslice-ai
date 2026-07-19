import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "lib", "server", "productionWorkflowRuntime");

test("production runtime foundation remains server-only and dependency-free", () => {
  const files = readdirSync(root).filter((file) => file.endsWith(".ts"));
  assert.equal(files.length >= 10, true);
  const forbidden = [
    '"use client"',
    "react",
    "app/",
    "components/",
    "hooks/",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "fetch",
    "console",
    "process.env",
    "globalThis",
    "Symbol.for",
    "ReferenceWorkflowApiProcessRuntime",
    "as any",
    "unknown as",
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const token of forbidden) assert.equal(source.includes(token), false, `${file}:${token}`);
    assert.equal(source.includes("@/app"), false, file);
    assert.equal(source.includes("@/components"), false, file);
    assert.equal(source.includes("@/hooks"), false, file);
  }
});

test("production fallback prohibition and external I/O guard are statically present", () => {
  const adapter = readFileSync(join(root, "referenceProductionRuntimeContractAdapter.ts"), "utf8");
  const transaction = readFileSync(join(root, "transactionTypes.ts"), "utf8");
  const claim = readFileSync(join(root, "storeTypes.ts"), "utf8");
  assert.equal(adapter.includes("PRODUCTION_RUNTIME_REFERENCE_FALLBACK_ALLOWED = false"), true);
  assert.equal(transaction.includes("externalIoAllowed: false"), true);
  assert.equal(claim.includes("providerSubmitPermitted: false"), true);
  assert.equal(claim.includes('| "terminal"'), true);
});
