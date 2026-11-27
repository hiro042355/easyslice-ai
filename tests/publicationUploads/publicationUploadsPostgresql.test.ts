import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validatePublicationIntent } from "../../lib/publicationBoundary/validation";
import {
  canonicalPublicationMetadataJson,
  type PublicationMetadataDeclaration,
} from "../../lib/publicationRecords/metadata";
import { createPublicationRepository } from "../../lib/publicationRecords/repository";
import { createPublicationUploadRepository } from "../../lib/publicationUploads/repository";
import { verifyUploadReceipt, type UploadReceipt } from "../../lib/domain/youtube/upload-receipt";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "Y50 durable fake upload",
  description: "real PostgreSQL upload-lifecycle test; deterministic transport",
  tags: Object.freeze(["y50", "fake-upload"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "YOUTUBE_REGULAR",
});

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

const intentFor = (key: string, size = 4_456_448) => {
  const result = validatePublicationIntent({
    schemaVersion: 1,
    platform: "youtube",
    operationId: `op-${key}`,
    idempotencyKey: key,
    asset: {
      artifactId: `asset-${key}`,
      revisionId: `rev-${key}`,
      mediaDigest: "a".repeat(64),
      mimeType: "video/mp4",
      size,
    },
    metadataDigest: digest(canonicalPublicationMetadataJson(metadata)),
    privacyStatus: "private",
  });
  if (result.code !== "REQUEST_DATA_VALID") throw new Error("publication-intent-invalid");
  return result.intent;
};

test("durable fake upload persists chunks, fences revisions, interrupts, resumes and reconciles", async () => {
  await withPostgreSqlTestEnvironment(async environment => {
    const intents = createPublicationRepository(environment.pool);
    const uploads = createPublicationUploadRepository(environment.pool);

    const createQueued = async (key: string, withBinding = true) => {
      const created = await intents.create({
        ownerUid: "owner-y50-a",
        tenantId: "tenant-y50",
        intent: intentFor(key),
        metadata,
        ...(withBinding ? { channelId: "channel-y50", rightsEvidenceRef: "rights/y50/evidence" } : {}),
      });
      assert.equal(created.code, "APPLIED");
      if (created.code !== "APPLIED") throw new Error("create-failed");
      const queued = await intents.transition("owner-y50-a", created.record.id, created.record.revision, "QUEUED");
      assert.equal(queued.code, "APPLIED");
      if (queued.code !== "APPLIED") throw new Error("queue-failed");
      return queued.record;
    };

    const missingRights = await intents.create({
      ownerUid: "owner-y50-a",
      tenantId: "tenant-y50",
      intent: intentFor("no-rights"),
      metadata,
    });
    assert.equal(missingRights.code, "APPLIED");
    if (missingRights.code === "APPLIED") {
      const queued = await intents.transition("owner-y50-a", missingRights.record.id, 1, "QUEUED");
      assert.equal(queued.code, "CONFLICT");
      assert.equal(queued.code === "CONFLICT" ? queued.record?.state : "", "AWAITING_CONFIRMATION");
    }

    const first = await createQueued("upload-a");
    const start = await uploads.start("owner-y50-a", first.id, first.revision);
    assert.equal(start.code, "APPLIED");
    if (start.code !== "APPLIED") return;
    assert.equal(start.record.state, "UPLOADING");
    assert.equal(start.session.state, "UPLOADING");
    assert.equal(start.session.totalChunks, 3);
    assert.equal(start.session.transportKind, "FAKE_DETERMINISTIC");
    assert.equal((await uploads.start("owner-y50-a", first.id, first.revision)).code, "INVALID_STATE");

    const firstChunk = await uploads.advance("owner-y50-a", first.id, start.session.revision, 1);
    assert.equal(firstChunk.code, "APPLIED");
    if (firstChunk.code !== "APPLIED") return;
    assert.equal(firstChunk.session.confirmedChunks, 1);
    assert.equal(firstChunk.session.confirmedOffset, 2_097_152);
    assert.equal(firstChunk.record.state, "UPLOADING");

    const secondChunk = await uploads.advance("owner-y50-a", first.id, firstChunk.session.revision, 1);
    assert.equal(secondChunk.code, "APPLIED");
    if (secondChunk.code !== "APPLIED") return;
    assert.equal(secondChunk.session.confirmedChunks, 2);
    assert.equal(secondChunk.session.confirmedOffset, 4_194_304);

    const ambiguous = await uploads.markAmbiguous("owner-y50-a", first.id, secondChunk.session.revision);
    assert.equal(ambiguous.code, "APPLIED");
    if (ambiguous.code !== "APPLIED") return;
    assert.equal(ambiguous.session.state, "COMMIT_UNKNOWN");
    assert.equal(ambiguous.record.state, "RECONCILING");

    const reconciled = await uploads.reconcile("owner-y50-a", first.id, ambiguous.session.revision);
    assert.equal(reconciled.code, "APPLIED");
    if (reconciled.code !== "APPLIED") return;
    assert.equal(reconciled.record.state, "PUBLISHED_PRIVATE");
    assert.equal(reconciled.record.verificationState, "SIMULATION_COMPLETED");
    assert.equal(reconciled.record.transportKind, "FAKE_DETERMINISTIC");
    assert.notEqual(reconciled.record.verificationState, "REMOTE_PUBLICATION_VERIFIED");
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET verification_state='REMOTE_PUBLICATION_VERIFIED' WHERE owner_uid=$1 AND id=$2",
      ["owner-y50-a", first.id],
    ));
    assert.equal(reconciled.session.state, "COMPLETED");
    assert.equal(reconciled.session.confirmedOffset, 4_456_448);
    assert.equal(reconciled.session.confirmedChunks, 3);
    assert.match(reconciled.session.remoteVideoId ?? "", /^fake-[a-f0-9]{16}$/);
    assert.ok(reconciled.session.receipt);
    const receipt = reconciled.session.receipt as unknown as UploadReceipt;
    assert.equal(receipt.uploadState, "COMPLETED");
    assert.equal(receipt.verification, "NOT_VERIFIED");
    assert.equal(receipt.visibility, "private");
    assert.match(receipt.integrityDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(verifyUploadReceipt(receipt, {
      tenantId: "tenant-y50",
      authorityId: reconciled.record.operationId,
      googleAccountId: "channel-y50",
      operationId: reconciled.record.operationId,
      attemptId: reconciled.session.attemptId,
      assetId: reconciled.record.asset.artifactId,
      mediaDigest: reconciled.record.asset.mediaDigest,
      metadataDigest: reconciled.record.metadataDigest,
      approvalId: reconciled.record.id,
      totalBytes: 4_456_448,
    }).ok, true);
    assert.equal(reconciled.record.receipt?.uploadState, "COMPLETED");

    const events = await intents.events("owner-y50-a", first.id);
    assert.deepEqual(events.map(event => event.toState), [
      "AWAITING_CONFIRMATION", "QUEUED", "UPLOADING", "RECONCILING", "PUBLISHED_PRIVATE",
    ]);
    assert.equal(await uploads.get("owner-y50-b", first.id), undefined);
    assert.equal((await uploads.advance("owner-y50-b", first.id, reconciled.session.revision, 1)).code, "NOT_FOUND");

    const second = await createQueued("upload-b");
    const secondStart = await uploads.start("owner-y50-a", second.id, second.revision);
    assert.equal(secondStart.code, "APPLIED");
    if (secondStart.code !== "APPLIED") return;
    const one = await uploads.advance("owner-y50-a", second.id, secondStart.session.revision, 1);
    assert.equal(one.code, "APPLIED");
    if (one.code !== "APPLIED") return;
    const interrupted = await uploads.interrupt("owner-y50-a", second.id, one.session.revision);
    assert.equal(interrupted.code, "APPLIED");
    if (interrupted.code !== "APPLIED") return;
    assert.equal(interrupted.record.state, "INTERRUPTED");
    assert.equal(interrupted.session.state, "FAILED_RETRYABLE");
    assert.equal(interrupted.session.retryCount, 1);
    const resumed = await uploads.resume("owner-y50-a", second.id, interrupted.session.revision);
    assert.equal(resumed.code, "APPLIED");
    if (resumed.code !== "APPLIED") return;
    assert.equal(resumed.record.state, "UPLOADING");
    assert.equal(resumed.session.state, "UPLOADING");
    const tooMany = await uploads.advance("owner-y50-a", second.id, resumed.session.revision, 99);
    assert.equal(tooMany.code, "INVALID_COUNT");
    const completed = await uploads.advance("owner-y50-a", second.id, resumed.session.revision, 2);
    assert.equal(completed.code, "APPLIED");
    if (completed.code !== "APPLIED") return;
    assert.equal(completed.record.state, "PUBLISHED_PRIVATE");
    assert.equal(completed.record.verificationState, "SIMULATION_COMPLETED");
    assert.equal(completed.record.transportKind, "FAKE_DETERMINISTIC");
    const stale = await uploads.advance("owner-y50-a", second.id, resumed.session.revision, 1);
    assert.equal(stale.code, "INVALID_STATE");
  });
});
