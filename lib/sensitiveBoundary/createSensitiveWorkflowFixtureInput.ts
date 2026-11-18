import type { ResolvedAsset, Sensitive } from "@/lib/assets/types";
import type { ImportedAssetReference } from "@/lib/outputIngestion/types";
import type { ReferenceSafeResponseDTO } from "@/lib/providerClients/types";
import { isSafeOpaqueRef } from "@/lib/providerClients/providerClientUtils";
import type { AcceptedPendingStateRecord, OriginalWorkflowInputRecord, PendingUploadAcceptedPersistenceInput, ProviderUploadPendingStateItemV2, ProviderUploadPendingStateV2, RestrictedAdapterRequestRecord } from "@/lib/acceptedPersistence/types";
import type { WorkflowResumeSeed } from "@/lib/workflowResume/types";
import type { ReferenceGenerationJobRecord } from "@/lib/workflowEntry/types";
import type { OperationAdapterRequest } from "@/lib/operationPipelines/referenceOperationResumeTypes";
import type { AcceptedStateProjectionInput, PendingUploadPollV2Client } from "@/lib/pendingPollV2/types";
import { validatePendingPollStateData } from "@/lib/pendingPollV2/pendingPollStateV2Validation";
import type { ReferenceAsyncWorkflowInput, ReferenceGenerationAcceptanceUnknownRecovery, ReferenceGenerationAcceptedPersistence, ReferenceResumePipelineInput, RegisterWorkflowIntegrationInternal } from "@/lib/workflowIntegration/types";
import { validAuthorization, validIntegrationContext } from "@/lib/workflowIntegration/workflowIntegrationUtils";
import { validateReferenceMusicInput } from "@/lib/providers/referenceMusicAdapter";
import { validateReferenceMVInput } from "@/lib/providers/referenceMVAdapter";
import { validateReferenceVocalInput } from "@/lib/providers/referenceVocalAdapter";
import type {
  SensitiveConstructionResult,
  SensitiveMusicWorkflowFixtureInputResult,
  SensitiveMVWorkflowFixtureInputResult,
  SensitiveVocalWorkflowFixtureInputResult,
} from "@/lib/sensitiveBoundary/types";
import type {
  ReferenceMusicWorkflowInput,
  ReferenceMVWorkflowInput,
  ReferenceVocalWorkflowInput,
} from "@/lib/workflows/referenceWorkflowTypes";

const INVALID = Object.freeze({
  status: "invalid" as const,
  issues: Object.freeze([{ reasonCode: "sensitive-construction-invalid" as const }]),
});

const READY_ASSET_KINDS = new Set([
  "audio", "voice", "image", "video", "character", "brand", "melody",
]);
const READY_ASSET_USAGES = new Set([
  "audio-conditioning", "reference-image", "reference-video", "character-identity",
  "location-reference", "guide-vocal", "guide-melody", "lyrics-input",
  "preview-source", "export-source",
]);
const READY_ASSET_METADATA_TYPES = new Set(["audio", "video", "image"]);

function markSensitiveInternal<T>(value: T): Sensitive<T> {
  return value as Sensitive<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number" && Number.isFinite(value);
}

function isValidReadyAssetAccess(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode === "signed-url") {
    return typeof value.url === "string" && typeof value.expiresAt === "string";
  }
  if (value.mode === "internal-stream") {
    return typeof value.streamToken === "string" && typeof value.expiresAt === "string";
  }
  if (value.mode === "provider-upload") {
    return typeof value.uploadSourceToken === "string" && typeof value.expiresAt === "string";
  }
  if (value.mode === "provider-native-asset") {
    return typeof value.handle === "string" && isOptionalString(value.expiresAt);
  }
  return false;
}

function isValidReadyAsset(value: unknown): value is ResolvedAsset {
  if (!isRecord(value) || !isRecord(value.assetRef) || !isRecord(value.metadata) ||
      !isRecord(value.integrity)) return false;
  const assetRef = value.assetRef;
  const metadata = value.metadata;
  const integrity = value.integrity;
  return typeof assetRef.assetId === "string" && assetRef.assetId.length > 0 &&
    typeof assetRef.kind === "string" && READY_ASSET_KINDS.has(assetRef.kind) &&
    isOptionalString(assetRef.mimeType) && isOptionalFiniteNumber(assetRef.durationSeconds) &&
    isOptionalFiniteNumber(assetRef.width) && isOptionalFiniteNumber(assetRef.height) &&
    isOptionalString(assetRef.checksum) &&
    typeof value.usage === "string" && READY_ASSET_USAGES.has(value.usage) &&
    (value.requirement === "required" || value.requirement === "optional") &&
    isValidReadyAssetAccess(value.access) &&
    typeof value.sizeBytes === "number" && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 &&
    typeof metadata.type === "string" && READY_ASSET_METADATA_TYPES.has(metadata.type) &&
    typeof metadata.durationPresent === "boolean" && typeof metadata.dimensionsPresent === "boolean" &&
    typeof integrity.checksumVerified === "boolean" &&
    (integrity.checksumAlgorithm === undefined || integrity.checksumAlgorithm === "sha256") &&
    typeof integrity.sizeVerified === "boolean";
}

function isPlainOwnedData(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value !== "object" || Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  if (seen.has(value)) return false;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (descriptor.get || descriptor.set || !("value" in descriptor) ||
        !isPlainOwnedData(descriptor.value, seen)) return false;
  }
  seen.delete(value);
  return true;
}

function validCommon(value: {
  contractVersion: string;
  providerId: string;
  providerApiVersion: string;
  durationSeconds: number;
  context: {
    contextVersion: string;
    operationRef: string;
    baselineTime: string;
    attempt: number;
    scenario: string;
  };
}) {
  return value.contractVersion === "1.0" && value.providerId.length > 0 &&
    value.providerApiVersion.length > 0 && Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0 && value.context.contextVersion === "1.0" &&
    value.context.operationRef.length > 0 && value.context.operationRef.length <= 128 &&
    !value.context.operationRef.includes("://") && !/[\u0000-\u001f\u007f]/.test(value.context.operationRef) &&
    Number.isFinite(Date.parse(value.context.baselineTime)) &&
    Number.isSafeInteger(value.context.attempt) && value.context.attempt > 0 &&
    value.context.scenario === "success";
}

function create<T>(value: T, validate: (candidate: T) => boolean): SensitiveConstructionResult<T> {
  try {
    if (!isPlainOwnedData(value, new WeakSet()) || !validate(value)) return INVALID;
    const copy = structuredClone(value);
    if (!isPlainOwnedData(copy, new WeakSet())) return INVALID;
    return { status: "created", value: markSensitiveInternal(copy) };
  } catch {
    return INVALID;
  }
}

export function createSensitiveCanonicalVocalWorkflowInput(
  value: ReferenceVocalWorkflowInput,
): SensitiveVocalWorkflowFixtureInputResult {
  return create(value, (candidate) => candidate.operation === "generate-vocal" &&
    validCommon(candidate) && validateReferenceVocalInput(candidate.adapterInput).status !== "invalid" &&
    validateReferenceVocalInput(candidate.adapterInput).status !== "unsupported");
}

export function createSensitiveCanonicalMusicWorkflowInput(
  value: ReferenceMusicWorkflowInput,
): SensitiveMusicWorkflowFixtureInputResult {
  return create(value, (candidate) => candidate.operation === "generate-music" &&
    validCommon(candidate) && validateReferenceMusicInput(candidate.adapterInput).status !== "invalid" &&
    validateReferenceMusicInput(candidate.adapterInput).status !== "unsupported");
}

export function createSensitiveCanonicalMVWorkflowInput(
  value: ReferenceMVWorkflowInput,
): SensitiveMVWorkflowFixtureInputResult {
  return create(value, (candidate) => candidate.operation === "generate-mv" &&
    validCommon(candidate) && validateReferenceMVInput(candidate.adapterInput).status !== "invalid" &&
    validateReferenceMVInput(candidate.adapterInput).status !== "unsupported");
}

export function createSensitiveReadyAssetsCollection(
  values: readonly Sensitive<ResolvedAsset>[],
): SensitiveConstructionResult<readonly ResolvedAsset[]> {
  try {
    if (!Array.isArray(values) || !isPlainOwnedData(values, new WeakSet()) ||
        !values.every(isValidReadyAsset)) return INVALID;
    const owned: readonly ResolvedAsset[] = [...values];
    if (!isPlainOwnedData(owned, new WeakSet()) || !owned.every(isValidReadyAsset)) return INVALID;
    return { status: "created", value: markSensitiveInternal<readonly ResolvedAsset[]>(owned) };
  } catch {
    return INVALID;
  }
}

/** Confidentiality classification only. This key is never proof of authentication or ownership. */
export function createSensitiveReferenceKey(value: string): SensitiveConstructionResult<string> {
  return create(value, candidate => typeof candidate === "string" && candidate.trim().length > 0 &&
    candidate.length <= 512 && !/[\u0000-\u001f\u007f]/.test(candidate) && !candidate.includes("://"));
}

/** For server-derived keys; the fixed exception never includes the key value. */
export function requireSensitiveReferenceKey(value: string): Sensitive<string> {
  const classified = createSensitiveReferenceKey(value);
  if (classified.status !== "created") throw new Error("sensitive-reference-key-invalid");
  return classified.value;
}

export function createSensitiveImportedAssetReferences(
  values: readonly ImportedAssetReference[],
): SensitiveConstructionResult<readonly ImportedAssetReference[]> {
  const roles = new Set(["primary", "alternate", "preview", "stem"]);
  const availability = new Set(["available", "processing", "pending-scan", "quarantined", "blocked", "corrupted", "deleted", "expired", "missing"]);
  return create<readonly ImportedAssetReference[]>(values, candidates => Array.isArray(candidates) && candidates.every(candidate =>
    isRecord(candidate) && typeof candidate.assetId === "string" && candidate.assetId.length > 0 &&
    typeof candidate.kind === "string" && READY_ASSET_KINDS.has(candidate.kind) && typeof candidate.role === "string" &&
    roles.has(candidate.role) && typeof candidate.mimeType === "string" &&
    typeof candidate.sizeBytes === "number" && Number.isSafeInteger(candidate.sizeBytes) && candidate.sizeBytes >= 0 &&
    typeof candidate.checksum === "string" && typeof candidate.availability === "string" && availability.has(candidate.availability)));
}

export function createSensitiveReferenceResponse(
  value: ReferenceSafeResponseDTO,
): SensitiveConstructionResult<ReferenceSafeResponseDTO> {
  return create(value, candidate => candidate.responseVersion === "1.0" &&
    ["generate-vocal", "generate-music", "generate-mv"].includes(candidate.operation) && candidate.outcome === "completed" &&
    Array.isArray(candidate.providerOutputReferences) && candidate.providerOutputReferences.length <= 1024 &&
    candidate.providerOutputReferences.every(reference => isSafeOpaqueRef(reference, 256)) &&
    new Set(candidate.providerOutputReferences).size === candidate.providerOutputReferences.length &&
    isRecord(candidate.safeMetadata) && Number.isInteger(candidate.safeMetadata.outputCount) &&
    candidate.safeMetadata.outputCount === candidate.providerOutputReferences.length);
}

type Unlabelled<T> = Omit<T, keyof Sensitive<unknown>>;
const validOperation = (value: unknown) => value === "generate-vocal" || value === "generate-music" || value === "generate-mv";
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const opaqueValues = (values: readonly unknown[]) => values.every(value => typeof value === "string" &&
  value.trim().length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value) && !value.includes("://"));
const validWorkflow = (value: ReferenceAsyncWorkflowInput) => value.contractVersion === "1.0" && validOperation(value.operation) &&
  validIntegrationContext(value.context) && validAuthorization(value.authorization, value.operation) &&
  validDate(value.restrictedRecords.expiresAt);

export function createSensitiveAcceptedPendingRecord(value: Unlabelled<AcceptedPendingStateRecord>): SensitiveConstructionResult<Unlabelled<AcceptedPendingStateRecord>> {
  return create(value, candidate => candidate.recordVersion === "1.0" && candidate.state.stateVersion === "2.0" &&
    validOperation(candidate.state.operation) && validDate(candidate.expiresAt) && Array.isArray(candidate.state.items));
}

export function createSensitiveGenerationRecord(value: Unlabelled<ReferenceGenerationJobRecord>): SensitiveConstructionResult<Unlabelled<ReferenceGenerationJobRecord>> {
  return create(value, candidate => candidate.recordVersion === "1.0" && validOperation(candidate.operation) &&
    candidate.jobReference.operation === candidate.operation && candidate.jobReference.providerId === candidate.providerId &&
    candidate.jobReference.providerApiVersion === candidate.providerApiVersion &&
    Number.isSafeInteger(candidate.revision) && candidate.revision > 0 &&
    ["pending", "completed", "failed", "cancelled", "expired"].includes(candidate.status) &&
    ["generation-pending", "ingesting", "terminal"].includes(candidate.lifecycle) &&
    validDate(candidate.baselineTime) && validDate(candidate.expiresAt) &&
    opaqueValues([candidate.providerId, candidate.providerApiVersion, candidate.clientBindingId, candidate.normalizerBindingId,
      candidate.ingestionBindingId, candidate.originalInputRecordRef, candidate.adapterRequestRecordRef,
      candidate.generationIdentity, candidate.finalResultIdentity, candidate.tenantRef, candidate.region, candidate.jobReference.jobReference]));
}

export function createSensitivePollAttempt(value: Unlabelled<Parameters<PendingUploadPollV2Client["poll"]>[0]>): SensitiveConstructionResult<Unlabelled<Parameters<PendingUploadPollV2Client["poll"]>[0]>> {
  return create(value, candidate => validOperation(candidate.operation) && candidate.session.operation === candidate.operation &&
    candidate.session.providerId === candidate.providerId && validDate(candidate.baselineTime) &&
    Number.isSafeInteger(candidate.attempt) && candidate.attempt > 0 &&
    opaqueValues([candidate.providerId, candidate.providerApiVersion, candidate.session.sessionRef]) &&
    candidate.session.sessionVersion === "1.0" && validDate(candidate.session.expiresAt) &&
    Number.isSafeInteger(candidate.sourceSnapshot.sizeBytes) && candidate.sourceSnapshot.sizeBytes >= 0);
}

export function createSensitiveResumePipelineInput(value: Unlabelled<ReferenceResumePipelineInput>): SensitiveConstructionResult<Unlabelled<ReferenceResumePipelineInput>> {
  return create(value, candidate => validOperation(candidate.operation) && validAuthorization(candidate.authorization, candidate.operation) &&
    validIntegrationContext(candidate.context) && (candidate.pollStatus === "ready" || candidate.pollStatus === "degraded") &&
    Number.isSafeInteger(candidate.pollRevision) && candidate.pollRevision > 0 &&
    opaqueValues([candidate.claimIdentity, candidate.restrictedPayloadRef, candidate.bindings.materializerBindingId,
      candidate.bindings.generationClientBindingId, candidate.bindings.outputIngestionBindingId]) && Array.isArray(candidate.assets));
}

type RecoveryData = Unlabelled<Parameters<ReferenceGenerationAcceptanceUnknownRecovery["recover"]>[0]>;
export function createSensitiveGenerationRecoveryInput(value: RecoveryData): SensitiveConstructionResult<RecoveryData> {
  return create(value, candidate => validWorkflow(candidate.workflowInput) &&
    ["found-pending", "found-completed", "found-failed", "not-found", "conflict"].includes(candidate.lookup.status));
}

type GenerationPersistenceData = Unlabelled<Parameters<ReferenceGenerationAcceptedPersistence["persistBeforeFinalCommit"]>[0]>;
export function createSensitiveGenerationPersistenceInput(value: GenerationPersistenceData): SensitiveConstructionResult<GenerationPersistenceData> {
  return create(value, candidate => validWorkflow(candidate.workflowInput) &&
    candidate.job.operation === candidate.workflowInput.operation && opaqueValues([candidate.finalResultIdentity]));
}

type RegisteredWorkflowData = Unlabelled<NonNullable<Awaited<ReturnType<RegisterWorkflowIntegrationInternal["resolve"]>>>>;
export function createSensitiveRegisteredWorkflow(value: RegisteredWorkflowData): SensitiveConstructionResult<RegisteredWorkflowData> {
  return create(value, candidate => validWorkflow(candidate.input) && candidate.pollKey.keyVersion === "1.0" &&
    opaqueValues([candidate.pollKey.internalKey, candidate.finalIdentity]) && Number.isSafeInteger(candidate.resumeRevision) &&
    candidate.resumeRevision > 0 && (candidate.resumeStatus === "waiting-upload" || candidate.resumeStatus === "resuming") &&
    (!candidate.claim || opaqueValues([candidate.claim.identity]) && Number.isSafeInteger(candidate.claim.revision) &&
      candidate.claim.revision > 0 && ["claimed", "materialized", "generation-submitted", "reconciliation-required"].includes(candidate.claim.stage)));
}

export function createSensitiveRestrictedWorkflowRecords(value: Unlabelled<ReferenceAsyncWorkflowInput["restrictedRecords"]>): SensitiveConstructionResult<Unlabelled<ReferenceAsyncWorkflowInput["restrictedRecords"]>> {
  return create(value, candidate => opaqueValues([candidate.originalInputRecordRef, candidate.adapterRequestRecordRef, candidate.schemaFingerprint]) &&
    validDate(candidate.expiresAt));
}

export function createSensitiveOperationAdapterRequest(value: OperationAdapterRequest): SensitiveConstructionResult<OperationAdapterRequest> {
  return create(value, candidate => candidate.requestSchemaVersion === "1.0" &&
    Number.isFinite(candidate.durationSeconds) && candidate.durationSeconds > 0 &&
    ("language" in candidate ? typeof candidate.language === "string" && typeof candidate.lyrics === "string" &&
      isRecord(candidate.performance) && Array.isArray(candidate.timeline) :
    "lyricsMode" in candidate ? isRecord(candidate.tempo) && isRecord(candidate.performance) && Array.isArray(candidate.timeline) :
    isRecord(candidate.globalDirection) && Array.isArray(candidate.scenes) && typeof candidate.audioAssetId === "string"));
}

export type GateProjectionItem = Pick<ProviderUploadPendingStateItemV2, "itemVersion" | "itemIndex" | "assetIndex" | "usage" | "requirement" | "sourceSnapshot"> &
  ({ status: "accepted"; session: import("@/lib/providerUploads/types").ProviderUploadSession } |
   { status: "completed"; completedAsset: ResolvedAsset });
export type AcceptedStateProjectionData = Omit<AcceptedStateProjectionInput, "state"> & {
  state: Omit<Unlabelled<ProviderUploadPendingStateV2>, "items"> & { items: readonly GateProjectionItem[] };
};
export function createSensitiveAcceptedStateProjection(value: AcceptedStateProjectionData): SensitiveConstructionResult<AcceptedStateProjectionInput> {
  try {
    if (!isPlainOwnedData(value, new WeakSet()) || value.contractVersion !== "1.0" || !Array.isArray(value.state.items)) return INVALID;
    const pending = value.state.items.some(item => item.status === "accepted");
    const candidate = { ...value.state, omissionPolicy: value.omissionPolicy, revision: value.initialRevision,
      referenceExpiresAt: value.referenceExpiresAt, stateExpiresAt: value.stateExpiresAt, stateStatus: pending ? "pending" : "ready" };
    if (!validatePendingPollStateData(candidate, items => ({
      status: items.some(item => item.status === "accepted" || item.status === "processing") ? "pending" : "ready", reasonCodes: [],
    }))) return INVALID;
    const items: ProviderUploadPendingStateItemV2[] = [];
    for (const item of candidate.items) {
      if (item.status === "accepted" || item.status === "completed") items.push(item);
      else return INVALID;
    }
    const state = create({ ...value.state, items }, item => item.stateVersion === "2.0" && Number.isSafeInteger(item.attempt) && item.attempt > 0);
    if (state.status !== "created") return INVALID;
    return create<AcceptedStateProjectionInput>({ ...value, state: state.value }, item => item.contractVersion === "1.0");
  } catch { return INVALID; }
}

export type AcceptedUploadPersistenceData = Omit<PendingUploadAcceptedPersistenceInput,
  "acceptanceIdempotencyKey" | "workflowResumeSeed" | "originalInputRecord" | "adapterRequestRecord"> & {
  acceptanceIdempotencyKey: string; workflowResumeSeed: Unlabelled<WorkflowResumeSeed>;
  originalInputRecord: Unlabelled<OriginalWorkflowInputRecord>; adapterRequestRecord: Unlabelled<RestrictedAdapterRequestRecord>;
};
export function createSensitiveAcceptedUploadPersistence(value: AcceptedUploadPersistenceData): SensitiveConstructionResult<PendingUploadAcceptedPersistenceInput> {
  try {
    if (!isPlainOwnedData(value, new WeakSet())) return INVALID;
    const key = createSensitiveReferenceKey(value.acceptanceIdempotencyKey);
    const seed = create(value.workflowResumeSeed, candidate => candidate.seedVersion === "1.0" &&
      candidate.operation === value.gateState.operation &&
      opaqueValues([candidate.workflowSchemaVersion, candidate.workflowEngineVersion, candidate.providerId, candidate.providerApiVersion,
        candidate.materializerBindingId, candidate.generationClientBindingId, candidate.outputIngestionBindingId,
        candidate.originalInputRecordRef, candidate.restrictedAdapterRequestRef, candidate.adapterOutputFingerprint,
        candidate.gatePlanFingerprint, candidate.tenantRef, candidate.region]));
    const original = create(value.originalInputRecord, candidate => candidate.recordVersion === "1.0" && validOperation(candidate.operation) &&
      ["vocal", "music", "mv"].includes(candidate.contentKind) && validDate(candidate.expiresAt) &&
      opaqueValues([candidate.encryptedPayloadRef, candidate.schemaFingerprint, candidate.tenantRef, candidate.region]));
    const adapter = create(value.adapterRequestRecord, candidate => candidate.recordVersion === "1.0" && validOperation(candidate.operation) &&
      validDate(candidate.expiresAt) && opaqueValues([candidate.adapterId, candidate.adapterVersion, candidate.requestSchemaVersion,
        candidate.encryptedRequestRef, candidate.requestFingerprint, candidate.tenantRef, candidate.region]));
    if (key.status !== "created" || seed.status !== "created" || original.status !== "created" || adapter.status !== "created") return INVALID;
    return create<PendingUploadAcceptedPersistenceInput>({ ...value, acceptanceIdempotencyKey: key.value,
      workflowResumeSeed: seed.value, originalInputRecord: original.value, adapterRequestRecord: adapter.value },
      candidate => candidate.contractVersion === "1.0" && candidate.authorization.operation === candidate.gateState.operation &&
        candidate.authorization.authorizationVersion === "1.0" && candidate.authorization.permission === "persist-accepted-upload" &&
        candidate.authorization.workflowOwnershipVerified === true && candidate.authorization.deletionState === "active" &&
        (candidate.authorization.actorType === "internal-workflow-service" || candidate.authorization.actorType === "system"));
  } catch { return INVALID; }
}
