import type { createDurableMediaOwnershipRepository } from "../server/durableMediaOwnership/repository";
import type { RevisionDeclaration } from "./revisionDeclaration";
import { sameDeclaredRevisionData, validateRevisionDeclaration } from "./revisionDeclaration";
import { isPublicationDataIdentifier as id, snapshotPublicationDataRecord as snapshot } from "./validation";

// Candidate internal data only. No issuer, persistence, transport or effect port.
export type OwnerScopedAssetLookup = Pick<ReturnType<typeof createDurableMediaOwnershipRepository>,
  "resolveOwnedJob" | "resolveOwnedMedia" | "resolveOwnedExport">;
export const custodyRequirements = Object.freeze([
  "VERIFIED_PRINCIPAL_OWNER_LOOKUP", "SEALED_REVISION", "ACTUAL_BYTE_DIGEST",
  "IMMUTABLE_STORAGE_VERSION", "SOURCE_PROVENANCE", "CURRENT_PLATFORM_ELIGIBILITY",
] as const);
export function assessAssetReadiness(value: unknown) {
  const result = validateRevisionDeclaration(value);
  return Object.freeze({ declarationValid: result.code === "DECLARED_REVISION_DATA_VALID",
    ownershipVerified: false, custodyVerified: false, publicationEligible: false,
    dispatchAllowed: false, missingRequirements: custodyRequirements });
}
export type OperationDeclaration = Readonly<{
  version: "publication-operation-candidate-v1";
  operationId: string; correlationId: string; intendedDestination: string;
  idempotencyScope: string; idempotencyKey: string; revision: RevisionDeclaration;
}>;
export function validateOperationDeclaration(value: unknown): OperationDeclaration | undefined {
  const d = snapshot(value, ["version", "operationId", "correlationId", "intendedDestination", "idempotencyScope", "idempotencyKey", "revision"]);
  if (!d || d.version !== "publication-operation-candidate-v1" || !id(d.operationId)
    || !id(d.correlationId) || !id(d.intendedDestination) || !id(d.idempotencyScope) || !id(d.idempotencyKey)) return undefined;
  const r = validateRevisionDeclaration(d.revision);
  if (r.code !== "DECLARED_REVISION_DATA_VALID") return undefined;
  return Object.freeze({ version: d.version, operationId: d.operationId, correlationId: d.correlationId,
    intendedDestination: d.intendedDestination, idempotencyScope: d.idempotencyScope,
    idempotencyKey: d.idempotencyKey, revision: r.declaration });
}
function sameOperation(a: OperationDeclaration, b: OperationDeclaration) {
  return a.operationId === b.operationId && a.correlationId === b.correlationId
    && a.intendedDestination === b.intendedDestination && a.idempotencyScope === b.idempotencyScope
    && a.idempotencyKey === b.idempotencyKey && sameDeclaredRevisionData(a.revision, b.revision);
}
// Stateless comparison of untrusted declarations; NOT acquisition of a reservation.
export function planDeclaredReservation(request: unknown, existing: unknown, currentRevision: unknown, observation: unknown) {
  const a = validateOperationDeclaration(request);
  const b = existing === null ? undefined : validateOperationDeclaration(existing);
  let code: "INVALID" | "STALE_REVISION" | "CONFLICT" | "DUPLICATE" | "RECONCILE_SAME_OPERATION" | "REQUIRES_DURABLE_ADMISSION";
  if (!a || (existing !== null && !b)) code = "INVALID";
  else if (!sameDeclaredRevisionData(a.revision, currentRevision)) code = "STALE_REVISION";
  else if (b && !sameOperation(a, b)) code = "CONFLICT";
  else if (observation === "OUTCOME_UNKNOWN" || observation === "CANCELLATION_AMBIGUOUS" || observation === "COMMIT_UNKNOWN") code = "RECONCILE_SAME_OPERATION";
  else if (observation !== "NOT_DISPATCHED") code = "INVALID";
  else code = b ? "DUPLICATE" : "REQUIRES_DURABLE_ADMISSION";
  return Object.freeze({ code, dispatchAllowed: false, reservationAcquired: false, durableRecoveryVerified: false });
}
export type ReceiptDeclaration = Readonly<{
  receiptId: string; attemptId: string; provider: string; sequence: number;
  classification: "TRANSPORT_ACK" | "PUBLISHER_ACCEPTANCE" | "PROVIDER_OBSERVATION" | "OUTCOME_CLAIM" | "UNKNOWN";
  operation: OperationDeclaration;
}>;
export function validateReceiptDeclaration(value: unknown): ReceiptDeclaration | undefined {
  const d = snapshot(value, ["receiptId", "attemptId", "provider", "sequence", "classification", "operation"]);
  if (!d || !id(d.receiptId) || !id(d.attemptId) || !id(d.provider)
    || typeof d.sequence !== "number" || !Number.isSafeInteger(d.sequence) || d.sequence < 0) return undefined;
  const c = d.classification;
  if (c !== "TRANSPORT_ACK" && c !== "PUBLISHER_ACCEPTANCE" && c !== "PROVIDER_OBSERVATION" && c !== "OUTCOME_CLAIM" && c !== "UNKNOWN") return undefined;
  const operation = validateOperationDeclaration(d.operation);
  if (!operation || d.provider !== operation.revision.publisherArtifact.platform) return undefined;
  return Object.freeze({ receiptId: d.receiptId, attemptId: d.attemptId, provider: d.provider,
    sequence: d.sequence, classification: c, operation });
}
// Exact binding is necessary but never establishes receipt authenticity/outcome.
export function compareDeclaredReceipt(value: unknown, expectedOperation: unknown, expectedAttempt: unknown, previous: unknown) {
  const r = validateReceiptDeclaration(value); const e = validateOperationDeclaration(expectedOperation);
  const p = previous === null ? undefined : validateReceiptDeclaration(previous);
  let code: "INVALID" | "CONFLICT" | "STALE" | "DUPLICATE" | "UNTRUSTED_DECLARATION";
  if (!r || !e || !id(expectedAttempt) || (previous !== null && !p)) code = "INVALID";
  else if (!sameOperation(r.operation, e) || r.attemptId !== expectedAttempt
    || (p && (!sameOperation(p.operation, e) || p.attemptId !== expectedAttempt))) code = "CONFLICT";
  else if (p && r.sequence < p.sequence) code = "STALE";
  else if (p && (r.sequence === p.sequence || r.receiptId === p.receiptId)) {
    code = r.sequence === p.sequence && r.receiptId === p.receiptId && r.classification === p.classification ? "DUPLICATE" : "CONFLICT";
  } else code = "UNTRUSTED_DECLARATION";
  return Object.freeze({ code, evidenceTrusted: false, terminalOutcome: "UNKNOWN", dispatchAllowed: false });
}
export function declaredPublisherCapability(platform: unknown) {
  return Object.freeze({ recognized: platform === "youtube" || platform === "tiktok" || platform === "bilibili",
    productionEnabled: false, dispatchAllowed: false, approval: "NOT_ESTABLISHED" });
}
