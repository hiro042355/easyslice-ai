import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sensitive Boundary contract is type-only and implementation-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/sensitiveBoundary/types.ts", import.meta.url), "utf8");
  assert.equal(/^(?!export type|import type|\s|\/\/|\*|\/\*|\||\}|\{).*(export (const|class|function|enum)|function |class |enum )/m.test(source), false);
  for (const forbidden of [
    "next/server", "react", "Buffer", "Uint8Array", "stream",
    "node:fs", "node:path", "provider", "database", "secretmanager", "vault", "Promise<",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const forbiddenType of ["Request", "Response"])
    assert.equal(new RegExp(`\\b${forbiddenType}\\b`).test(source), false, forbiddenType);
});
