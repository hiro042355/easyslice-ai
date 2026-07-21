import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REGISTRY = "lib/providerClients/providerClientRegistry.ts";

function importsFrom(source: string) {
  return [...source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => ({ typeOnly: match[1] !== undefined, target: match[2] }));
}

test("Provider Client Registry remains a static immutable Reference catalog", async () => {
  const source = await readFile(`${ROOT}${REGISTRY}`, "utf8");
  assert.ok(source.length > 0);
  assert.deepEqual(importsFrom(source), [
    { typeOnly: false, target: "./providerClientUtils" },
    { typeOnly: false, target: "./referenceProviderClient" },
    { typeOnly: true, target: "./types" },
  ]);

  const forbidden = [
    /\b(?:fetch|XMLHttpRequest|WebSocket)\b/,
    /\b(?:setTimeout|setInterval|queueMicrotask)\s*\(/,
    /\bDate\s*\.\s*now\s*\(/,
    /\bMath\s*\.\s*random\s*\(/,
    /\bcrypto\s*\.\s*(?:randomUUID|getRandomValues|randomBytes)\b/,
    /\bprocess\s*\.\s*env\b/,
    /\bconsole\s*\./,
    /\brequire\s*\(/,
    /\bimport\s*\(/,
    /\bnew\s+(?:Map|Set)\b/,
    /\b(?:apiKey|authorizationHeader|bearerToken|accessToken|secretValue)\b/i,
    /providers\/providerRegistry|materializers?\/|workflows?\/|providerUploads?\/|outputIngestion\//,
    /\b(?:readFile|writeFile|createReadStream|createWriteStream)\s*\(/,
  ] as const;
  for (const pattern of forbidden) assert.equal(pattern.test(source), false);

  assert.equal(/^(?:export\s+)?(?:let|var)\s/m.test(source), false);
  assert.equal(/export\s+function\s+(?:register|unregister|reset)/i.test(source), false);
  assert.match(source, /const\s+DESCRIPTORS[^=]*=\s*Object\.freeze\s*\(/);
  assert.match(source, /providerClientRegistry[^=]*=\s*Object\.freeze\s*\(/);
  assert.match(source, /capability:\s*deepFreeze\s*\(\s*deepCopy\s*\(/);
  assert.match(source, /createClient:\s*createReferenceProviderClient/);
  assert.match(source, /availability:\s*["']available["']/);
  assert.match(source, /if\s*\(\s*!isSafeOpaqueRef\s*\(\s*clientId\s*\)\s*\)\s*return\s+undefined/);
  assert.match(source, /find\s*\(\s*\(value\)\s*=>\s*value\.clientId\s*===\s*clientId\s*\)/);
  assert.match(source, /return\s+found\s*\?\s*snapshot\s*\(\s*found\s*\)\s*:\s*undefined/);
  assert.equal(/createReferenceProviderClient\s*\(/.test(source), false, "factory must not execute at import time");
});
