import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = new URL("../../lib/operationPipelines/types.ts", import.meta.url);

test("Operation Pipeline Contract remains type-only and dependency-closed", async () => {
  const source = await readFile(contractPath, "utf8");

  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /\b(?:const|let|var|function|class|enum|namespace)\b/);
  assert.doesNotMatch(source, /import\s*\(|require\s*\(/);
  assert.doesNotMatch(
    source,
    /(?:workflows?|providerClients?|providers?|materializers?|outputIngestion|providerUploads?|react|next\/|node:|http|sql|postgres|queue)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval)/,
  );

  for (const publicType of [
    "OperationIdentity",
    "OperationPipelineStageDefinition",
    "OperationPipelineDependency",
    "OperationPipelineDefinition",
    "OperationPipelineState",
    "OperationPipelineInput",
    "OperationPipelineOutput",
    "OperationPipelineContext",
    "OperationPipelineTransition",
    "OperationPipelineValidationResult",
    "OperationPipelineCancellationMarker",
    "OperationPipelineRetryRecommendation",
    "OperationPipelineAudit",
    "OperationPipelineResult",
  ]) {
    assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));
  }

  assert.match(source, /readonly OperationPipelineStageDefinition\[\]/);
  assert.match(source, /readonly OperationPipelineDependency\[\]/);
  assert.match(source, /contractVersion: "1\.0"/);
  assert.match(source, /contextVersion: "1\.0"/);
  assert.match(source, /auditVersion: "1\.0"/);
});
