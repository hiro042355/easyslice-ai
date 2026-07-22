import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Generation Job Entry Contract remains type-only and transport-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/generationJobEntry/types.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(?:function|class|const|let|var|enum|namespace|constructor)\b/);
  assert.doesNotMatch(source, /(?:=>|\bPromise\s*<|import\s*\(|export\s+default)/);
  assert.doesNotMatch(
    source,
    /(?:ReferenceGenerationJob|ReferenceWorkflow|ReferenceServerComposition|providerClients?|providers?|materializers?|outputIngestion|upload|queue|worker|poll|scheduler|retry|next\/|react|node:|http|sql|postgres)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /\b(?:NextRequest|NextResponse|RouteHandler)\b/);
  assert.doesNotMatch(source, /\b(?:new\s+)?(?:globalThis\.)?(?:Request|Response)\s*\(/);
  assert.doesNotMatch(source, /(?:singleton|globalRegistry|defaultRuntime)/i);
  assert.doesNotMatch(source, /\b(?:execute|invoke|resolve|create)\s*\(/);

  for (const publicType of [
    "GenerationJobIdentity",
    "GenerationJobVersion",
    "GenerationJobRequest",
    "GenerationJobSelection",
    "GenerationJobContext",
    "GenerationJobMetadata",
    "GenerationJobPriority",
    "GenerationJobSchedulingClassification",
    "GenerationJobResumeReference",
    "GenerationJobCancellationReference",
    "GenerationJobValidationIssue",
    "GenerationJobValidation",
    "GenerationJobAuditEntry",
    "GenerationJobAudit",
    "GenerationJobResultProjection",
    "GenerationJobFailureClassification",
  ]) assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));

  assert.match(source, /fields: readonly Readonly</);
  assert.match(source, /entries: readonly GenerationJobAuditEntry\[\]/);
  assert.match(source, /sequence: number/);
});
