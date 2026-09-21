import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Workflow Contract remains type-only and references pipelines declaratively", async () => {
  const source = await readFile(new URL("../../lib/workflows/types.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /\b(?:const|let|var|function|class|enum|namespace)\b/);
  assert.doesNotMatch(source, /import\s*\(|require\s*\(/);
  assert.doesNotMatch(
    source,
    /(?:\bproviderClients?\b|\bReference(?:Vocal|Music|MV)AdapterInput\b|\breference(?:Vocal|Music|MV)Adapter\b|\/providers\/|\bproviderUploads?\b)/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:ReferenceOperationPipeline|operationBindings|referenceOperation|materializers?|outputIngestion|providerUploads?)\b/i,
  );
  assert.doesNotMatch(
    source,
    /(?:server\/|next\/|node:|\b(?:registry|react|http|sql|postgres|queue|worker|poll)\b)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /credential|token|signedUrl|storageLocator|rawReceipt|stackTrace|providerReference/i);

  for (const publicType of [
    "WorkflowIdentity",
    "WorkflowStageIdentity",
    "WorkflowVersion",
    "WorkflowDefinition",
    "WorkflowStageDefinition",
    "WorkflowPipelineReference",
    "WorkflowStageDependency",
    "WorkflowInput",
    "WorkflowOutput",
    "WorkflowStageInput",
    "WorkflowStageOutput",
    "WorkflowContext",
    "WorkflowState",
    "WorkflowStageState",
    "WorkflowNonTerminalState",
    "WorkflowTerminalState",
    "WorkflowTransition",
    "WorkflowCancellationMarker",
    "WorkflowRetryRecommendation",
    "WorkflowReconciliationRecommendation",
    "WorkflowValidationIssue",
    "WorkflowValidationResult",
    "WorkflowAuditEntry",
    "WorkflowAudit",
    "WorkflowCompletedResult",
    "WorkflowPartialResult",
    "WorkflowFailedResult",
    "WorkflowCancelledResult",
    "WorkflowRecoveryRequiredResult",
    "WorkflowResult",
  ]) {
    assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));
  }

  assert.match(source, /pipelineId: string/);
  assert.match(source, /pipelineVersion: string/);
  assert.match(source, /bindingId: string/);
  assert.match(source, /bindingVersion: string/);
  assert.doesNotMatch(source, /execute\s*\(|run\s*\(|callback|executor/i);
  assert.match(source, /readonly WorkflowStageDefinition\[\]/);
  assert.match(source, /readonly WorkflowStageDependency\[\]/);
  assert.match(source, /readonly WorkflowAuditEntry\[\]/);
});

test("Reference Workflow reason utility follows the structural string contract", async () => {
  const source = await readFile(new URL("../../lib/workflows/referenceWorkflowUtils.ts", import.meta.url), "utf8");
  const uniqueReasons = source.split("\n").find((line) => line.includes("export const uniqueReasons="));

  assert.doesNotMatch(source, /\bReferenceWorkflowReasonCode\b/);
  assert.match(source, /export const uniqueReasons=\(v:readonly string\[\]\)=>\[\.\.\.new Set\(v\)\];/);
  assert.ok(uniqueReasons);
  assert.doesNotMatch(uniqueReasons, /\bas\s+(?:never|unknown|any)\b|@ts-(?:ignore|expect-error)/);
});

test("Reference Workflow input contracts remain isolated from the generic Workflow Contract", async () => {
  const genericSource = await readFile(new URL("../../lib/workflows/types.ts", import.meta.url), "utf8");
  const inputSource = await readFile(new URL("../../lib/workflows/referenceWorkflowTypes.ts", import.meta.url), "utf8");
  const consumerUrls = [
    "../../lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput.ts",
    "../../lib/sensitiveBoundary/types.ts",
    "../../lib/workflowFixtures/canonicalWorkflowFixtures.ts",
    "../../lib/workflowFixtures/types.ts",
    "../../lib/workflows/referenceVocalWorkflow.ts",
    "../../lib/workflows/referenceMusicWorkflow.ts",
    "../../lib/workflows/referenceMVWorkflow.ts",
    "../../lib/server/workflowApi/referenceWorkflowApiService.ts",
    "../../lib/workflowApi/types.ts",
    "../../lib/workflowEntry/types.ts",
    "../../lib/workflows/referenceGenerationWorkflow.ts",
    "../sensitiveBoundary/fixture.ts",
    "./referenceGenerationWorkflow.test.ts",
  ] as const;

  assert.doesNotMatch(genericSource, /^import\s/m);
  assert.doesNotMatch(
    genericSource,
    /\b(?:AssetReference|ReferenceVocalAdapterInput|ReferenceMusicAdapterInput|ReferenceMVAdapterInput)\b/,
  );
  assert.match(genericSource, /export\s+type\s+ReferenceWorkflowContext\b/);
  assert.match(inputSource, /type\s+ReferenceWorkflowInputBase\b/);

  for (const publicType of [
    "ReferenceVocalWorkflowInput",
    "ReferenceMusicWorkflowInput",
    "ReferenceMVWorkflowInput",
    "ReferenceWorkflowInput",
  ]) {
    assert.doesNotMatch(genericSource, new RegExp(`(?:export\\s+)?type\\s+${publicType}\\b`));
    assert.match(inputSource, new RegExp(`export\\s+type\\s+${publicType}\\b`));
  }

  assert.doesNotMatch(genericSource, /export\s+(?:type\s+)?\{[^}]*Reference(?:Vocal|Music|MV)?WorkflowInput[^}]*\}/s);

  for (const consumerUrl of consumerUrls) {
    const consumerSource = await readFile(new URL(consumerUrl, import.meta.url), "utf8");
    assert.match(consumerSource, /referenceWorkflowTypes/);
    assert.doesNotMatch(
      consumerSource,
      /import\s+type\s+\{[^}]*\bReference(?:Vocal|Music|MV)?WorkflowInput\b[^}]*\}\s+from\s+["'][^"']*(?:workflows\/types|\.\/types)["']/s,
    );
  }
});
