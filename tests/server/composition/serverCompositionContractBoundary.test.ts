import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Server Composition Contract remains declarative, type-only, and transport-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/composition/types.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(?:function|class|const|let|var|enum|namespace|constructor)\b/);
  assert.doesNotMatch(source, /(?:=>|\bPromise\s*<|import\s*\(|export\s+default)/);
  assert.doesNotMatch(
    source,
    /(?:ReferenceWorkflowEntryRuntime|ReferenceGenerationWorkflow|ReferenceWorkflowRegistry|ReferenceOperationPipeline|outputIngestion|providerClients?|providers?|materializers?|workflowEntryRuntime|workflowApi|next\/|react|node:|http|sql|postgres|queue|worker|poll)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /\b(?:NextRequest|NextResponse|RouteHandler|Request|Response)\b/);
  assert.doesNotMatch(source, /(?:singleton|globalComposition|defaultComposition|defaultRegistry)/i);
  assert.doesNotMatch(
    source,
    /(?:credential|token|apiKey|cookie|authorizationHeader|signedUrl|providerSecret|storageLocator|filesystemPath|rawReceipt|rawDependencyError|stackTrace|environmentVariable|processMetadata|registrySnapshot)/i,
  );
  assert.doesNotMatch(source, /\b(?:execute|invoke|resolve|create)\s*\(/);

  for (const publicType of [
    "ServerCompositionVersion",
    "ServerCompositionIdentity",
    "ServerCapabilityIdentity",
    "ServerDependencyIdentity",
    "ServerCompositionDefinition",
    "ServerDependencySlot",
    "ServerCapabilityReference",
    "ServerCompositionInput",
    "ServerCompositionContext",
    "ServerDependencyResolution",
    "ServerCompositionResolution",
    "ServerCompositionValidationIssue",
    "ServerCompositionValidationResult",
    "ServerCompositionLifecycle",
    "ServerWorkflowEntryCapability",
    "ServerHealthCapability",
    "ServerCompositionCapabilities",
    "ServerCompositionErrorCode",
    "ServerCompositionFailure",
    "ServerCompositionAuditEntry",
    "ServerCompositionAudit",
    "ServerCompositionReadyResult",
    "ServerCompositionDegradedResult",
    "ServerCompositionUnavailableResult",
    "ServerCompositionResult",
  ]) assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));

  assert.match(source, /dependencies: readonly ServerDependencySlot\[\]/);
  assert.match(source, /declarationOrder: number/);
  assert.match(source, /requirement: "required" \| "optional"/);
  assert.match(source, /lifecycle: "ready"/);
  assert.match(source, /lifecycle: "degraded"/);
  assert.match(source, /lifecycle: "unavailable"/);
});
