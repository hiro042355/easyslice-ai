import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ADAPTERS = [
  "lib/providers/referenceVocalAdapter.ts",
  "lib/providers/referenceMusicAdapter.ts",
] as const;

const FORBIDDEN_RUNTIME_TARGETS = [
  "providerClients",
  "materializers",
  "workflows",
  "upload",
  "registry",
  "http",
  "node:fs",
  "node:http",
  "node:https",
] as const;
const FORBIDDEN_EXECUTABLE_PATTERNS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\brequire\s*\(/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bqueueMicrotask\s*\(/,
  /\bprocess\s*\.\s*env\b/,
  /\bDate\s*\.\s*now\s*\(/,
  /\bMath\s*\.\s*random\s*\(/,
  /\b(?:authorization|bearer|secret|token|credential)\b/i,
] as const;

function importsFrom(source: string) {
  return [...source.matchAll(
    /import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g,
  )].map((match) => ({
    typeOnly: match[1] !== undefined,
    target: match[2],
  }));
}

test("reference Vocal and Music adapters preserve the pure runtime boundary", async () => {
  for (const relativePath of ADAPTERS) {
    const source = await readFile(`${ROOT}${relativePath}`, "utf8");
    const imports = importsFrom(source);
    const runtimeImports = imports.filter((entry) => !entry.typeOnly);

    assert.ok(source.length > 0, `${relativePath}: source exists`);
    assert.equal(/\bimport\s*\(/.test(source), false, `${relativePath}: dynamic import`);
    for (const pattern of FORBIDDEN_EXECUTABLE_PATTERNS) {
      assert.equal(pattern.test(source), false, `${relativePath}: forbidden executable boundary`);
    }
    assert.equal(/^(?:export\s+)?(?:let|var)\s/m.test(source), false);
    assert.equal(/\bregister[A-Z]\w*\s*\(/.test(source), false, `${relativePath}: import-time registration`);

    for (const target of FORBIDDEN_RUNTIME_TARGETS) {
      assert.equal(
        runtimeImports.some((entry) => entry.target.includes(target)),
        false,
        `${relativePath}: forbidden runtime dependency category`,
      );
    }

    assert.deepEqual(
      runtimeImports.map((entry) => entry.target),
      ["@/lib/providers/adapterUtils"],
      `${relativePath}: runtime dependency allowlist`,
    );
    assert.equal(
      imports.some((entry) => entry.target === "@/lib/providers/types" && !entry.typeOnly),
      false,
      `${relativePath}: shared provider types are type-only`,
    );
    assert.equal(
      imports.some((entry) => entry.target === "@/lib/providerRequests/types" && !entry.typeOnly),
      false,
      `${relativePath}: Provider Request Contract is type-only`,
    );
    assert.match(source, /export\s+type\s+\{[\s\S]*?\}\s+from\s+["']@\/lib\/providerRequests\/types["']/);
    assert.match(source, /CAPABILITY[\s\S]*?Object\.freeze\(/);
    assert.match(source, /reference(?:Vocal|Music)Adapter[\s\S]*?Object\.freeze\(/);
  }
});
