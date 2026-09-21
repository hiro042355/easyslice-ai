import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resumePath = new URL("../../lib/operationPipelines/referenceOperationResumeTypes.ts", import.meta.url);
const descriptorPath = new URL("../../lib/operationPipelines/operationPipelineDescriptorTypes.ts", import.meta.url);
const genericPath = new URL("../../lib/operationPipelines/types.ts", import.meta.url);
const publicResultPath = new URL("../../lib/workflows/types.ts", import.meta.url);

test("keeps Reference resume contracts outside the generic foundation", async () => {
  const [resume, generic] = await Promise.all([readFile(resumePath, "utf8"), readFile(genericPath, "utf8")]);
  assert.match(resume, /Reference-only contracts/);
  assert.match(resume, /export type OperationResumePipelineInput/);
  assert.doesNotMatch(generic, /OperationResumePipeline|ReferenceTransport|Sensitive/);
});

test("defines the exact non-cancellable Resume V1 statuses", async () => {
  const source = await readFile(resumePath, "utf8");
  const block = source.slice(source.indexOf("export type OperationResumePipelineStatus"), source.indexOf("export type OperationPipelineReasonCode"));
  assert.deepEqual([...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]), [
    "completed", "degraded", "partial", "accepted", "acceptance-unknown", "failed",
  ]);
  assert.doesNotMatch(block, /cancelled|cancellation/i);
});

test("defines the exact Resume V1 reason-code set", async () => {
  const source = await readFile(resumePath, "utf8");
  const block = source.slice(source.indexOf("export type OperationPipelineReasonCode"), source.indexOf("export type OperationPipelineIssue"));
  assert.deepEqual([...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]), [
    "adapter-request-record-missing", "adapter-request-record-expired", "adapter-request-record-deleted",
    "adapter-request-unauthorized", "adapter-request-schema-mismatch", "adapter-request-adapter-mismatch",
    "adapter-request-operation-mismatch", "adapter-request-resolution-failed", "ready-asset-projection-failed",
    "materializer-binding-missing", "materializer-binding-retired", "materialization-failed",
    "transport-bridge-failed", "credential-invalid", "provider-submit-failed", "generation-acceptance-unknown",
    "response-normalization-failed", "provider-output-reference-invalid", "expected-output-invalid",
    "output-ingestion-failed", "output-ingestion-partial", "operation-pipeline-completed", "reconciliation-required",
  ]);
});

test("separates descriptor metadata from Reference runtime contracts", async () => {
  const [resume, descriptor] = await Promise.all([readFile(resumePath, "utf8"), readFile(descriptorPath, "utf8")]);
  assert.match(resume, /export type OperationResumePipelineBinding/);
  assert.doesNotMatch(descriptor, /referenceOperationResumeTypes|OperationResumePipelineBinding|execute\s*\(/);
  assert.doesNotMatch(descriptor, /credential|secret|endpoint|url|persistence|idempotency/i);
});

test("does not add caller or public workflow-result authority", async () => {
  const [resume, publicResult] = await Promise.all([readFile(resumePath, "utf8"), readFile(publicResultPath, "utf8")]);
  assert.doesNotMatch(resume, /endpoint|caller|assetUrl|accessToken|refreshToken|plaintextSecret/i);
  assert.doesNotMatch(resume, /ReferenceWorkflowResult/);
  assert.match(publicResult, /export type ReferenceWorkflowResult/);
  assert.doesNotMatch(publicResult, /OperationResumePipeline/);
});

test("defines truthful degraded and restricted-request boundaries", async () => {
  const source = await readFile(resumePath, "utf8");
  assert.match(source, /status: "invalid" \| "unsupported-degraded"/);
  assert.doesNotMatch(source, /omittedCount/);
  for (const status of ["resolved", "missing", "expired", "unauthorized", "deleted", "schema-mismatch", "adapter-mismatch", "operation-mismatch", "failed"]) {
    assert.match(source, new RegExp(`"${status}"`));
  }
});
