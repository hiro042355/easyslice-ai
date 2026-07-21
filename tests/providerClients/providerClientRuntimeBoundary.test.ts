import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENT = "lib/providerClients/referenceProviderClient.ts";
const UTILS = "lib/providerClients/providerClientUtils.ts";

function importsFrom(source: string) {
  return [...source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => ({ typeOnly: match[1] !== undefined, target: match[2] }));
}

test("Reference Provider Client runtime preserves its deterministic simulation boundary", async () => {
  const [client, utils] = await Promise.all([
    readFile(`${ROOT}${CLIENT}`, "utf8"),
    readFile(`${ROOT}${UTILS}`, "utf8"),
  ]);
  const clientImports = importsFrom(client);
  const utilsImports = importsFrom(utils);

  assert.ok(client.length > 0);
  assert.ok(utils.length > 0);
  assert.deepEqual(clientImports, [
    { typeOnly: false, target: "./providerClientUtils" },
    { typeOnly: true, target: "./types" },
  ]);
  assert.deepEqual(utilsImports, [{ typeOnly: true, target: "./types" }]);

  const combined = `${client}\n${utils}`;
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
    /\b(?:apiKey|authorizationHeader|bearerToken|accessToken|secretValue)\b/i,
    /providerClientRegistry|providerRegistry|materializers?\/|workflows?\/|providerUploads?\/|outputIngestion\//,
    /\b(?:readFile|writeFile|createReadStream|createWriteStream)\s*\(/,
  ] as const;
  for (const pattern of forbidden) assert.equal(pattern.test(combined), false);

  assert.equal(/^(?:export\s+)?(?:let|var)\s/m.test(combined), false);
  assert.equal(/^const\s+[^\n=]+=[^\n]*\bnew\s+(?:Map|Set)\b/m.test(combined), false);
  assert.match(client, /const\s+OPERATIONS[^=]*=\s*Object\.freeze\s*\(/);
  assert.match(client, /REFERENCE_PROVIDER_CLIENT_CAPABILITY[^=]*=\s*deepFreeze\s*\(/);
  assert.match(client, /REFERENCE_PROVIDER_TIMEOUT_POLICY[^=]*=\s*deepFreeze\s*\(/);
  assert.match(client, /REFERENCE_PROVIDER_POLL_TIMEOUT_POLICY[^=]*=\s*deepFreeze\s*\(/);
  assert.match(client, /REFERENCE_PROVIDER_CLIENT_CONFIG[^=]*=\s*deepFreeze\s*\(/);
  assert.match(client, /const\s+idempotency\s*=\s*new\s+Map/);
  assert.match(client, /referenceNowEpochSeconds/);
  assert.match(utils, /isSafeOpaqueRef/);
  assert.match(utils, /mapReferenceScenarioToError/);
  assert.match(client, /ProviderClient<ReferenceProviderRequestBody,\s*ReferenceSafeResponseDTO>/);
  assert.match(client, /async\s+submit\s*\(/);
  assert.match(client, /async\s+poll\s*\(/);
  assert.match(client, /async\s+cancel\s*\(/);
});
