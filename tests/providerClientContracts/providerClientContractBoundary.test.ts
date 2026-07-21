import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FILES = [
  "lib/providerClients/types.ts",
  "lib/providerClients/referenceTypes.ts",
] as const;

const REFERENCE_TYPES = [
  "ReferenceTransportScenario",
  "ReferenceProviderRequestBody",
  "ReferenceSafeResponseDTO",
  "ReferenceProviderClientConfig",
] as const;

const NEUTRAL_TYPES = [
  "ProviderCredentialHandle",
  "ProviderCredentialState",
  "ProviderSubmitInput",
  "ProviderPollInput",
  "ProviderCancelInput",
  "ProviderRetryAdvice",
  "NormalizedProviderClientError",
  "SafeTransportMetadata",
  "ProviderJobReference",
  "ProviderClientAttemptResult",
  "ProviderClient",
  "ProviderClientDescriptor",
  "ProviderClientAvailability",
] as const;

const FORBIDDEN = [
  /\b(?:const|let|var)\s+[A-Za-z_$]/,
  /\bfunction\s+[A-Za-z_$]/,
  /\bclass\s+[A-Za-z_$]/,
  /\benum\s+[A-Za-z_$]/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\s*\.\s*env\b/,
  /\bDate\s*\.\s*now\s*\(/,
  /\bMath\s*\.\s*random\s*\(/,
  /\b(?:setTimeout|setInterval|queueMicrotask)\s*\(/,
  /\b(?:fetch|XMLHttpRequest|WebSocket)\b/,
  /\bconsole\s*\./,
  /\b(?:apiKey|authorizationHeader|bearer|secret|token)\b/i,
  /["']authorization["']\s*:/i,
] as const;

function importedTargets(source: string) {
  return [...source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => ({ typeOnly: match[1] !== undefined, target: match[2] }));
}

test("Provider Client contracts remain type-only and ownership-separated", async () => {
  const [neutral, reference] = await Promise.all(
    FILES.map((path) => readFile(`${ROOT}${path}`, "utf8")),
  );

  for (const [index, source] of [neutral, reference].entries()) {
    assert.ok(source.length > 0, `${FILES[index]} exists`);
    for (const pattern of FORBIDDEN) {
      assert.equal(pattern.test(source), false, `${FILES[index]} purity boundary`);
    }
    const imports = importedTargets(source);
    assert.equal(imports.every((entry) => entry.typeOnly), true);
    assert.equal(imports.every((entry) => entry.target.startsWith("@/lib/")), true);
    assert.equal(imports.some((entry) => /node:|providerClients\/(?:referenceProviderClient|providerClientRegistry|providerClientUtils)|providers\/|materializers\/|uploads?\/|workflows?\//.test(entry.target)), false);
  }

  for (const name of NEUTRAL_TYPES) {
    assert.match(neutral, new RegExp(`export\\s+type\\s+${name}\\b`));
    assert.doesNotMatch(reference, new RegExp(`export\\s+type\\s+${name}\\b`));
  }
  for (const name of REFERENCE_TYPES) {
    assert.doesNotMatch(neutral, new RegExp(`export\\s+type\\s+${name}\\s*=`));
    assert.match(reference, new RegExp(`export\\s+type\\s+${name}\\s*=`));
    assert.match(neutral, new RegExp(`\\b${name}\\b`));
  }

  assert.match(neutral, /export\s+type\s*\{[\s\S]*?\}\s+from\s+["']@\/lib\/providerClients\/referenceTypes["']/);
  assert.doesNotMatch(reference, /providerClients\/types/);
  assert.match(neutral, /import\s+type[\s\S]*?providerRequests\/types/);
  assert.match(reference, /import\s+type[\s\S]*?providerRequests\/types/);
});
