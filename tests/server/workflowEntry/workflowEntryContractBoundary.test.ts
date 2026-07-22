import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Workflow Entry Contract remains transport-neutral and type-only", async () => {
  const source = await readFile(new URL("../../../lib/server/workflowEntry/types.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g)].map(
    (match) => ({ typeOnly: match[1] !== undefined, target: match[2] }),
  );
  assert.deepEqual(imports, [{ typeOnly: true, target: "../../workflows/types" }]);
  assert.doesNotMatch(source, /\b(?:const|let|var|function|class|enum|namespace)\b/);
  assert.doesNotMatch(source, /import\s*\(|require\s*\(/);
  assert.doesNotMatch(
    source,
    /(?:ReferenceGenerationWorkflow|ReferenceWorkflowRegistry|referenceOperationPipeline|operationBindings|providerClients?|providers?|materializers?|outputIngestion|providerUploads?|workflowEntryRuntime|workflowApi|next\/|react|node:|http|sql|postgres|queue|worker|poll)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /(?:credential|apiKey|cookie|authorizationHeader|signedUrl|providerReference|storageLocator|rawReceipt|stackTrace|filesystemPath)/i);
  assert.doesNotMatch(source, /\b(?:NextRequest|NextResponse|RouteHandler)\b/);
  assert.doesNotMatch(source, /\b(?:new\s+)?(?:globalThis\.)?(?:Request|Response)\s*\(/);

  for (const publicType of [
    "WorkflowEntryRequestIdentity",
    "WorkflowEntryIdempotencyIdentity",
    "WorkflowEntryAttemptIdentity",
    "WorkflowEntryResumeIdentity",
    "WorkflowEntrySelection",
    "WorkflowEntryInput",
    "WorkflowEntryInputEnvelope",
    "WorkflowEntryContext",
    "WorkflowEntryCancellationRequest",
    "WorkflowEntryValidationIssue",
    "WorkflowEntryValidationResult",
    "WorkflowEntryAuthorizationDecision",
    "WorkflowInvocationRequest",
    "WorkflowEntryResumeRequest",
    "WorkflowEntryReconciliationRequest",
    "WorkflowEntryErrorClassification",
    "WorkflowEntryAuditEntry",
    "WorkflowEntryAudit",
    "WorkflowEntryAcceptedResult",
    "WorkflowEntryCompletedResult",
    "WorkflowEntryPartialResult",
    "WorkflowEntryFailedResult",
    "WorkflowEntryCancelledResult",
    "WorkflowEntryRecoveryRequiredResult",
    "WorkflowEntryRejectedResult",
    "WorkflowEntryResult",
  ]) {
    assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));
  }
  assert.match(source, /metadata: readonly WorkflowEntryMetadataField\[\]/);
  assert.match(source, /issues: readonly WorkflowEntryValidationIssue\[\]/);
  assert.match(source, /entries: readonly WorkflowEntryAuditEntry\[\]/);
});
