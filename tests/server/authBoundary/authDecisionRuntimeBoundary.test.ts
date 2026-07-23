import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Auth Decision Runtime has only contract and explicit capability dependencies", async () => {
  const source = await readFile(new URL("../../../lib/server/authBoundary/referenceAuthDecisionRuntime.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/types"/);
  for (const forbidden of [
    "next/server", "react", "supabase", "firebase", "clerk", "nextauth", "auth.js", "jose", "jsonwebtoken",
    "database", "provider", "upload", "serverComposition", "generationJobEntry", "node:fs", "fetch(",
    "process.env", "Date.now", "new Date", "Math.random", "randomUUID", "setTimeout", "setInterval",
    "defaultImplementation", "globalRegistry", "singleton",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(/from\s+["'][^"']*(?:workflow|server\/composition|generationJobEntry)[^"']*["']/iu.test(source), false);
});
