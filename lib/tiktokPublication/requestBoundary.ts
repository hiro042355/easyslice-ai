import { createHash } from "node:crypto";
import {
  canonicalPublicationMetadataJson,
  isPublicationContentFormatForPlatform,
  validatePublicationMetadata,
  type PublicationMetadataDeclaration,
} from "../publicationRecords/metadata";
import {
  validateRevisionDeclaration,
  type RevisionDeclaration,
} from "../publicationBoundary/revisionDeclaration";
import { validatePublicationIntent } from "../publicationBoundary/validation";
import type { PublicationIntent } from "../publicationBoundary/contracts";

/**
 * Request boundary for the Core TikTok publication route.
 *
 * Everything here is Core-side input validation of *client-declared* data. It runs
 * before a database record exists, so a malformed request cannot leave a partial
 * publication behind, and before any grant is signed. Ownership of the referenced
 * core resource is deliberately not decided here: that is asset admission, which
 * needs the durable ownership repository.
 *
 * The metadata digest is not taken on trust. The declaration is recomputed from the
 * submitted metadata and must equal the digest the caller claims, so the grant that
 * is later signed binds the bytes Core actually read.
 */
export const TIKTOK_PUBLICATION_REQUEST_VERSION = "publication-request-v1" as const;
export const TIKTOK_PUBLICATION_MAX_BODY_BYTES = 16 * 1024;

const OPERATION_PATTERN = /^[A-Za-z0-9_.:@-]{1,128}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const REF = /^[A-Za-z0-9_.:@/-]{1,512}$/;
const CHANNEL = /^[A-Za-z0-9_.:@-]{1,128}$/;
const MAX_ASSET_BYTES = 4 * 1024 * 1024 * 1024;

export type TikTokPublicationCommand = Readonly<{
  intent: PublicationIntent;
  declaration: RevisionDeclaration;
  metadata: PublicationMetadataDeclaration;
  rightsKey: string;
  channelId: string;
}>;

export type TikTokPublicationRequestResult =
  | Readonly<{ code: "REQUEST_ACCEPTED"; command: TikTokPublicationCommand }>
  | Readonly<{ code: "REQUEST_REJECTED"; status: number; error: string }>;

const rejected = (status: number, error: string): TikTokPublicationRequestResult =>
  Object.freeze({ code: "REQUEST_REJECTED" as const, status, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};

export async function readTikTokPublicationRequest(
  request: Request,
  idempotencyKey: string,
): Promise<TikTokPublicationRequestResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > TIKTOK_PUBLICATION_MAX_BODY_BYTES) {
    return rejected(413, "request_body_too_large");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return rejected(400, "request_body_unreadable");
  }
  if (Buffer.byteLength(text, "utf8") > TIKTOK_PUBLICATION_MAX_BODY_BYTES) {
    return rejected(413, "request_body_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return rejected(400, "request_body_malformed");
  }
  if (!isRecord(parsed)) return rejected(400, "request_body_malformed");
  if (!exactKeys(parsed, [
    "requestVersion", "operationId", "asset", "metadata", "metadataDigest",
    "contentFormat", "coreResource", "rightsKey", "channelId",
  ])) {
    return rejected(400, "request_body_unexpected_fields");
  }
  if (parsed.requestVersion !== TIKTOK_PUBLICATION_REQUEST_VERSION) {
    return rejected(400, "request_version_unsupported");
  }
  if (typeof parsed.operationId !== "string" || !OPERATION_PATTERN.test(parsed.operationId)) {
    return rejected(400, "operation_id_invalid");
  }
  if (!isRecord(parsed.asset)) return rejected(400, "asset_invalid");
  const asset = parsed.asset;
  if (typeof asset.artifactId !== "string" || !OPERATION_PATTERN.test(asset.artifactId)
    || typeof asset.revisionId !== "string" || !OPERATION_PATTERN.test(asset.revisionId)
    || typeof asset.mediaDigest !== "string" || !HEX64.test(asset.mediaDigest)
    || asset.mimeType !== "video/mp4"
    || !Number.isSafeInteger(asset.size) || (asset.size as number) <= 0
    || (asset.size as number) > MAX_ASSET_BYTES) {
    return rejected(400, "asset_invalid");
  }
  if (typeof parsed.contentFormat !== "string"
    || !isPublicationContentFormatForPlatform(parsed.contentFormat, "tiktok")) {
    return rejected(400, "content_format_invalid");
  }
  if (typeof parsed.rightsKey !== "string" || !REF.test(parsed.rightsKey)) {
    return rejected(400, "rights_key_invalid");
  }
  if (typeof parsed.channelId !== "string" || !CHANNEL.test(parsed.channelId)) {
    return rejected(400, "channel_id_invalid");
  }
  const metadata = validatePublicationMetadata(parsed.metadata);
  if (!metadata.ok) return rejected(400, "metadata_invalid");
  if (metadata.value.contentFormat !== parsed.contentFormat) {
    return rejected(400, "content_format_mismatch");
  }
  const computedMetadataDigest = createHash("sha256")
    .update(canonicalPublicationMetadataJson(metadata.value), "utf8")
    .digest("hex");
  if (typeof parsed.metadataDigest !== "string" || parsed.metadataDigest !== computedMetadataDigest) {
    return rejected(400, "metadata_digest_mismatch");
  }

  // The declared revision is validated exactly as the adapter-side verifier expects
  // it, then re-checked by asset admission against the durable core resource.
  const declaration = validateRevisionDeclaration({
    declarationVersion: "core-publication-revision-candidate-v1",
    coreResource: parsed.coreResource,
    publisherArtifact: { platform: "tiktok", artifactId: asset.artifactId },
    publisherRevision: { platform: "tiktok", revisionId: asset.revisionId },
    media: {
      algorithm: "sha256",
      digest: asset.mediaDigest,
      size: asset.size,
      mimeType: asset.mimeType,
    },
    metadata: { algorithm: "sha256", digest: computedMetadataDigest },
  });
  if (declaration.code !== "DECLARED_REVISION_DATA_VALID") {
    return rejected(400, "revision_declaration_invalid");
  }

  const intent = validatePublicationIntent({
    schemaVersion: 1,
    platform: "tiktok",
    operationId: parsed.operationId,
    idempotencyKey,
    asset: {
      artifactId: asset.artifactId,
      revisionId: asset.revisionId,
      mediaDigest: asset.mediaDigest,
      mimeType: asset.mimeType,
      size: asset.size,
    },
    metadataDigest: computedMetadataDigest,
    privacyStatus: "private",
  });
  if (intent.code !== "REQUEST_DATA_VALID") return rejected(400, "intent_invalid");

  return Object.freeze({
    code: "REQUEST_ACCEPTED" as const,
    command: Object.freeze({
      intent: intent.intent,
      declaration: declaration.declaration,
      metadata: metadata.value,
      rightsKey: parsed.rightsKey,
      channelId: parsed.channelId,
    }),
  });
}

/**
 * Request boundary for POST /api/v1/publications/tiktok/reconcile.
 *
 * The body is a single publication identifier and nothing else. Reconciliation is a
 * read of the adapter's ledger, so there is no client-supplied state, observation or
 * publish id to trust.
 */
export const TIKTOK_RECONCILIATION_MAX_BODY_BYTES = 4 * 1024;
const reconcileRejected = (status: number, error: string): TikTokReconciliationRequestResult =>
  Object.freeze({ code: "REQUEST_REJECTED" as const, status, error });
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type TikTokReconciliationRequestResult =
  | Readonly<{ code: "REQUEST_ACCEPTED"; publicationId: string }>
  | Readonly<{ code: "REQUEST_REJECTED"; status: number; error: string }>;

export async function readTikTokReconciliationRequest(
  request: Request,
): Promise<TikTokReconciliationRequestResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > TIKTOK_RECONCILIATION_MAX_BODY_BYTES) {
    return reconcileRejected(413, "request_body_too_large");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return reconcileRejected(400, "request_body_unreadable");
  }
  if (Buffer.byteLength(text, "utf8") > TIKTOK_RECONCILIATION_MAX_BODY_BYTES) {
    return reconcileRejected(413, "request_body_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reconcileRejected(400, "request_body_malformed");
  }
  if (!isRecord(parsed)) return reconcileRejected(400, "request_body_malformed");
  if (!exactKeys(parsed, ["publicationId"])) return reconcileRejected(400, "request_body_unexpected_fields");
  if (typeof parsed.publicationId !== "string" || !UUID.test(parsed.publicationId)) {
    return reconcileRejected(400, "publication_id_invalid");
  }
  return Object.freeze({ code: "REQUEST_ACCEPTED" as const, publicationId: parsed.publicationId.toLowerCase() });
}
