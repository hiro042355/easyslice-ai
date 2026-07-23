import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Sensitive Projection Runtime only uses its contract and explicit capability", async () => {
  const source = await readFile(new URL("../../../lib/server/sensitiveBoundary/referenceSensitiveProjectionRuntime.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/types"/);
  for (const forbidden of [
    "next/server", "react", "node:fs", "node:path", "child_process", "node:stream", "Buffer",
    "storageSdk", "authSdk", "secretManager", "vault", "database", "provider", "workflow",
    "serverComposition", "generationJobEntry", "fetch(", "process.env", "Date.now", "new Date",
    "Math.random", "randomUUID", "setTimeout", "setInterval", "globalRegistry", "singleton",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
