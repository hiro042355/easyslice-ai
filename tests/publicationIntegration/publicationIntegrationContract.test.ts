import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, macEquals } from "../../lib/publicationIntegration/canonicalJson";
import { resolvePublicationPrincipal, principalOwnsPublication } from "../../lib/publicationIntegration/principal";
import { admitPublicationAsset, type AssetOwnershipLookup } from "../../lib/publicationIntegration/assetAdmission";
import {
  PUBLICATION_GRANT_MAX_TTL_MS,
  issuePublicationGrant,
  verifyPublicationGrant,
} from "../../lib/publicationIntegration/grant";
import { planTikTokObservation } from "../../lib/publicationIntegration/observation";

const digest = (character: string) => character.repeat(64);
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

const metadataDigest = digest("b");
const intentFor = (platform: "youtube" | "tiktok" | "bilibili", revisionId = "rev-tiktok-1") => Object.freeze({
  schemaVersion: 1 as const,
  platform,
  operationId: "operation-tiktok-1",
  idempotencyKey: "idempotency-tiktok-1",
  asset: Object.freeze({
    artifactId: "asset-tiktok-1",
    revisionId,
    mediaDigest: digest("a"),
    mimeType: "video/mp4",
    size: 4096,
  }),
  metadataDigest,
  privacyStatus: "private" as const,
});

const declarationFor = (overrides: Record<string, unknown> = {}) => Object.freeze({
  declarationVersion: "core-publication-revision-candidate-v1" as const,
  coreResource: Object.freeze({ namespace: "core-media" as const, jobId: JOB_ID, mediaId: MEDIA_ID }),
  publisherArtifact: Object.freeze({ platform: "tiktok" as const, artifactId: "asset-tiktok-1" }),
  publisherRevision: Object.freeze({ platform: "tiktok" as const, revisionId: "rev-tiktok-1" }),
  media: Object.freeze({ algorithm: "sha256" as const, digest: digest("a"), size: 4096, mimeType: "video/mp4" }),
  metadata: Object.freeze({ algorithm: "sha256" as const, digest: metadataDigest }),
  ...overrides,
});

const ownershipFor = (ownerUid: string): AssetOwnershipLookup => Object.freeze({
  async resolveOwnedJob(jobId: string, owner: string) {
    return jobId === JOB_ID && owner === ownerUid ? Object.freeze({ id: JOB_ID, ownerUid: owner }) : undefined;
  },
  async resolveOwnedMedia(mediaId: string, owner: string) {
    return mediaId === MEDIA_ID && owner === ownerUid
      ? Object.freeze({ id: MEDIA_ID, jobId: JOB_ID, storageKey: `jobs/${JOB_ID}/media/${MEDIA_ID}.mp4` })
      : undefined;
  },
  async resolveOwnedExport() {
    return undefined;
  },
});

const principal = () => {
  const resolved = resolvePublicationPrincipal({ ownerUid: "owner-tiktok-a", tenantId: "tenant-tiktok" });
  assert.equal(resolved.code, "PRINCIPAL_BOUND");
  if (resolved.code !== "PRINCIPAL_BOUND") throw new Error("principal");
  return resolved.principal;
};

test("canonical JSON is deterministic and rejects non-data values", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalJson({ a: 1 }), canonicalJson({ a: 1 }));
  assert.equal(canonicalJson({ a: undefined }), undefined);
  assert.equal(canonicalJson({ a: Number.NaN }), undefined);
  assert.equal(canonicalJson({ a: new Date(0) }), undefined);
  assert.equal(canonicalJson({ a: () => 1 }), undefined);
  assert.equal(canonicalJson([1, { b: 2, a: 1 }]), '[1,{"a":1,"b":2}]');
  assert.equal(macEquals("AAAA", "AAAA"), true);
  assert.equal(macEquals("AAAA", "AAAB"), false);
  assert.equal(macEquals("", ""), false);
});

test("principal bridge binds to the session owner and rejects a client-selected owner", () => {
  const bound = resolvePublicationPrincipal({ ownerUid: "owner-a", tenantId: "tenant-1", channelId: "channel-1" });
  assert.equal(bound.code, "PRINCIPAL_BOUND");
  if (bound.code !== "PRINCIPAL_BOUND") return;
  assert.equal(bound.principal.ownerUid, "owner-a");
  assert.equal(bound.principal.source, "server-session");
  assert.equal(bound.principal.channelId, "channel-1");

  assert.equal(resolvePublicationPrincipal({ ownerUid: "owner-a", tenantId: "tenant-1", requestedOwnerUid: "owner-a" }).code, "PRINCIPAL_BOUND");
  assert.equal(resolvePublicationPrincipal({ ownerUid: "owner-a", tenantId: "tenant-1", requestedOwnerUid: "owner-b" }).code, "PRINCIPAL_MISMATCH");
  assert.equal(resolvePublicationPrincipal({ ownerUid: "owner-a", tenantId: "tenant-1", ownerUidOverride: "owner-b" }).code, "PRINCIPAL_INVALID");
  assert.equal(resolvePublicationPrincipal({ ownerUid: "", tenantId: "tenant-1" }).code, "PRINCIPAL_INVALID");
  assert.equal(resolvePublicationPrincipal({ ownerUid: "owner-a" }).code, "PRINCIPAL_INVALID");
  assert.equal(resolvePublicationPrincipal("owner-a").code, "PRINCIPAL_INVALID");
  assert.equal(resolvePublicationPrincipal({ ownerUid: "owner-a", tenantId: "tenant-1", password: "x" }).code, "PRINCIPAL_INVALID");

  assert.equal(principalOwnsPublication(bound.principal, "owner-a", { tenantId: "tenant-1" } as never), true);
  assert.equal(principalOwnsPublication(bound.principal, "owner-b", { tenantId: "tenant-1" } as never), false);
  assert.equal(principalOwnsPublication(bound.principal, "owner-a", { tenantId: "tenant-2" } as never), false);
});

test("asset admission requires intent, declaration, digest and durable ownership to agree", async () => {
  const owner = principal();
  const admitted = await admitPublicationAsset({
    principal: owner, intent: intentFor("tiktok"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.equal(admitted.code, "ASSET_ADMITTED");
  if (admitted.code !== "ASSET_ADMITTED") return;
  assert.match(admitted.admissionDigest, /^[a-f0-9]{64}$/);
  assert.equal(admitted.platform, "tiktok");
  assert.equal(admitted.coreResource.resourceId, MEDIA_ID);
  assert.equal(admitted.dispatchAllowed, false);

  const foreign = await admitPublicationAsset({
    principal: principal(), intent: intentFor("tiktok"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-b"),
  });
  assert.deepEqual(foreign, { code: "ASSET_REJECTED", reason: "ASSET_NOT_OWNED" });

  const tampered = await admitPublicationAsset({
    principal: owner, intent: intentFor("tiktok"), ownership: ownershipFor("owner-tiktok-a"),
    declaration: declarationFor({ media: { algorithm: "sha256", digest: digest("c"), size: 4096, mimeType: "video/mp4" } }),
  });
  assert.deepEqual(tampered, { code: "ASSET_REJECTED", reason: "DIGEST_MISMATCH" });

  const stale = await admitPublicationAsset({
    principal: owner, intent: intentFor("tiktok"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
    currentDeclaration: declarationFor({
      publisherRevision: { platform: "tiktok", revisionId: "rev-tiktok-2" },
      media: { algorithm: "sha256", digest: digest("d"), size: 8192, mimeType: "video/mp4" },
    }),
  });
  assert.deepEqual(stale, { code: "ASSET_REJECTED", reason: "STALE_REVISION" });

  const crossPlatform = await admitPublicationAsset({
    principal: owner, intent: intentFor("youtube"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.deepEqual(crossPlatform, { code: "ASSET_REJECTED", reason: "PLATFORM_MISMATCH" });

  const bilibili = await admitPublicationAsset({
    principal: owner, intent: intentFor("bilibili"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.deepEqual(bilibili, { code: "ASSET_REJECTED", reason: "PLATFORM_NOT_ADMITTED" });

  const wrongMetadata = await admitPublicationAsset({
    principal: owner,
    intent: Object.freeze({ ...intentFor("tiktok"), metadataDigest: digest("e") }),
    declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.deepEqual(wrongMetadata, { code: "ASSET_REJECTED", reason: "METADATA_DIGEST_MISMATCH" });

  const wrongArtifact = await admitPublicationAsset({
    principal: owner, intent: intentFor("tiktok", "rev-other"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.deepEqual(wrongArtifact, { code: "ASSET_REJECTED", reason: "REVISION_MISMATCH" });
});

test("publication grant is audience-scoped, tamper-evident and short lived", async () => {
  const admitted = await admitPublicationAsset({
    principal: principal(), intent: intentFor("tiktok"), declaration: declarationFor(), ownership: ownershipFor("owner-tiktok-a"),
  });
  assert.equal(admitted.code, "ASSET_ADMITTED");
  if (admitted.code !== "ASSET_ADMITTED") return;

  const now = 1_700_000_000_000;
  const issued = issuePublicationGrant({
    principal: principal(), publicationId: "publication-tiktok-1", admission: admitted,
    contentFormat: "TIKTOK_SHORT_VIDEO", signingKey: "test-signing-key-value-32-bytes!", keyId: "test-key-1",
    grantId: "grant-tiktok-1", now, ttlMs: 60_000,
  });
  assert.equal(issued.code, "GRANT_ISSUED");
  if (issued.code !== "GRANT_ISSUED") return;
  const keys = { "test-key-1": "test-signing-key-value-32-bytes!" };

  const verified = verifyPublicationGrant({ token: issued.token, signingKeys: keys, now: now + 1_000 });
  assert.equal(verified.code, "GRANT_VERIFIED");
  if (verified.code !== "GRANT_VERIFIED") return;
  assert.equal(verified.claims.publicationId, "publication-tiktok-1");
  assert.equal(verified.claims.asset.mediaDigest, digest("a"));
  assert.equal(verified.claims.contentFormat, "TIKTOK_SHORT_VIDEO");
  assert.equal(verified.claims.ownerUid, "owner-tiktok-a");

  const [version, payload, mac] = issued.token.split(".");
  assert.ok(version && payload && mac);
  const forged = Buffer.from(JSON.stringify({ ...verified.claims, ownerUid: "owner-other" }), "utf8").toString("base64url");
  assert.deepEqual(verifyPublicationGrant({ token: `${version}.${forged}.${mac}`, signingKeys: keys, now }), {
    code: "GRANT_REJECTED", reason: "INVALID_SIGNATURE",
  });

  const reordered = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(verified.claims).reverse())), "utf8").toString("base64url");
  assert.deepEqual(verifyPublicationGrant({ token: `${version}.${reordered}.${mac}`, signingKeys: keys, now }), {
    code: "GRANT_REJECTED", reason: "MALFORMED",
  });

  assert.deepEqual(verifyPublicationGrant({ token: `${version}.${payload}.${mac}`, signingKeys: {}, now }), {
    code: "GRANT_REJECTED", reason: "UNKNOWN_KEY",
  });
  assert.deepEqual(verifyPublicationGrant({ token: issued.token, signingKeys: keys, expectedAudience: "youtube-publisher", now }), {
    code: "GRANT_REJECTED", reason: "AUDIENCE_MISMATCH",
  });
  assert.deepEqual(verifyPublicationGrant({ token: issued.token, signingKeys: keys, expectedPlatform: "youtube", now }), {
    code: "GRANT_REJECTED", reason: "PLATFORM_MISMATCH",
  });
  assert.deepEqual(verifyPublicationGrant({ token: issued.token, signingKeys: keys, now: now + 300_000, skewMs: 0 }), {
    code: "GRANT_REJECTED", reason: "EXPIRED",
  });
  assert.deepEqual(verifyPublicationGrant({ token: issued.token, signingKeys: keys, now: now - 120_000, skewMs: 0 }), {
    code: "GRANT_REJECTED", reason: "NOT_YET_VALID",
  });
  assert.deepEqual(verifyPublicationGrant({ token: "v1..x", signingKeys: keys, now }), {
    code: "GRANT_REJECTED", reason: "MALFORMED",
  });
  assert.equal(PUBLICATION_GRANT_MAX_TTL_MS, 30 * 60 * 1000);

  const tooLong = issuePublicationGrant({
    principal: principal(), publicationId: "publication-tiktok-1", admission: admitted,
    contentFormat: "TIKTOK_SHORT_VIDEO", signingKey: "test-signing-key-value-32-bytes!", keyId: "test-key-1",
    grantId: "grant-tiktok-2", now, ttlMs: PUBLICATION_GRANT_MAX_TTL_MS + 1,
  });
  assert.deepEqual(tooLong, { code: "GRANT_ISSUE_REJECTED", reason: "TTL_INVALID" });

  const youtubeFormat = issuePublicationGrant({
    principal: principal(), publicationId: "publication-tiktok-1", admission: admitted,
    contentFormat: "YOUTUBE_REGULAR", signingKey: "test-signing-key-value-32-bytes!", keyId: "test-key-1",
    grantId: "grant-tiktok-3", now,
  });
  assert.deepEqual(youtubeFormat, { code: "GRANT_ISSUE_REJECTED", reason: "CONTENT_FORMAT_MISMATCH" });
});

test("TikTok observation planning never reaches PUBLISHED_PRIVATE without provider confirmation", () => {
  assert.deepEqual(planTikTokObservation("AWAITING_CONFIRMATION", "DISPATCH_ACCEPTED"), {
    code: "APPLY", nextState: "QUEUED", verificationState: "UPLOAD_ACCEPTED", transportKind: "NONE", reconciliationState: "NONE",
  });
  assert.deepEqual(planTikTokObservation("QUEUED", "UPLOAD_STARTED"), {
    code: "APPLY", nextState: "UPLOADING", verificationState: "REMOTE_STATE_UNKNOWN", transportKind: "REAL_TIKTOK", reconciliationState: "NONE",
  });
  assert.deepEqual(planTikTokObservation("UPLOADING", "PUBLISH_PRIVATE_CONFIRMED"), {
    code: "APPLY", nextState: "PUBLISHED_PRIVATE", verificationState: "REMOTE_PUBLICATION_VERIFIED", transportKind: "REAL_TIKTOK", reconciliationState: "NONE",
  });
  assert.equal(planTikTokObservation("INTERRUPTED", "PUBLISH_PRIVATE_CONFIRMED").code, "APPLY");
  assert.equal(planTikTokObservation("UPLOADING", "OUTCOME_UNKNOWN").code, "APPLY");
  assert.equal(planTikTokObservation("RECONCILING", "PERMANENT_FAILURE").code, "APPLY");
  assert.deepEqual(planTikTokObservation("READY", "PUBLISH_PRIVATE_CONFIRMED"), {
    code: "REJECTED", reason: "OBSERVATION_NOT_ALLOWED",
  });
  assert.deepEqual(planTikTokObservation("PUBLISHED_PRIVATE", "UPLOAD_STARTED"), {
    code: "REJECTED", reason: "TERMINAL_STATE",
  });
  assert.deepEqual(planTikTokObservation("CANCELLED", "PERMANENT_FAILURE"), {
    code: "REJECTED", reason: "TERMINAL_STATE",
  });
});
