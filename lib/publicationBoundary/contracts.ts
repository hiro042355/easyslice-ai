/** Internal planning contract, not a public API or proof of authority.
 * No provider transport is exposed by this boundary.
 */
export type PublicationPlatform = "youtube" | "tiktok" | "bilibili";

/** Uncertified request data, NOT an OwnedMedia/OwnedExport record or custody
 * proof. No assetId/mediaId/exportId -> artifactId/revisionId mapping is implied.
 * Equality and valid digest syntax do not prove existence, owner, revision,
 * actual bytes, retention eligibility or immutable storage custody.
 */
export type PublicationAssetReference = Readonly<{
  artifactId: string;
  revisionId: string;
  mediaDigest: string;
  mimeType: string;
  size: number;
}>;

/** Core correlation/intent data only. operationId is not a Publisher attempt,
 * provider resource or durable reservation; idempotencyKey has no authenticated
 * principal/channel scope until an approved server-owned binding is established.
 * `private` is restricted intent data, not a universal platform wire value.
 * No provider-specific extensions, authority or receipts are accepted here.
 */
export type PublicationIntent = Readonly<{
  schemaVersion: 1;
  platform: PublicationPlatform;
  operationId: string;
  idempotencyKey: string;
  asset: PublicationAssetReference;
  metadataDigest: string;
  privacyStatus: "private";
}>;

/** Knowledge of request data never establishes owner/channel/provider authority. */
export type PublicationValidation =
  | Readonly<{ code: "INVALID_REQUEST"; authenticated: false; uploadAuthorized: false }>
  | Readonly<{ code: "REQUEST_DATA_VALID"; authenticated: false; uploadAuthorized: false; intent: PublicationIntent }>;

/** Planning labels, not trusted observations. An authenticated Publisher must
 * establish provenance before any runtime mapping can consume external status.
 * No SUCCEEDED/FAILED/cancelled terminal classification is issued by this type.
 */
export type PublicationObservation =
  | "NOT_DISPATCHED"
  | "IN_PROGRESS"
  | "COMMITTED_UNVERIFIED"
  | "OUTCOME_UNKNOWN"
  | "RECONCILIATION_REQUIRED";

export type PublicationRecoveryPlan = Readonly<{
  action: "NO_EFFECT" | "OBSERVE_SAME_OPERATION" | "RECONCILE_SAME_OPERATION" | "REJECT_INVALID_OBSERVATION";
  redispatchAllowed: false;
  publicationVerified: false;
}>;
