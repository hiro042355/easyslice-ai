import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Media Operation contract is type-only and infrastructure-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/mediaOperation/types.ts", import.meta.url), "utf8");
  assert.equal(/export (const|class|function|enum)|\bclass\s|\benum\s/.test(source), false);
  assert.equal(source.split(/\r?\n/).filter((line) => line.startsWith("import ")).every((line) => line.startsWith("import type ")), true);
  for (const forbidden of [
    "child_process", "Buffer", "Stream", "Blob", "node:fs", "node:path", "ffmpeg", "ffprobe",
    "adm-zip", "provider sdk", "database", "next/server", "react",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
