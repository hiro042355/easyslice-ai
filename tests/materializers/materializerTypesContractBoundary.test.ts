import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONTRACT = "lib/materializers/types.ts";

test("Materializer Contract remains type-only and ownership-separated", async () => {
  const source = await readFile(`${ROOT}${CONTRACT}`, "utf8");
  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => ({ typeOnly: match[1] !== undefined, target: match[2] }));

  assert.deepEqual(imports, [
    { typeOnly: true, target: "@/lib/mvContracts" },
    { typeOnly: true, target: "@/lib/assets/types" },
    { typeOnly: true, target: "@/lib/providerRequests/types" },
  ]);
  assert.equal(imports.every((entry) => entry.typeOnly), true);
  assert.equal(/\b(?:const|let|var|function|class|enum|namespace)\b/.test(source), false);
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|process\.env|console\.|setTimeout|setInterval)\b/.test(source), false);
  assert.equal(/node:|materializerUtils|referenceProfiles|reference(?:Vocal|Music|MV)Materializer|materializerRegistry|providerClients|workflows?|providerUploads?|outputIngestion/.test(source), false);
  assert.equal(/\b(?:readFile|writeFile|localStorage|sessionStorage)\b/.test(source), false);

  for (const publicType of [
    "RequestMaterializationStatus",
    "RequestMaterializationContext",
    "RequestMaterializationIssue",
    "RequestMaterializationAudit",
    "RequestMaterializationInput",
    "RequestMaterializationResult",
    "RequestMaterializer",
    "ProviderMaterializationProfile",
    "MaterializedAssetValue",
    "MaterializerDescriptor",
  ]) {
    assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));
  }

  assert.match(source, /readonly\s+contractVersion:\s*"1\.0"/);
  assert.match(source, /readonly\s+contextVersion:\s*"1\.0"/);
  assert.match(source, /readonly\s+profileVersion:\s*ProviderMaterializationProfileVersion/);
  assert.match(source, /readonly\s+materializerVersion:\s*"reference-v1"/);
  assert.match(source, /readonly\s+status:\s*"materialized"/);
  assert.match(source, /readonly\s+status:\s*"failed"/);
  assert.match(source, /readonly\s+issues:\s*readonly\s+RequestMaterializationIssue\[\]/);
});
