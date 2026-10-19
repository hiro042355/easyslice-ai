import test from "node:test";
import assert from "node:assert/strict";
import type { Sensitive } from "../../lib/assets/types";
import type { SensitiveConstructionResult } from "../../lib/sensitiveBoundary/types";
import type { ReferenceAsyncWorkflowInput } from "../../lib/workflowIntegration/types";
import type { AcceptedUploadPersistenceData } from "../../lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput";
import {
  createSensitiveAcceptedPendingRecord, createSensitiveAcceptedStateProjection, createSensitiveAcceptedUploadPersistence,
  createSensitiveGenerationPersistenceInput, createSensitiveGenerationRecord, createSensitiveGenerationRecoveryInput,
  createSensitiveImportedAssetReferences, createSensitiveOperationAdapterRequest, createSensitivePollAttempt,
  createSensitiveReferenceKey, createSensitiveReferenceResponse, createSensitiveRegisteredWorkflow,
  createSensitiveRestrictedWorkflowRecords, createSensitiveResumePipelineInput, requireSensitiveReferenceKey,
} from "../../lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput";
import { ReferencePendingPollV2Store } from "../../lib/pendingPollV2/referencePendingPollV2Store";
import { projectAcceptedStateToPendingPollStateV2 } from "../../lib/pendingPollV2/pendingPollStateV2";
import { vocalRequest } from "../materializers/materializerTestFixtures";

const created = <T>(result: SensitiveConstructionResult<T>): Sensitive<T> => {
  if (result.status !== "created") assert.fail("synthetic constructor fixture rejected");
  return result.value;
};
// Only upstream provider fixture labels; never authentication/ownership authority.
const synthetic = <T>(value: T): Sensitive<T> => structuredClone(value) as Sensitive<T>;
const expiry = "2031-01-01T00:00:00.000Z";
const session = synthetic({ sessionVersion: "1.0" as const, sessionRef: "synthetic-session", providerId: "reference-provider", operation: "generate-vocal" as const, mode: "single-request" as const, expiresAt: expiry });
const job = synthetic({ providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal" as const, jobReference: "synthetic-job", clientVersion: "1.0.0" });
const snapshot = { assetRef: { assetId: "synthetic-audio", kind: "audio" as const, mimeType: "audio/wav" }, sizeBytes: 1024,
  metadata: { type: "audio" as const, durationPresent: true, dimensionsPresent: false },
  integrity: { checksumVerified: true, checksumAlgorithm: "sha256" as const, sizeVerified: true } };
function workflow(): ReferenceAsyncWorkflowInput {
  return {
    contractVersion: "1.0", operation: "generate-vocal",
    acceptedStateProjection: created(createSensitiveAcceptedStateProjection({ contractVersion: "1.0",
      state: { stateVersion: "2.0", planFingerprint: "synthetic-plan", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", attempt: 1,
        items: [{ itemVersion: "2.0", itemIndex: 0, assetIndex: 0, usage: "guide-vocal", requirement: "required", sourceSnapshot: snapshot, status: "accepted", session }] },
      referenceExpiresAt: expiry, stateExpiresAt: expiry, initialRevision: 1,
      omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" } })),
    context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "synthetic-operation",
      acceptanceKeyRef: "synthetic-acceptance", pollKeyRef: "synthetic-poll", resumeClaimKeyRef: "synthetic-claim",
      materializationKeyRef: "synthetic-materialization", generationKeyRef: requireSensitiveReferenceKey("synthetic-generation"),
      ingestionKeyRef: "synthetic-ingestion", finalResultKeyRef: "synthetic-final", cancellationRequested: false },
    authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "synthetic-tenant",
      region: "synthetic-region", operation: "generate-vocal", permission: "run-reference-async-workflow", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
    workflowSchemaVersion: "1.0", workflowEngineVersion: "reference-v1",
    bindings: { materializerBindingId: "synthetic-materializer", generationClientBindingId: "synthetic-client", outputIngestionBindingId: "synthetic-ingestion" },
    restrictedAdapterRequest: created(createSensitiveOperationAdapterRequest(vocalRequest())),
    restrictedRecords: created(createSensitiveRestrictedWorkflowRecords({ originalInputRecordRef: "synthetic-original", adapterRequestRecordRef: "synthetic-adapter", schemaFingerprint: "synthetic-schema", expiresAt: expiry })),
  };
}
const invalid = (constructor: (value: never) => unknown, value: unknown) => {
  const result: unknown = Reflect.apply(constructor, undefined, [value]);
  assert.deepEqual(result, { status: "invalid", issues: [{ reasonCode: "sensitive-construction-invalid" }] });
  assert.ok(!JSON.stringify(result).includes("synthetic-private-sentinel"));
};
test("reference key classification validates shape and never exposes invalid values", () => {
  const key: Sensitive<string> = created(createSensitiveReferenceKey("synthetic-key"));
  assert.equal(key, "synthetic-key");
  for (const value of ["", "https://synthetic-private-sentinel.invalid", "\nsynthetic-private-sentinel", "x".repeat(513)]) invalid(createSensitiveReferenceKey, value);
  assert.throws(() => requireSensitiveReferenceKey("\nsynthetic-private-sentinel"), { message: "sensitive-reference-key-invalid" });
});
test("imported asset collection is copied and rejects invalid nested values", () => {
  const value = [{ assetId: "synthetic-asset", kind: "voice" as const, role: "primary" as const, mimeType: "audio/wav", sizeBytes: 1024, checksum: "sha256:synthetic", availability: "available" as const }];
  const result = created(createSensitiveImportedAssetReferences(value));
  value[0].assetId = "changed";
  assert.equal(result[0].assetId, "synthetic-asset");
  for (const patch of [{ kind: "invented" }, { sizeBytes: -1 }, { role: "invented" }, { availability: "invented" }]) invalid(createSensitiveImportedAssetReferences, [{ ...value[0], ...patch }]);
});
test("reference response classification matches bounded opaque output response contract", () => {
  const response = { responseVersion: "1.0" as const, operation: "generate-vocal" as const, outcome: "completed" as const, providerOutputReferences: ["synthetic-output"], safeMetadata: { outputCount: 1 } };
  assert.deepEqual(created(createSensitiveReferenceResponse(response)), response);
  for (const patch of [{ safeMetadata: { outputCount: 2 } }, { providerOutputReferences: ["https://synthetic-private-sentinel.invalid"] }, { providerOutputReferences: ["duplicate", "duplicate"], safeMetadata: { outputCount: 2 } }]) invalid(createSensitiveReferenceResponse, { ...response, ...patch });
  let calls = 0;
  const accessor = { ...response };
  Object.defineProperty(accessor, "safeMetadata", { get() { calls++; return { outputCount: 1 }; } });
  invalid(createSensitiveReferenceResponse, accessor);
  assert.equal(calls, 0);
});
test("accepted records and poll attempts preserve canonical version and provider tuple", () => {
  const input = workflow(), value = { recordVersion: "1.0" as const, state: input.acceptedStateProjection.state, expiresAt: expiry };
  assert.equal(created(createSensitiveAcceptedPendingRecord(value)).state.operation, "generate-vocal");
  invalid(createSensitiveAcceptedPendingRecord, { ...value, recordVersion: "invented" });
  const poll = { session, sourceSnapshot: snapshot, providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal" as const, baselineTime: input.context.baselineTime, attempt: 1 };
  assert.equal(created(createSensitivePollAttempt(poll)).session.sessionRef, session.sessionRef);
  invalid(createSensitivePollAttempt, { ...poll, providerId: "foreign-provider" });
});
test("generation records require their actual job operation/provider binding", () => {
  const input = workflow(), value = { recordVersion: "1.0" as const, providerId: job.providerId, providerApiVersion: job.providerApiVersion, operation: job.operation,
    clientBindingId: job.clientVersion, normalizerBindingId: "synthetic-normalizer", ingestionBindingId: "synthetic-ingestion",
    originalInputRecordRef: "synthetic-original", adapterRequestRecordRef: "synthetic-adapter", generationIdentity: "synthetic-generation",
    jobReference: job, finalResultIdentity: "synthetic-final", baselineTime: input.context.baselineTime, tenantRef: "synthetic-tenant",
    region: "synthetic-region", revision: 1, status: "pending" as const, lifecycle: "generation-pending" as const, expiresAt: expiry };
  assert.equal(created(createSensitiveGenerationRecord(value)).jobReference.jobReference, job.jobReference);
  invalid(createSensitiveGenerationRecord, { ...value, operation: "generate-music" });
  invalid(createSensitiveGenerationRecord, { ...value, providerId: "foreign-provider" });
});
test("resume and recovery envelopes cannot classify an invalid workflow context", () => {
  const input = workflow(), resume = { operation: input.operation, assets: synthetic<readonly []>([]), pollStatus: "ready" as const, pollRevision: 1, claimIdentity: "synthetic-claim",
    bindings: input.bindings, restrictedPayloadRef: "synthetic-adapter", authorization: input.authorization, context: input.context };
  assert.equal(created(createSensitiveResumePipelineInput(resume)).claimIdentity, "synthetic-claim");
  invalid(createSensitiveResumePipelineInput, { ...resume, authorization: { ...input.authorization, workflowOwnershipVerified: false } });
  const recovery = { lookup: { status: "not-found" as const, audit: { auditVersion: "1.0" as const, status: "not-found" as const, reasonCodes: ["generation-not-found" as const] } }, workflowInput: input };
  assert.equal(created(createSensitiveGenerationRecoveryInput(recovery)).lookup.status, "not-found");
  invalid(createSensitiveGenerationRecoveryInput, { ...recovery, workflowInput: { ...input, context: { ...input.context, attempt: 0 } } });
  const persistence = { job, workflowInput: input, finalResultIdentity: "synthetic-final" };
  assert.equal(created(createSensitiveGenerationPersistenceInput(persistence)).job.operation, "generate-vocal");
  invalid(createSensitiveGenerationPersistenceInput, { ...persistence, job: { ...job, operation: "generate-music" } });
});
test("registered workflow classification preserves a real internal poll key and rejects bad resume revisions", async () => {
  const input = workflow(), projected = projectAcceptedStateToPendingPollStateV2(input.acceptedStateProjection);
  if (projected.status !== "projected") assert.fail("synthetic poll projection failed");
  const store = new ReferencePendingPollV2Store(), saved = await store.create("synthetic-store", projected.state);
  if (saved.status !== "created") assert.fail("synthetic poll store failed");
  const value = { input, pollKey: saved.key, finalIdentity: "synthetic-final", resumeRevision: 1, resumeStatus: "waiting-upload" as const };
  assert.equal(created(createSensitiveRegisteredWorkflow(value)).pollKey.internalKey, saved.key.internalKey);
  invalid(createSensitiveRegisteredWorkflow, { ...value, resumeRevision: 0 });
});
test("accepted persistence classification labels required nested data without granting owner authority", () => {
  const input = workflow(), common = { operation: input.operation, tenantRef: input.authorization.tenantRef, region: input.authorization.region };
  const value: AcceptedUploadPersistenceData = {
    contractVersion: "1.0", acceptanceIdempotencyKey: "synthetic-acceptance", gateState: input.acceptedStateProjection.state,
    workflowResumeSeed: { seedVersion: "1.0", workflowSchemaVersion: "1.0", workflowEngineVersion: "reference-v1", ...common, providerId: "reference-provider", providerApiVersion: "reference-api-v1", materializerBindingId: "synthetic-materializer", generationClientBindingId: "synthetic-client", outputIngestionBindingId: "synthetic-ingestion", originalInputRecordRef: "synthetic-original", restrictedAdapterRequestRef: "synthetic-adapter", adapterOutputFingerprint: "synthetic-fingerprint", gatePlanFingerprint: "synthetic-plan" },
    originalInputRecord: { recordVersion: "1.0", ...common, contentKind: "vocal", encryptedPayloadRef: "synthetic-original", schemaFingerprint: "synthetic-schema", expiresAt: expiry },
    adapterRequestRecord: { recordVersion: "1.0", ...common, adapterId: "synthetic-adapter", adapterVersion: "1.0", requestSchemaVersion: "1.0", encryptedRequestRef: "synthetic-adapter", requestFingerprint: "synthetic-fingerprint", expiresAt: expiry },
    policy: { policyVersion: "1.0", referenceExpiresAt: expiry, pendingStateExpiresAt: expiry, resumeRecordExpiresAt: expiry, journalExpiresAt: expiry, region: common.region },
    context: { contextVersion: "1.0", baselineTime: input.context.baselineTime, attempt: 1, operationRef: "synthetic-operation" },
    authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", ...common, permission: "persist-accepted-upload", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
  };
  const result = created(createSensitiveAcceptedUploadPersistence(value));
  assert.equal(result.workflowResumeSeed.originalInputRecordRef, value.workflowResumeSeed.originalInputRecordRef);
  invalid(createSensitiveAcceptedUploadPersistence, { ...value, authorization: { ...value.authorization, workflowOwnershipVerified: false } });
});
