import type { PublicationPlatform } from "./contracts";
import { isUuid } from "../server/durableMediaOwnership/storageKey";
import { isPublicationDataIdentifier, isPublicationSha256Declaration, snapshotPublicationDataRecord, validatePublicationIntent } from "./validation";

// Candidate declaration schema, NOT a storage record, media verifier or mapping
// authority. No IDs are generated and no equality between namespaces is inferred.
export type CoreMediaIdentityData = Readonly<{ namespace: "core-media"; jobId: string; mediaId: string }>;
export type CoreExportIdentityData = Readonly<{ namespace: "core-export"; jobId: string; exportId: string }>;
export type PublisherArtifactIdentityData = Readonly<{ platform: PublicationPlatform; artifactId: string }>;
export type PublisherRevisionIdentityData = Readonly<{ platform: PublicationPlatform; revisionId: string }>;

export type RevisionDeclaration = Readonly<{
  declarationVersion: "core-publication-revision-candidate-v1";
  coreResource: CoreMediaIdentityData | CoreExportIdentityData;
  publisherArtifact: PublisherArtifactIdentityData;
  publisherRevision: PublisherRevisionIdentityData;
  media: Readonly<{ algorithm: "sha256"; digest: string; size: number; mimeType: string }>;
  metadata: Readonly<{ algorithm: "sha256"; digest: string }>;
}>;

export type RevisionDeclarationResult =
  | Readonly<{ code: "INVALID_REVISION_DECLARATION"; dispatchAllowed: false }>
  | Readonly<{ code: "DECLARED_REVISION_DATA_VALID"; evidenceLevel: "declared-only";
      ownershipVerified: false; custodyVerified: false; publicationEligible: false;
      dispatchAllowed: false; declaration: RevisionDeclaration }>;

const platform = (value: unknown): value is PublicationPlatform =>
  value === "youtube" || value === "tiktok" || value === "bilibili";

/** Strict immutable data validation only; does NOT lookup or certify a resource. */
export function validateRevisionDeclaration(value: unknown): RevisionDeclarationResult {
  const invalid = Object.freeze({ code: "INVALID_REVISION_DECLARATION", dispatchAllowed: false } as const);
  const data = snapshotPublicationDataRecord(value, ["declarationVersion", "coreResource", "publisherArtifact", "publisherRevision", "media", "metadata"]);
  if (!data || data.declarationVersion !== "core-publication-revision-candidate-v1") return invalid;
  const core = snapshotPublicationDataRecord(data.coreResource, ["namespace", "jobId", "mediaId"])
    ?? snapshotPublicationDataRecord(data.coreResource, ["namespace", "jobId", "exportId"]);
  if (!core || typeof core.jobId !== "string" || !isUuid(core.jobId)) return invalid;
  let coreResource: CoreMediaIdentityData | CoreExportIdentityData;
  if (core.namespace === "core-media" && typeof core.mediaId === "string" && isUuid(core.mediaId) && !Object.hasOwn(core, "exportId")) {
    coreResource = Object.freeze({ namespace: "core-media", jobId: core.jobId, mediaId: core.mediaId });
  } else if (core.namespace === "core-export" && typeof core.exportId === "string" && isUuid(core.exportId) && !Object.hasOwn(core, "mediaId")) {
    coreResource = Object.freeze({ namespace: "core-export", jobId: core.jobId, exportId: core.exportId });
  } else return invalid;
  const artifact = snapshotPublicationDataRecord(data.publisherArtifact, ["platform", "artifactId"]);
  const revision = snapshotPublicationDataRecord(data.publisherRevision, ["platform", "revisionId"]);
  const media = snapshotPublicationDataRecord(data.media, ["algorithm", "digest", "size", "mimeType"]);
  const metadata = snapshotPublicationDataRecord(data.metadata, ["algorithm", "digest"]);
  if (!artifact || !revision || !platform(artifact.platform) || artifact.platform !== revision.platform
    || !isPublicationDataIdentifier(artifact.artifactId) || !isPublicationDataIdentifier(revision.revisionId)
    || !media || media.algorithm !== "sha256" || !isPublicationSha256Declaration(media.digest)
    || typeof media.size !== "number" || !Number.isSafeInteger(media.size) || media.size < 1
    || typeof media.mimeType !== "string" || !/^video\/[A-Za-z0-9.+-]+$/.test(media.mimeType)
    || !metadata || metadata.algorithm !== "sha256" || !isPublicationSha256Declaration(metadata.digest)) return invalid;
  const declaration: RevisionDeclaration = Object.freeze({
    declarationVersion: "core-publication-revision-candidate-v1", coreResource,
    publisherArtifact: Object.freeze({ platform: artifact.platform, artifactId: artifact.artifactId }),
    publisherRevision: Object.freeze({ platform: artifact.platform, revisionId: revision.revisionId }),
    media: Object.freeze({ algorithm: "sha256", digest: media.digest, size: media.size, mimeType: media.mimeType }),
    metadata: Object.freeze({ algorithm: "sha256", digest: metadata.digest }),
  });
  return Object.freeze({ code: "DECLARED_REVISION_DATA_VALID", evidenceLevel: "declared-only", ownershipVerified: false,
    custodyVerified: false, publicationEligible: false, dispatchAllowed: false, declaration });
}

/** Exact data comparison, never evidence of owner/custody or a durable mapping. */
export function sameDeclaredRevisionData(left: unknown, right: unknown): boolean {
  const a = validateRevisionDeclaration(left); const b = validateRevisionDeclaration(right);
  if (a.code !== "DECLARED_REVISION_DATA_VALID" || b.code !== "DECLARED_REVISION_DATA_VALID") return false;
  const x = a.declaration; const y = b.declaration;
  const xId = x.coreResource.namespace === "core-media" ? x.coreResource.mediaId : x.coreResource.exportId;
  const yId = y.coreResource.namespace === "core-media" ? y.coreResource.mediaId : y.coreResource.exportId;
  return x.coreResource.namespace === y.coreResource.namespace && x.coreResource.jobId === y.coreResource.jobId && xId === yId
    && x.publisherArtifact.platform === y.publisherArtifact.platform && x.publisherArtifact.artifactId === y.publisherArtifact.artifactId
    && x.publisherRevision.platform === y.publisherRevision.platform && x.publisherRevision.revisionId === y.publisherRevision.revisionId
    && x.media.algorithm === y.media.algorithm && x.media.digest === y.media.digest && x.media.size === y.media.size
    && x.media.mimeType === y.media.mimeType && x.metadata.algorithm === y.metadata.algorithm && x.metadata.digest === y.metadata.digest;
}

/** Compares declarations only; coreResource is not inferred from PublicationIntent. */
export function declaredRevisionMatchesIntent(value: unknown, rawIntent: unknown): boolean {
  const revision = validateRevisionDeclaration(value); const intent = validatePublicationIntent(rawIntent);
  if (revision.code !== "DECLARED_REVISION_DATA_VALID" || intent.code !== "REQUEST_DATA_VALID") return false;
  const d = revision.declaration; const i = intent.intent;
  return d.publisherArtifact.platform === i.platform && d.publisherArtifact.artifactId === i.asset.artifactId
    && d.publisherRevision.revisionId === i.asset.revisionId && d.media.digest === i.asset.mediaDigest
    && d.media.size === i.asset.size && d.media.mimeType === i.asset.mimeType && d.metadata.digest === i.metadataDigest;
}
