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
    /(?:ReferenceOperationPipeline|operationBindings|referenceOperation|providerClients?|providers?|materializers?|outputIngestion|providerUploads?|server\/|registry|react|next\/|node:|http|sql|postgres|queue|worker|poll)/i,
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
