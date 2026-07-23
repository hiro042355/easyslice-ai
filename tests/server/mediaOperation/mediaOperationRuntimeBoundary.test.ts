import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Media Operation Runtime uses only its contract and explicit capability", async () => {
  const source = await readFile(new URL("../../../lib/server/mediaOperation/referenceMediaOperationRuntime.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/types"/);
  for (const forbidden of [
    "child_process", "node:fs", "node:path", "process.", "ffmpeg", "ffprobe", "adm-zip",
    "temporary directory", "shell command", "fetch(", "provider", "database", "next/server", "react",
    "globalRegistry", "singleton", "Date.now", "new Date", "Math.random", "randomUUID",
    "setTimeout", "setInterval",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
