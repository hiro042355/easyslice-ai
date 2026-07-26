import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("Workspace contract is type-only and opaque", async () => {
  const source = await readFile(new URL("../../../lib/server/workspace/types.ts", import.meta.url), "utf8");
  assert.equal(/export (const|class|function|enum)|\bclass\s|\benum\s/.test(source), false);
  assert.match(source, /export type WorkspaceFilesystem/);
  assert.match(source, /mkdir\(location: string\): Promise<void>/);
  assert.match(source, /rm\(location: string\): Promise<void>/);
  for (const value of ["next/server", "react", "child_process", "Buffer", "Stream", "Blob", "node:fs", "node:path", "node:os", "ffmpeg", "zip", "database", "provider"])
    assert.equal(source.toLowerCase().includes(value.toLowerCase()), false, value);
});
