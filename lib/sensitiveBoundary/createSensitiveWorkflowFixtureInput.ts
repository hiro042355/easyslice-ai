import type { ResolvedAsset, Sensitive } from "@/lib/assets/types";
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
