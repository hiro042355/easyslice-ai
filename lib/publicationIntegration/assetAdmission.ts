import { canonicalJson, sha256Hex } from "./canonicalJson";
import type { PublicationPrincipal } from "./principal";
import { declaredRevisionMatchesIntent, sameDeclaredRevisionData, validateRevisionDeclaration, type RevisionDeclaration } from "../publicationBoundary/revisionDeclaration";
import { validatePublicationIntent } from "../publicationBoundary/validation";
import type { PublicationIntent } from "../publicationBoundary/contracts";

/**
 * Asset Admission (CORE_R11 PROPOSED item 2, implementation form).
 *
 * Declared revision data is untrusted input. Admission is granted only when the
 * declaration, the intent and the durable core resource agree *and* the resolved
 * core resource belongs to the server-verified owner. Provider channel authority is
 * still not established here: the result authorizes an internal handoff, not a
 * provider call.
 */
export const ASSET_ADMISSION_VERSION = "publication-asset-admission-v1" as const;

export type OwnedMediaShape = Readonly<{ id: string; jobId: string; storageKey: string }>;

/** Subset of the durable ownership repository; injected so admission stays testable. */
export type AssetOwnershipLookup = Readonly<{
  resolveOwnedJob(jobId: string, canonicalOwnerUid: string): Promise<{ id: string; ownerUid: string } | undefined>;
  resolveOwnedMedia(mediaId: string, canonicalOwnerUid: string): Promise<OwnedMediaShape | undefined>;
  resolveOwnedExport(exportId: string, canonicalOwnerUid: string): Promise<OwnedMediaShape | undefined>;
}>;

export type AssetAdmissionRejection =
  | "INTENT_INVALID"
  | "REVISION_DECLARATION_INVALID"
  | "PLATFORM_NOT_ADMITTED"
  | "PLATFORM_MISMATCH"
  | "REVISION_MISMATCH"
  | "DIGEST_MISMATCH"
  | "METADATA_DIGEST_MISMATCH"
  | "STALE_REVISION"
  | "ASSET_NOT_OWNED";

export type AssetAdmission =
  | Readonly<{
      code: "ASSET_ADMITTED";
      admissionVersion: typeof ASSET_ADMISSION_VERSION;
      admissionDigest: string;
      ownerUid: string;
      tenantId: string;
      platform: "youtube" | "tiktok";
      intent: PublicationIntent;
      declaration: RevisionDeclaration;
      coreResource: Readonly<{ namespace: "core-media" | "core-export"; jobId: string; resourceId: string; storageKey: string }>;
      dispatchAllowed: false;
    }>
  | Readonly<{ code: "ASSET_REJECTED"; reason: AssetAdmissionRejection }>;

const reject = (reason: AssetAdmissionRejection): AssetAdmission =>
  Object.freeze({ code: "ASSET_REJECTED" as const, reason });

export type AdmitAssetInput = Readonly<{
  principal: PublicationPrincipal;
  intent: unknown;
  declaration: unknown;
  /** Optional declaration observed later; when it differs, the intent is stale. */
  currentDeclaration?: unknown;
  ownership: AssetOwnershipLookup;
}>;

export async function admitPublicationAsset(input: AdmitAssetInput): Promise<AssetAdmission> {
  const validatedIntent = validatePublicationIntent(input.intent);
  if (validatedIntent.code !== "REQUEST_DATA_VALID") return reject("INTENT_INVALID");
  const intent = validatedIntent.intent;
  if (intent.platform !== "youtube" && intent.platform !== "tiktok") return reject("PLATFORM_NOT_ADMITTED");

  const validatedRevision = validateRevisionDeclaration(input.declaration);
  if (validatedRevision.code !== "DECLARED_REVISION_DATA_VALID") return reject("REVISION_DECLARATION_INVALID");
  const declaration = validatedRevision.declaration;

  if (declaration.publisherArtifact.platform !== intent.platform) return reject("PLATFORM_MISMATCH");
  if (declaration.publisherArtifact.artifactId !== intent.asset.artifactId
    || declaration.publisherRevision.revisionId !== intent.asset.revisionId) return reject("REVISION_MISMATCH");
  if (declaration.media.digest !== intent.asset.mediaDigest
    || declaration.media.size !== intent.asset.size
    || declaration.media.mimeType !== intent.asset.mimeType) return reject("DIGEST_MISMATCH");
  if (declaration.metadata.digest !== intent.metadataDigest) return reject("METADATA_DIGEST_MISMATCH");
  if (!declaredRevisionMatchesIntent(declaration, intent)) return reject("REVISION_MISMATCH");
  if (input.currentDeclaration !== undefined && !sameDeclaredRevisionData(input.currentDeclaration, declaration)) {
    return reject("STALE_REVISION");
  }

  const job = await input.ownership.resolveOwnedJob(declaration.coreResource.jobId, input.principal.ownerUid);
  if (!job || job.id !== declaration.coreResource.jobId) return reject("ASSET_NOT_OWNED");
  const resource = declaration.coreResource.namespace === "core-media"
    ? await input.ownership.resolveOwnedMedia(declaration.coreResource.mediaId, input.principal.ownerUid)
    : await input.ownership.resolveOwnedExport(declaration.coreResource.exportId, input.principal.ownerUid);
  const resourceId = declaration.coreResource.namespace === "core-media"
    ? declaration.coreResource.mediaId
    : declaration.coreResource.exportId;
  if (!resource || resource.id !== resourceId || resource.jobId !== declaration.coreResource.jobId) {
    return reject("ASSET_NOT_OWNED");
  }

  const admissionDigest = sha256Hex(canonicalJson({
    admissionVersion: ASSET_ADMISSION_VERSION,
    ownerUid: input.principal.ownerUid,
    tenantId: input.principal.tenantId,
    platform: intent.platform,
    operationId: intent.operationId,
    idempotencyKey: intent.idempotencyKey,
    artifactId: intent.asset.artifactId,
    revisionId: intent.asset.revisionId,
    mediaDigest: intent.asset.mediaDigest,
    mediaSize: intent.asset.size,
    mediaType: intent.asset.mimeType,
    metadataDigest: intent.metadataDigest,
    coreNamespace: declaration.coreResource.namespace,
    coreJobId: declaration.coreResource.jobId,
    coreResourceId: resourceId,
    storageKey: resource.storageKey,
  }) ?? "");

  return Object.freeze({
    code: "ASSET_ADMITTED" as const,
    admissionVersion: ASSET_ADMISSION_VERSION,
    admissionDigest,
    ownerUid: input.principal.ownerUid,
    tenantId: input.principal.tenantId,
    platform: intent.platform,
    intent,
    declaration,
    coreResource: Object.freeze({
      namespace: declaration.coreResource.namespace,
      jobId: declaration.coreResource.jobId,
      resourceId,
      storageKey: resource.storageKey,
    }),
    dispatchAllowed: false as const,
  });
}
