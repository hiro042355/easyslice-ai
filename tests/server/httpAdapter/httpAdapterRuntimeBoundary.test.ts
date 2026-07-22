import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../../../lib/server/httpAdapter/referenceHttpAdapterRuntime.ts", import.meta.url);

test("HTTP adapter runtime keeps the transport and composition boundary", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /from "\.\.\/generationJobEntry\/types"/);
  assert.match(source, /from "\.\/types"/);
  for (const forbidden of [
    "next/server", "react", "node:fs", "node:http", "fetch(", "process.env", "Date.now",
    "Math.random", "randomUUID", "setTimeout", "setInterval", "ReferenceGenerationJobEntryRuntime",
    "defaultRegistry", "globalRegistry",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(/\bnew\s+(?:Request|Response)\s*\(/u.test(source), false);
  assert.equal(/\b(?:NextRequest|NextResponse)\b/u.test(source), false);
});
