import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputIngestionPlan } from "../../lib/outputIngestion/outputIngestionPlan";
import type { OutputIngestionInput } from "../../lib/outputIngestion/types";

function fixture(): OutputIngestionInput {
  return {
    contractVersion: "1.0",
    providerId: "reference-provider",
    providerApiVersion: "v1",
    operation: "generate-music",
    generationResult: {
      resultSchemaVersion: "1.0",
      status: "completed",
      providerId: "reference-provider",
      adapterId: "reference-music",
      adapterVersion: "1.0",
      outputs: [{ assetId: "provider-output-primary", kind: "audio", role: "primary" }],
      warnings: [],
    },
    expectedOutput: {
      contractVersion: "1.0",
      kind: "audio",
      requiredRoles: ["primary"],
      optionalRoles: ["stem"],
      allowedMimeTypes: ["audio/wav"],
      allowedCodecs: ["PCM"],
      allowedContainers: ["WAV"],
      maximumOutputCount: 2,
      maximumSizeBytes: 20_000,
      requireChecksum: true,
      requireDurationMetadata: true,
      requireDimensions: false,
    },
    policy: {
      policyVersion: "1.0",
      externalFetchAllowed: true,
      allowedProviderIds: ["reference-provider"],
      maximumDownloadBytes: 10_000,
      requireHttps: true,
      redirectPolicy: "none",
      retentionClass: "project",
      sensitivityClass: "standard",
      scanRequired: true,
      metadataStrippingRequired: true,
      deletionPending: false,
    },
    context: { contextVersion: "1.0", operationRef: "operation-ref", baselineTime: "2026-07-22T00:00:00.000Z", attempt: 1, cancellation: { stage: "none" } },
    idempotency: { ingestionKeyRef: "ingestion-ref" },
  };
}

function reason(input: OutputIngestionInput): readonly string[] {
  const result = buildOutputIngestionPlan(input);
  assert.equal(result.status, "invalid");
  return result.issues.map((entry) => entry.reasonCode);
}

test("builds a deterministic immutable required-output plan", () => {
  const input = fixture();
  const first = buildOutputIngestionPlan(input);
  const second = buildOutputIngestionPlan(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.status, "planned");
  if (first.status !== "planned") return;
  assert.equal(first.plan.items.length, 1);
  assert.equal(first.plan.items[0].requirement, "required");
  assert.equal(first.plan.items[0].maximumSizeBytes, 10_000);
  assert.deepEqual(first.plan.items[0].allowedCodecs, ["pcm"]);
  assert.equal("allowedProviderIds" in first.plan.policy, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.plan.items), true);
  (input.policy.allowedProviderIds as string[])[0] = "changed";
  input.context.operationRef = "changed";
  input.generationResult.outputs[0].assetId = "changed";
  assert.equal(first.plan.context.operationRef, "operation-ref");
  assert.equal(first.references.items[0].providerOutputReference, "provider-output-primary");
});

test("preserves provider output order and optional semantics", () => {
  const input = fixture();
  input.generationResult.outputs.push({ assetId: "provider-output-stem", kind: "audio", role: "stem" });
  const result = buildOutputIngestionPlan(input);
  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;
  assert.deepEqual(result.plan.items.map(({ slotIndex, role, requirement }) => ({ slotIndex, role, requirement })), [
    { slotIndex: 0, role: "primary", requirement: "required" },
    { slotIndex: 1, role: "stem", requirement: "optional" },
  ]);
});

test("accepts a missing optional output", () => {
  assert.equal(buildOutputIngestionPlan(fixture()).status, "planned");
});

test("rejects contract, identity, role, count, reference and policy violations", () => {
  const cases: Array<[string, (input: OutputIngestionInput) => void, string]> = [
    ["contract", (x) => { (x as { contractVersion: string }).contractVersion = "2.0"; }, "unsupported-contract-version"],
    ["result-version", (x) => { (x.generationResult as { resultSchemaVersion: string }).resultSchemaVersion = "2.0"; }, "generation-result-invalid"],
    ["provider", (x) => { x.generationResult.providerId = "different"; }, "provider-mismatch"],
    ["api", (x) => { x.providerApiVersion = "https://secret.invalid"; }, "provider-api-version-mismatch"],
    ["operation", (x) => { (x as { operation: string }).operation = "unknown"; }, "operation-mismatch"],
    ["required", (x) => { x.generationResult.outputs = []; }, "required-output-missing"],
    ["expected-duplicate", (x) => { x.expectedOutput.optionalRoles = ["primary"]; }, "output-role-invalid"],
    ["unexpected", (x) => { x.generationResult.outputs[0].role = "preview"; }, "output-role-invalid"],
    ["reference-duplicate", (x) => { x.generationResult.outputs.push({ ...x.generationResult.outputs[0], role: "stem" }); }, "duplicate-output-reference"],
    ["role-duplicate", (x) => { x.generationResult.outputs.push({ ...x.generationResult.outputs[0], assetId: "second" }); }, "output-role-invalid"],
    ["count", (x) => { x.expectedOutput.maximumOutputCount = 1; x.generationResult.outputs.push({ assetId: "second", kind: "audio", role: "stem" }); }, "output-count-exceeded"],
    ["allowlist", (x) => { x.policy.allowedProviderIds = ["different"]; }, "provider-mismatch"],
    ["raw-url", (x) => { x.generationResult.outputs[0].assetId = "https://secret.invalid/output"; }, "output-reference-invalid"],
    ["cancellation", (x) => { (x.context.cancellation as { stage: string }).stage = "unknown"; }, "input-shape-invalid"],
  ];
  for (const [label, mutate, expected] of cases) {
    const input = fixture();
    mutate(input);
    assert.ok(reason(input).includes(expected), label);
  }
});

test("invalid diagnostics are deterministic and never expose restricted values", () => {
  const input = fixture();
  input.generationResult.outputs[0].assetId = "https://token.example/private-value";
  input.policy.allowedProviderIds = ["different"];
  const first = buildOutputIngestionPlan(input);
  const second = buildOutputIngestionPlan(input);
  assert.deepEqual(first, second);
  const text = JSON.stringify(first);
  assert.doesNotMatch(text, /token\.example|private-value|operation-ref|ingestion-ref/);
});
