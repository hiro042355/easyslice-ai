import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("Temporary Workspace Runtime is limited to workspace filesystem infrastructure", async () => {
  const source = await readFile(new URL("../../../lib/server/workspace/referenceTemporaryWorkspaceAdapter.ts", import.meta.url), "utf8");
  assert.match(source, /WorkspaceFilesystem/);
  assert.doesNotMatch(source, /^type WorkspaceFilesystem\b/m);
  for (const allowed of ["node:fs/promises", "node:os", "node:path"]) assert.equal(source.includes(allowed), true, allowed);
  for (const value of ["child_process", "spawn(", "exec(", "execFile", "ffmpeg", "ffprobe", "adm-zip", "fetch(", "database", "provider", "Buffer", "readFile", "writeFile"])
    assert.equal(source.toLowerCase().includes(value.toLowerCase()), false, value);
});
