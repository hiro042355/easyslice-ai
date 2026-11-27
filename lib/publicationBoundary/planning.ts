import type { PublicationRecoveryPlan } from "./contracts";
import { validatePublicationIntent } from "./validation";

/** Not a retry policy: this boundary cannot grant a new provider effect. */
export function planPublicationRecovery(observation: unknown): PublicationRecoveryPlan {
  switch (observation) {
    case "NOT_DISPATCHED":
      return Object.freeze({ action: "NO_EFFECT", redispatchAllowed: false, publicationVerified: false });
    case "IN_PROGRESS":
    case "COMMITTED_UNVERIFIED":
      return Object.freeze({ action: "OBSERVE_SAME_OPERATION", redispatchAllowed: false, publicationVerified: false });
    case "OUTCOME_UNKNOWN":
    case "RECONCILIATION_REQUIRED":
      return Object.freeze({ action: "RECONCILE_SAME_OPERATION", redispatchAllowed: false, publicationVerified: false });
    default:
      return Object.freeze({ action: "REJECT_INVALID_OBSERVATION", redispatchAllowed: false, publicationVerified: false });
  }
}

/** Data compatibility only with the provisional Publisher request v1.
 * No authority, provider invocation, activation or O1 semantics are inferred.
 */
export function mapDisabledYouTubeRequest(value: unknown) {
  const validated = validatePublicationIntent(value);
  if (validated.code !== "REQUEST_DATA_VALID") return Object.freeze({ code: "INVALID_REQUEST" } as const);
  if (validated.intent.platform !== "youtube") return Object.freeze({ code: "UNSUPPORTED_PLATFORM" } as const);
  const { platform: _platform, ...request } = validated.intent;
  void _platform;
  return Object.freeze({ code: "BLOCKED_BY_HANDOFF", authenticated: false, uploadAuthorized: false,
    dispatchAllowed: false, request: Object.freeze(request) } as const);
}

/** Compare immutable request data, never alias a different operation as recovery. */
export function samePublicationBinding(leftValue: unknown, rightValue: unknown): boolean {
  const leftResult = validatePublicationIntent(leftValue);
  const rightResult = validatePublicationIntent(rightValue);
  if (leftResult.code !== "REQUEST_DATA_VALID" || rightResult.code !== "REQUEST_DATA_VALID") return false;
  const left = leftResult.intent;
  const right = rightResult.intent;
  return left.schemaVersion === right.schemaVersion && left.platform === right.platform
    && left.operationId === right.operationId && left.idempotencyKey === right.idempotencyKey
    && left.metadataDigest === right.metadataDigest && left.privacyStatus === right.privacyStatus
    && left.asset.artifactId === right.asset.artifactId && left.asset.revisionId === right.asset.revisionId
    && left.asset.mediaDigest === right.asset.mediaDigest && left.asset.mimeType === right.asset.mimeType
    && left.asset.size === right.asset.size;
}
