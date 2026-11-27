import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalPublicationMetadataJson, type PublicationMetadataDeclaration } from "../../lib/publicationRecords/metadata";
import {
  readTikTokPublicationRequest,
  TIKTOK_PUBLICATION_MAX_BODY_BYTES,
  TIKTOK_PUBLICATION_REQUEST_VERSION,
} from "../../lib/tiktokPublication/requestBoundary";
import { planTikTokAdapterResult, type TikTokPublicationExecution } from "../../lib/tiktokPublication/execution";
import { planTikTokObservation, type TikTokPublicationObservation } from "../../lib/publicationIntegration/observation";
import {
  projectTikTokPublicationExecution,
  projectTikTokPublicationRecord,
} from "../../lib/tiktokPublication/responseProjector";
import type { PublicationRecord, PublicationState } from "../../lib/publicationRecords/repository";

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "TikTok boundary",
  description: "request boundary test",
  tags: Object.freeze(["tiktok"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "TIKTOK_SHORT_VIDEO",
});

const validBody = (): Record<string, unknown> => Object.freeze({
  requestVersion: TIKTOK_PUBLICATION_REQUEST_VERSION,
  operationId: "op-tiktok-1",
  asset: Object.freeze({
    artifactId: "asset-tiktok-1",
    revisionId: "rev-tiktok-1",
    mediaDigest: "a".repeat(64),
    mimeType: "video/mp4",
    size: 4096,
  }),
  metadata,
  metadataDigest: sha256(canonicalPublicationMetadataJson(metadata)),
  contentFormat: "TIKTOK_SHORT_VIDEO",
  coreResource: Object.freeze({ namespace: "core-export", jobId: randomUUID(), exportId: randomUUID() }),
  rightsKey: "rights-tiktok-1",
  channelId: "channel-1",
});

const post = (body: unknown, key = "idem-1"): Promise<Awaited<ReturnType<typeof readTikTokPublicationRequest>>> =>
  readTikTokPublicationRequest(new Request(`http://127.0.0.1/api/v1/publications/tiktok?id=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), key);

const rejection = async (body: unknown): Promise<string> => {
  const result = await post(body);
  assert.equal(result.code, "REQUEST_REJECTED");
  return result.code === "REQUEST_REJECTED" ? result.error : "unreachable";
};

test("the request boundary admits a well-formed TikTok command and binds the idempotency key", async () => {
  const result = await post(validBody(), "idem-accepted");
  assert.equal(result.code, "REQUEST_ACCEPTED");
  if (result.code !== "REQUEST_ACCEPTED") return;
  assert.equal(result.command.intent.platform, "tiktok");
  assert.equal(result.command.intent.idempotencyKey, "idem-accepted");
  assert.equal(result.command.intent.privacyStatus, "private");
  assert.equal(result.command.declaration.publisherArtifact.platform, "tiktok");
  assert.equal(result.command.metadata.contentFormat, "TIKTOK_SHORT_VIDEO");
  assert.equal(result.command.rightsKey, "rights-tiktok-1");
  assert.equal(result.command.channelId, "channel-1");
});

test("the metadata digest is recomputed instead of trusted", async () => {
  const body = validBody();
  const tampered = { ...body, metadataDigest: sha256("other metadata") };
  assert.equal(await rejection(tampered), "metadata_digest_mismatch");

  // Changing the metadata without changing the digest is the same attack from the other side.
  const changedMetadata = { ...body, metadata: { ...metadata, title: "Different title" } };
  assert.equal(await rejection(changedMetadata), "metadata_digest_mismatch");
});

test("the request boundary rejects malformed shapes with the specific code, never a generic malformed verdict", async () => {
  assert.equal(await rejection("not json"), "request_body_malformed");
  assert.equal(await rejection({ ...validBody(), unexpected: true }), "request_body_unexpected_fields");
  assert.equal(await rejection({ ...validBody(), requestVersion: "publication-request-v0" }), "request_version_unsupported");
  assert.equal(await rejection({ ...validBody(), operationId: "bad operation id" }), "operation_id_invalid");
  assert.equal(await rejection({ ...validBody(), contentFormat: "YOUTUBE_REGULAR" }), "content_format_invalid");
  assert.equal(await rejection({ ...validBody(), contentFormat: "TIKTOK_SHORT_VIDEO", metadata: {
    ...metadata, contentFormat: "YOUTUBE_REGULAR",
  } }), "content_format_mismatch");
  assert.equal(await rejection({ ...validBody(), rightsKey: "bad key" }), "rights_key_invalid");
  assert.equal(await rejection({ ...validBody(), channelId: "" }), "channel_id_invalid");
  assert.equal(await rejection({ ...validBody(), coreResource: { namespace: "core-export", jobId: randomUUID(), exportId: "not-a-uuid" } }),
    "revision_declaration_invalid");
  const asset = validBody().asset as Record<string, unknown>;
  assert.equal(await rejection({ ...validBody(), asset: { ...asset, mimeType: "video/quicktime" } }), "asset_invalid");
  assert.equal(await rejection({ ...validBody(), asset: { ...asset, revisionId: "rev with space" } }), "asset_invalid");
  assert.equal(await rejection({ ...validBody(), asset: { ...asset, mediaDigest: "abc" } }), "asset_invalid");
});

test("an oversized request body is refused before it is parsed", async () => {
  const padding = "x".repeat(TIKTOK_PUBLICATION_MAX_BODY_BYTES);
  const result = await post(JSON.stringify({ ...validBody(), metadata: { ...metadata, description: padding } }));
  assert.equal(result.code, "REQUEST_REJECTED");
  if (result.code === "REQUEST_REJECTED") assert.equal(result.status, 413);
});

const observationOf = (current: PublicationState, code: TikTokPublicationObservation): string => {
  const plan = planTikTokObservation(current, code);
  assert.equal(plan.code, "APPLY");
  return plan.code === "APPLY" ? plan.nextState : "unreachable";
};

test("every adapter answer maps to the Core observation that keeps a resend impossible", () => {
  const publicationId = "11111111-1111-4111-8111-111111111111";
  const mapped = (result: unknown) => planTikTokAdapterResult(publicationId, {
    code: "ADAPTER_RESULT", result: result as never,
  });

  const published = mapped({ code: "PUBLISHED_PRIVATE", publicationId, publishId: "publish-1" });
  assert.equal(published.observation, "PUBLISH_PRIVATE_CONFIRMED");
  assert.equal(published.provider?.publishId, "publish-1");

  // A duplicate that names the already-published video is a success, not a retry.
  const duplicate = mapped({ code: "DUPLICATE_PUBLICATION", publicationId, publishId: "publish-1" });
  assert.equal(duplicate.observation, "PUBLISH_PRIVATE_CONFIRMED");
  // A duplicate without a publish id cannot be proven, so it is not a success either.
  assert.equal(mapped({ code: "DUPLICATE_PUBLICATION", publicationId }).observation, "OUTCOME_UNKNOWN");

  assert.equal(mapped({ code: "AUTH_FAILED", publicationId }).observation, "AUTH_FAILED");
  for (const code of ["PROVIDER_REJECTED", "GRANT_REJECTED", "ASSET_REJECTED", "ACCOUNT_NOT_BOUND"]) {
    const observation = mapped({ code, publicationId, reason: "r", providerCode: "p", coreCode: "c" }).observation;
    assert.equal(observation, "PERMANENT_FAILURE", code);
  }
  // These four can follow a request that did reach TikTok: never a failure verdict.
  for (const code of ["OUTCOME_UNKNOWN", "CORE_STATE_REJECTED"]) {
    assert.equal(mapped({ code, publicationId, coreCode: "x" }).observation, "OUTCOME_UNKNOWN", code);
  }
  assert.equal(mapped({ code: "PUBLISHED_PRIVATE", publicationId: "other", publishId: "p" }).observation, "OUTCOME_UNKNOWN");
  assert.equal(planTikTokAdapterResult(publicationId, { code: "TRANSPORT_FAILURE", reason: "TIMEOUT" }).observation, "OUTCOME_UNKNOWN");
  assert.equal(planTikTokAdapterResult(publicationId, { code: "TRANSPORT_FAILURE", reason: "STATUS", status: 409 }).observation, "OUTCOME_UNKNOWN");
  assert.equal(planTikTokAdapterResult(publicationId, { code: "MALFORMED_RESPONSE", status: 200 }).observation, "OUTCOME_UNKNOWN");

  // Only an explicit provider verdict may reach a terminal state.
  assert.equal(observationOf("UPLOADING", "PUBLISH_PRIVATE_CONFIRMED"), "PUBLISHED_PRIVATE");
  assert.equal(observationOf("UPLOADING", "OUTCOME_UNKNOWN"), "INTERRUPTED");
  assert.equal(observationOf("UPLOADING", "PERMANENT_FAILURE"), "FAILED");
  // A success reported after an interruption is reconciled, never confirmed blindly.
  assert.equal(observationOf("INTERRUPTED", "PUBLISH_PRIVATE_CONFIRMED"), "RECONCILING");
});

const recordFixture = (overrides: Partial<PublicationRecord> = {}): PublicationRecord => Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  state: "PUBLISHED_PRIVATE",
  tenantId: "tenant",
  platform: "tiktok",
  contentFormat: "TIKTOK_SHORT_VIDEO",
  operationId: "op",
  idempotencyKey: "idem",
  asset: Object.freeze({ artifactId: "asset", revisionId: "rev", mediaDigest: "a".repeat(64), mimeType: "video/mp4", size: 1 }),
  metadataDigest: "a".repeat(64),
  metadata,
  channelId: "channel-1",
  rightsEvidenceRef: "evidence-1",
  rightsRecordId: null,
  rightsRevision: null,
  rightsSnapshot: null,
  privacyStatus: "private",
  revision: 4,
  uploadSession: null,
  remoteVideoId: "publish-1",
  remoteProcessingStatus: null,
  reconciliationState: null,
  verificationState: "REMOTE_PUBLICATION_VERIFIED",
  transportKind: "REAL_TIKTOK",
  lastError: null,
  receipt: Object.freeze({ publishId: "publish-1" }),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  ...overrides,
} as PublicationRecord);

test("the response projector keeps secrets out and separates confirmed, failed and unknown outcomes", async () => {
  const confirmed: TikTokPublicationExecution = { code: "PUBLICATION_CONFIRMED", record: recordFixture() };
  const projected = projectTikTokPublicationExecution(confirmed);
  assert.equal(projected.status, 200);
  const serialized = JSON.stringify(projected.body);
  assert.match(serialized, /publish-1/);
  assert.doesNotMatch(serialized, /tenant|ownerUid|rightsSnapshot|secret|grant/i);
  assert.match(serialized, /private, no-store|publication/);

  const failed = projectTikTokPublicationExecution({
    code: "PUBLICATION_FAILED", record: recordFixture({ state: "FAILED", lastError: "PROVIDER_REJECTED" }),
  });
  assert.equal(failed.status, 502);

  const unknown = projectTikTokPublicationExecution({
    code: "PUBLICATION_IN_PROGRESS",
    record: recordFixture({ state: "INTERRUPTED", verificationState: "REMOTE_STATE_UNKNOWN" }),
    outcomeUnknown: true,
  });
  assert.equal(unknown.status, 202);
  assert.match(JSON.stringify(unknown.body), /RECONCILE_PUBLICATION_BEFORE_RETRY/);

  assert.equal(projectTikTokPublicationExecution({ code: "PUBLICATION_IDEMPOTENCY_CONFLICT" }).status, 409);
  assert.equal(projectTikTokPublicationExecution({ code: "PUBLICATION_REJECTED", status: 403, error: "asset_asset_not_owned" }).status, 403);

  const view = projectTikTokPublicationRecord(recordFixture());
  assert.equal(view.platform, "tiktok");
  assert.equal(view.publishId, "publish-1");
  assert.equal(view.outcomeUnknown, false);
});
