import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONTRACT_PATH = "lib/outputIngestion/types.ts";
const DOCUMENT_PATH = "docs/OUTPUT_INGESTION_CONTRACT_V1.md";

const REQUIRED_EXPORTS = [
  "GeneratedOutputRole",
  "ExpectedDuration",
  "ExpectedDimensions",
  "ExpectedOutputRole",
  "ExpectedOutputContract",
  "OutputIngestionPolicy",
  "OutputIngestionContext",
  "OutputIngestionIdempotencyContext",
  "OutputIngestionInput",
  "OutputIngestionPlanItem",
  "OutputIngestionPlan",
  "ProviderOutputReferenceItem",
  "ProviderOutputReferenceBundle",
  "OutputIngestionPlanResult",
  "ProviderOutputAccess",
  "OutputContentHandle",
  "ProviderOutputMetadata",
  "ProviderOutputFetcher",
  "ContentInspector",
  "ContentScanner",
  "MediaSanitizer",
  "AssetStoreWriter",
  "ImportedAssetRegistry",
  "ProvenanceStore",
  "DuplicateAssetLookup",
  "IngestionJournal",
  "CleanupScheduler",
  "ImportedAssetReference",
  "OutputIngestionResult",
  "OutputIngestionIssue",
  "OutputIngestionAudit",
  "OutputIngestionRetryAdvice",
  "NormalizedOutputIngestionError",
] as const;

test("Output Ingestion Contract remains type-only, dependency-closed, and document-aligned", async () => {
  const [source, document] = await Promise.all([
    readFile(`${ROOT}${CONTRACT_PATH}`, "utf8"),
    readFile(`${ROOT}${DOCUMENT_PATH}`, "utf8"),
  ]);
  assert.ok(source.length > 0);

  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => ({ typeOnly: match[1] !== undefined, target: match[2] }));
  assert.deepEqual(imports, [
    { typeOnly: true, target: "@/lib/assets/types" },
    { typeOnly: true, target: "@/lib/mvContracts" },
    { typeOnly: true, target: "@/lib/providers/types" },
    { typeOnly: true, target: "@/lib/providerClients/types" },
  ]);
  assert.equal(imports.every((entry) => entry.typeOnly), true);

  assert.equal(/\b(?:const|let|var|function|class|enum|namespace)\b/.test(source), false);
  assert.equal(/import\s*\(|require\s*\(/.test(source), false);
  assert.equal(/@\/lib\/(?:workflows?|workflowIntegration|operationPipelines|materializers\/reference|providerClients\/reference|server\/productionWorkflowRuntime|postgresql)/.test(source), false);
  assert.equal(/next(?:\/|["'])|react(?:\/|["'])|node:|process\.env|XMLHttpRequest|WebSocket|readFile|writeFile/.test(source), false);
  assert.equal(/\b(?:createFactory|factory|register|unregister|reset)\b/i.test(source), false);
  assert.equal(/\b(?:apiKey|bearerToken|authorizationHeader|credential|password|secret)\s*:/i.test(source), false);
  assert.equal(/\b(?:url|downloadUrl|endpoint)\s*:/i.test(source), false);

  for (const name of REQUIRED_EXPORTS) {
    assert.match(source, new RegExp(`export\\s+type\\s+${name}\\b`), name);
  }

  assert.match(source, /ExpectedOutputContract\s*=\s*\{\s*contractVersion:\s*"1\.0"/);
  assert.match(source, /kind:\s*AssetKind/);
  assert.match(source, /expectedDuration\?:\s*ExpectedDuration/);
  assert.match(source, /expectedDimensions\?:\s*ExpectedDimensions/);
  assert.match(source, /allowedProviderIds:\s*readonly\s+string\[\]/);
  assert.match(source, /deletionPending:\s*boolean/);
  assert.match(source, /sourceRegion\?:\s*string/);
  assert.match(source, /destinationRegion\?:\s*string/);
  assert.match(source, /cancellation\?:\s*\{\s*stage:\s*"none"\s*\|\s*"before-fetch"\s*\|\s*"during-fetch"\s*\|\s*"before-store"\s*\|\s*"before-registry"\s*\}/);
  assert.match(source, /ProviderOutputReferenceItem\s*=\s*\{\s*slotIndex:\s*number;\s*role:\s*GeneratedOutputRole;\s*providerOutputReference:\s*string/);
  assert.match(source, /ProviderOutputReferenceBundle\s*=\s*Sensitive<\{\s*bundleVersion:\s*"1\.0"/);
  assert.match(source, /ImportedAssetRegistry=\{create\(input:/);

  for (const legacy of [
    "expectedVersion",
    "cancellationState",
    "temporaryWorkspaceRef",
    "storageTargetRef",
    "createRecord",
    "registryVersion",
    "descriptorVersion",
  ]) {
    assert.equal(new RegExp(`\\b${legacy}\\b`).test(source), false, legacy);
  }
  assert.equal(/allowedProviderIds\?:|deletionPending\?:/.test(source), false);
  assert.equal(/\bduration\?:\s*ExpectedDuration|\bdimensions\?:\s*ExpectedDimensions/.test(source), false);

  for (const field of [
    'contractVersion: "1.0"',
    "expectedDuration?: ExpectedDuration",
    "expectedDimensions?: ExpectedDimensions",
    "allowedProviderIds: readonly string[]",
    "deletionPending: boolean",
    "bundleVersion: \"1.0\"",
    "type ImportedAssetRegistry",
  ]) {
    assert.equal(document.includes(field), true, field);
  }
});
