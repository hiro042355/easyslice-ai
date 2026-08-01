import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("driver boundary is server-only, dependency-bounded, and contains no forbidden surfaces", () => {
  const root = join(process.cwd(), "lib", "server", "productionWorkflowRuntime", "postgresqlDriver");
  const source = readdirSync(root).filter((name) => name.endsWith(".ts")).map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  for (const forbidden of ["use client", "React", "window", "document", "localStorage", "sessionStorage", "fetch(", "process.env", "globalThis", "Symbol.for", "Math.random", "Date.now", "console.", " as any", "unknown as"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("productionReady: false"), false);
  assert.equal(source.includes("productionReady: true"), false);
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("database reachable"), false);
  assert.equal(source.includes("unsupported-pg-8.22.0"), true);
  assert.equal(source.includes("password: string"), true);
  assert.equal(source.includes("raw SQL"), false);
});
