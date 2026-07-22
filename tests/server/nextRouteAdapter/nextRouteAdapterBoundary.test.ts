import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Next Route Adapter is the only Next.js-aware runtime boundary", async () => {
  const source = await readFile(new URL("../../../lib/server/nextRouteAdapter/referenceNextRouteAdapter.ts", import.meta.url), "utf8");
  assert.match(source, /from "next\/server"/);
  assert.match(source, /from "\.\.\/httpAdapter\/types"/);
  for (const forbidden of [
    "generationJobEntry", "server/composition", "workflowEntry", "operationPipelines", "provider", "materializer",
    "outputIngestion", "upload", "queue", "worker", "polling", "scheduler", "node:fs", "node:http", "fetch(",
    "process.env", "Date.now", "Math.random", "randomUUID", "setTimeout", "setInterval", "next/navigation",
    "next/cache", "react", "ReferenceHttpAdapterRuntime", "defaultRegistry", "singleton",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});

test("Next.js types do not leak below the route adapter boundary", async () => {
  for (const path of ["../../../lib/server/httpAdapter/types.ts", "../../../lib/server/httpAdapter/referenceHttpAdapterRuntime.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.equal(source.includes("next/server"), false, path);
    assert.equal(/\b(?:NextRequest|NextResponse)\b/u.test(source), false, path);
  }
});
