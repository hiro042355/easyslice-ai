import test from "node:test";
import assert from "node:assert/strict";
import type { Sensitive } from "../../lib/assets/types";
import type { ReferenceAsyncWorkflowResult, ReferenceAsyncWorkflowStatus } from "../../lib/workflowIntegration/types";
import { audit } from "../../lib/workflowIntegration/workflowIntegrationUtils";
import { mapIntegrationResult } from "../../lib/server/workflowEntry/referenceWorkflowResultProjection";
import { reasons } from "../../lib/workflowEntry/workflowEntryUtils";
const confidentialFixture = <T>(value: T): Sensitive<T> => value as Sensitive<T>;
const audited = (status: ReferenceAsyncWorkflowStatus) => audit(status, "generate-vocal", [], { finalPersistenceStatus: "committed" });
const cases: ReferenceAsyncWorkflowResult[] = [
  { status: "accepted", acceptedKind: "provider-upload", pending: confidentialFixture({ referenceVersion: "1.0" as const, kind: "provider-upload" as const, pendingRef: "synthetic-upload" }), audit: audited("accepted") },
  { status: "accepted", acceptedKind: "generation-job", job: confidentialFixture({ providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal" as const, jobReference: "synthetic-job", clientVersion: "1.0.0" }), audit: audited("accepted") },
  { status: "completed", assets: [], requiredOutputsComplete: true, audit: audited("completed") },
  { status: "degraded", assets: [], requiredOutputsComplete: true, audit: audited("degraded") },
  { status: "partial", assets: [], requiredOutputsComplete: false, issues: [], audit: audited("partial") },
  { status: "failed", issues: [], audit: audited("failed") },
  { status: "cancelled", issues: [], audit: audited("cancelled") },
  { status: "conflict", issues: [], audit: audited("conflict") },
];
for (const [index, input] of cases.entries()) test("typed result projection preserves a canonical outcome " + index, () => {
  const before = structuredClone(input);
  const result = mapIntegrationResult(input, "generate-vocal", 2);
  assert.equal(result.status, input.status === "conflict" ? "failed" : input.status);
  assert.equal(result.operation, "generate-vocal");
  assert.equal(result.audit.auditVersion, "1.0");
  assert.equal(result.audit.finalPersistenceStatus, "committed");
  assert.notStrictEqual(result.audit, input.audit);
  assert.deepEqual(input, before);
  if ("assets" in result && "assets" in input) assert.notStrictEqual(result.assets, input.assets);
  if (result.status === "accepted" && result.acceptedKind === "provider-upload") assert.equal(result.pending.pendingRef, "synthetic-upload");
  if (result.status === "accepted" && result.acceptedKind === "generation-job") assert.equal(result.job.jobReference, "synthetic-job");
});
test("missing upstream persistence evidence rejects projection without fabricating committed", () => {
  const input: ReferenceAsyncWorkflowResult = { status: "completed", assets: [], requiredOutputsComplete: true, audit: audit("completed", "generate-vocal", []) };
  const result = mapIntegrationResult(input, "generate-vocal");
  assert.equal(result.status, "failed");
  assert.equal(result.audit.finalPersistenceStatus, "not-run");
  assert.ok(!("assets" in result));
  if (result.status === "failed") {
    assert.equal(result.failureStage, "result-projection");
    assert.equal(result.issues[0].retryable, false);
  }
});
test("an upstream outcome cannot be relabelled as another authorized operation", () => {
  const result = mapIntegrationResult(cases[0], "generate-music");
  assert.equal(result.status, "failed");
  assert.equal(result.operation, "generate-music");
  assert.ok(!("pending" in result));
});
test("existing partial and contract-mismatch reasons are part of the canonical diagnostic ordering", () => {
  assert.deepEqual(reasons(["output-ingestion-partial", "internal-contract-mismatch"]), ["internal-contract-mismatch", "output-ingestion-partial"]);
});
