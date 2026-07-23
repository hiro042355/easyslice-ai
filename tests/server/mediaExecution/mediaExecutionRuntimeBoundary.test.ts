import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Media Execution Adapter has no infrastructure implementation", async () => {
  const source = await readFile(new URL("../../../lib/server/mediaExecution/referenceMediaExecutionAdapter.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/types"/);
  for (const forbidden of [
    "next/server", "react", "node:fs", "node:path", "node:os", "child_process", "process.env",
    "Buffer", "stream", "ffmpeg", "ffprobe", "adm-zip", "database", "provider", "workflow",
    "generationJobEntry", "serverComposition", "httpAdapter", "Date.now", "new Date",
    "Math.random", "randomUUID", "setTimeout", "setInterval", "singleton", "globalRegistry",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
