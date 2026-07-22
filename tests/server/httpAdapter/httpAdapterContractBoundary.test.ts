import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HTTP Adapter Contract remains type-only and independent of transport implementations", async () => {
  const source = await readFile(new URL("../../../lib/server/httpAdapter/types.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(?:function|class|const|let|var|enum|namespace|constructor)\b/);
  assert.doesNotMatch(source, /(?:=>|\bPromise\s*<|import\s*\(|export\s+default)/);
  assert.doesNotMatch(
    source,
    /(?:NextRequest|NextResponse|RouteHandler|ReferenceGenerationJob|ReferenceServerComposition|ReferenceWorkflow|providerClients?|providers?|materializers?|outputIngestion|queue|worker|poll|next\/|react|node:|sql|postgres)/i,
  );
  assert.doesNotMatch(source, /\b(?:new\s+)?(?:globalThis\.)?(?:Request|Response)\s*\(/);
  assert.doesNotMatch(source, /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval)/);
  assert.doesNotMatch(source, /\b(?:execute|invoke|resolve|create)\s*\(/);

  for (const publicType of [
    "HttpRequestEnvelope",
    "HttpResponseEnvelope",
    "HttpRequestMetadata",
    "HttpRequestIdentity",
    "HttpCorrelationIdentity",
    "HttpRouteClassification",
    "HttpMethodClassification",
    "HttpBodyProjection",
    "HttpHeaderProjection",
    "HttpValidationIssue",
    "HttpValidation",
    "HttpFailureClassification",
    "HttpResultProjection",
    "HttpAuditEntry",
    "HttpAudit",
  ]) assert.match(source, new RegExp(`export\\s+type\\s+${publicType}\\b`));

  assert.match(source, /headers: readonly HttpHeaderProjection\[\]/);
  assert.match(source, /entries: readonly HttpAuditEntry\[\]/);
  assert.match(source, /sequence: number/);
});
