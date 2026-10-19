import type { PendingUploadOmissionPolicySnapshot, PendingUploadPollItemV2, PendingUploadPollStateEvaluation, PendingUploadPollStateV2 } from "./types";
import { validIso, validOpaque } from "./pendingPollV2Utils";

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const optionalNumber = (value: unknown) => value === undefined || typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const usages = new Set<unknown>(["audio-conditioning", "reference-image", "reference-video", "character-identity", "location-reference", "guide-vocal", "guide-melody", "lyrics-input", "preview-source", "export-source"]);
const kinds = new Set<unknown>(["audio", "voice", "image", "video", "character", "brand", "melody"]);
const failures = new Set<unknown>(["provider-failed", "cancelled", "expired", "policy-blocked", "invalid-handle", "job-not-found", "malformed-response"]);
const modes = new Set<unknown>(["single-request", "multipart", "resumable", "provider-fetch"]);
const action = (value: unknown): value is "omit" | "fail" => value === "omit" || value === "fail";

function policy(value: unknown): value is PendingUploadOmissionPolicySnapshot {
  return record(value) && value.policyVersion === "1.0" && action(value.optionalFailureAction) &&
    action(value.optionalCancellationAction) && action(value.optionalExpiryAction);
}
function reference(value: unknown): boolean {
  return record(value) && validOpaque(value.assetId) && kinds.has(value.kind) && optionalString(value.mimeType) &&
    optionalString(value.checksum) && [value.durationSeconds, value.width, value.height].every(optionalNumber);
}
function metadata(value: unknown): boolean {
  return record(value) && (value.type === "audio" || value.type === "video" || value.type === "image") &&
    typeof value.durationPresent === "boolean" && typeof value.dimensionsPresent === "boolean";
}
function integrity(value: unknown): boolean {
  return record(value) && typeof value.checksumVerified === "boolean" && typeof value.sizeVerified === "boolean" &&
    (value.checksumAlgorithm === undefined || value.checksumAlgorithm === "sha256");
}
function snapshot(value: unknown): value is Record<string, unknown> {
  return record(value) && !own(value, "access") && reference(value.assetRef) && integer(value.sizeBytes) &&
    metadata(value.metadata) && integrity(value.integrity);
}
function access(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.mode === "provider-native-asset") return validOpaque(value.handle) && (value.expiresAt === undefined || validIso(value.expiresAt));
  if (!validIso(value.expiresAt)) return false;
  if (value.mode === "signed-url") return typeof value.url === "string";
  if (value.mode === "internal-stream") return typeof value.streamToken === "string";
  return value.mode === "provider-upload" && typeof value.uploadSourceToken === "string";
}

/** Confidential data shape validation only; never an ownership/claim authorization. */
export function validatePendingPollStateData(
  raw: unknown,
  evaluate: (items: readonly Pick<PendingUploadPollItemV2, "status">[], policy: PendingUploadOmissionPolicySnapshot) => PendingUploadPollStateEvaluation,
): raw is PendingUploadPollStateV2 {
  try {
    if (!record(raw) || raw.stateVersion !== "2.0" ||
        ["completedAssets", "pendingItems", "pendingReference", "storeKey"].some(key => own(raw, key)) ||
        !validOpaque(raw.planFingerprint) || !validOpaque(raw.providerId) || !validOpaque(raw.providerApiVersion) ||
        raw.operation !== "generate-vocal" && raw.operation !== "generate-music" && raw.operation !== "generate-mv" ||
        !Array.isArray(raw.items) || raw.items.length === 0 || !integer(raw.attempt) || raw.attempt < 1 ||
        !integer(raw.revision) || raw.revision < 1 || !validIso(raw.referenceExpiresAt) ||
        !validIso(raw.stateExpiresAt) || !policy(raw.omissionPolicy)) return false;
    const itemIds = new Set<number>(), assetIds = new Set<number>();
    const statuses: Pick<PendingUploadPollItemV2, "status">[] = [];
    for (const item of raw.items) {
      if (!record(item) || item.itemVersion !== "2.0" || !integer(item.itemIndex) || itemIds.has(item.itemIndex) ||
          !integer(item.assetIndex) || assetIds.has(item.assetIndex) || !usages.has(item.usage) ||
          item.requirement !== "required" && item.requirement !== "optional" || !snapshot(item.sourceSnapshot)) return false;
      itemIds.add(item.itemIndex); assetIds.add(item.assetIndex);
      const hasSession = own(item, "session"), hasCompleted = own(item, "completedAsset");
      const hasFailure = own(item, "failureClass"), hasProgress = own(item, "progress");
      if (item.status === "accepted" || item.status === "processing") {
        const session = item.session;
        if (!hasSession || !record(session) || session.sessionVersion !== "1.0" || !validOpaque(session.sessionRef) ||
            session.providerId !== raw.providerId || session.operation !== raw.operation || !modes.has(session.mode) ||
            !validIso(session.expiresAt) || hasCompleted || hasFailure ||
            item.status === "accepted" && hasProgress ||
            item.status === "processing" && hasProgress && (!integer(item.progress) || item.progress > 100)) return false;
        statuses.push({ status: item.status });
      } else if (item.status === "completed") {
        const completed = item.completedAsset, source = item.sourceSnapshot;
        if (!hasCompleted || !record(completed) || completed.usage !== item.usage || completed.requirement !== item.requirement ||
            completed.sizeBytes !== source.sizeBytes || !reference(completed.assetRef) ||
            JSON.stringify(completed.assetRef) !== JSON.stringify(source.assetRef) ||
            !metadata(completed.metadata) || !integrity(completed.integrity) || !access(completed.access) ||
            hasSession || hasFailure || hasProgress) return false;
        statuses.push({ status: "completed" });
      } else if (item.status === "omitted") {
        if (item.requirement !== "optional" || hasSession || hasCompleted || hasFailure || hasProgress) return false;
        statuses.push({ status: "omitted" });
      } else if (item.status === "failed") {
        if (!failures.has(item.failureClass) || hasSession || hasCompleted || hasProgress) return false;
        statuses.push({ status: "failed" });
      } else if (item.status === "cancelled" || item.status === "expired" || item.status === "blocked") {
        if (item.failureClass !== (item.status === "blocked" ? "policy-blocked" : item.status) ||
            hasSession || hasCompleted || hasProgress) return false;
        statuses.push({ status: item.status });
      } else return false;
    }
    return raw.stateStatus === evaluate(statuses, raw.omissionPolicy).status;
  } catch {
    return false;
  }
}
