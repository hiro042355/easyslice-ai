import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validatePublicationIntent } from "../../lib/publicationBoundary/validation";
import { canonicalPublicationMetadataJson, type PublicationMetadataDeclaration } from "../../lib/publicationRecords/metadata";
import { createPublicationRepository } from "../../lib/publicationRecords/repository";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { resolvePublicationPrincipal } from "../../lib/publicationIntegration/principal";
import { applyPublicationObservation } from "../../lib/publicationIntegration/observation";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

const tiktokMetadata: PublicationMetadataDeclaration = Object.freeze({
  title: "TikTok durable publication",
  description: "tiktok admission integration test",
  tags: Object.freeze(["tiktok"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "TIKTOK_SHORT_VIDEO",
});

const youtubeMetadata: PublicationMetadataDeclaration = Object.freeze({
  ...tiktokMetadata,
  contentFormat: "YOUTUBE_REGULAR",
});

const intentFor = (platform: "youtube" | "tiktok", key: string, metadata: PublicationMetadataDeclaration) => {
  const result = validatePublicationIntent({
    schemaVersion: 1,
    platform,
    operationId: `op-${key}`,
    idempotencyKey: key,
    asset: { artifactId: `asset-${key}`, revisionId: `rev-${key}`, mediaDigest: "a".repeat(64), mimeType: "video/mp4", size: 4096 },
    metadataDigest: digest(canonicalPublicationMetadataJson(metadata)),
    privacyStatus: "private",
  });
  if (result.code !== "REQUEST_DATA_VALID") throw new Error("intent-invalid");
  return result.intent;
};

const ownerPrincipal = () => {
  const resolved = resolvePublicationPrincipal({ ownerUid: "owner-tiktok-db", tenantId: "tenant-tiktok-db" });
  if (resolved.code !== "PRINCIPAL_BOUND") throw new Error("principal-invalid");
  return resolved.principal;
};

test("TikTok publication intents are admitted, preserved and fenced by the database", async () => {
  await withPostgreSqlTestEnvironment(async environment => {
    const repository = createPublicationRepository(environment.pool);
    const ownerUid = "owner-tiktok-db";
    const tenantId = "tenant-tiktok-db";

    // Existing YouTube rows keep working and are not rewritten by V000035.
    const youtube = await repository.create({
      ownerUid, tenantId, intent: intentFor("youtube", "youtube-key-1", youtubeMetadata), metadata: youtubeMetadata,
    });
    assert.equal(youtube.code, "APPLIED");
    if (youtube.code !== "APPLIED") return;
    assert.equal(youtube.record.platform, "youtube");
    assert.equal(youtube.record.transportKind, "NONE");

    const tiktok = await repository.create({
      ownerUid, tenantId, intent: intentFor("tiktok", "tiktok-key-1", tiktokMetadata), metadata: tiktokMetadata,
    });
    assert.equal(tiktok.code, "APPLIED");
    if (tiktok.code !== "APPLIED") return;
    assert.equal(tiktok.record.platform, "tiktok");
    assert.equal(tiktok.record.contentFormat, "TIKTOK_SHORT_VIDEO");
    assert.equal(tiktok.record.state, "AWAITING_CONFIRMATION");

    // The YouTube row is untouched by the TikTok admission.
    const storedYoutube = await environment.pool.query(
      "SELECT state, transport_kind, verification_state, revision FROM workflow.publication_intents WHERE id = $1",
      [youtube.record.id],
    );
    assert.equal(storedYoutube.rows[0]?.state, "AWAITING_CONFIRMATION");
    assert.equal(storedYoutube.rows[0]?.transport_kind, "NONE");
    assert.equal(storedYoutube.rows[0]?.verification_state, "REMOTE_STATE_UNKNOWN");
    assert.equal(Number(storedYoutube.rows[0]?.revision), 1);

    // Platform and transport are constrained independently and as a pair.
    await assert.rejects(environment.pool.query(
      "INSERT INTO workflow.publication_intents (id, owner_uid, tenant_id, state, platform, content_format, operation_id, idempotency_key, asset_id, asset_revision_id, media_digest, mime_type, size_bytes, metadata_digest, title, description, tags, subtitle_refs, privacy_status) VALUES (gen_random_uuid(), $1, $2, 'DRAFT', 'bilibili', 'TIKTOK_SHORT_VIDEO', 'op-b', 'key-b', 'asset-b', 'rev-b', $3, 'video/mp4', 1, $3, 't', '', '[]', '[]', 'private')",
      [ownerUid, tenantId, "a".repeat(64)],
    ), /publication_intents_platform_ck/);
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET transport_kind = 'REAL_TIKTOK' WHERE id = $1", [youtube.record.id],
    ), /publication_intents_platform_transport_ck/);
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET transport_kind = 'REAL_YOUTUBE' WHERE id = $1", [tiktok.record.id],
    ), /publication_intents_platform_transport_ck/);
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET transport_kind = 'REAL_TIKTOK', verification_state = 'REMOTE_PUBLICATION_VERIFIED' WHERE id = $1",
      [tiktok.record.id],
    ), /publication_intents_remote_verified_ck/);
    // An unknown transport is refused by the destination constraints; the admitted
    // value list itself is asserted from the catalog below.
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET transport_kind = 'TELEPATHIC' WHERE id = $1", [tiktok.record.id],
    ), /publication_intents_(platform_transport|transport_kind)_ck/);
    const definitions = await environment.pool.query(
      "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('publication_intents_platform_ck', 'publication_intents_transport_kind_ck', 'publication_intents_platform_transport_ck')",
    );
    const definition = (name: string) => String(definitions.rows.find(row => row.conname === name)?.definition ?? "");
    assert.match(definition("publication_intents_platform_ck"), /'tiktok'/);
    assert.match(definition("publication_intents_platform_ck"), /'youtube'/);
    assert.doesNotMatch(definition("publication_intents_platform_ck"), /'bilibili'/);
    assert.match(definition("publication_intents_transport_kind_ck"), /'REAL_TIKTOK'/);
    assert.match(definition("publication_intents_transport_kind_ck"), /'REAL_YOUTUBE'/);
    assert.doesNotMatch(definition("publication_intents_transport_kind_ck"), /TELEPATHIC/);
    assert.match(definition("publication_intents_platform_transport_ck"), /tiktok/);

    // Forensics: an unsupported destination cannot be persisted at the repository layer either.
    const bilibili = validatePublicationIntent({
      schemaVersion: 1, platform: "bilibili", operationId: "op-bilibili", idempotencyKey: "bilibili-key",
      asset: { artifactId: "asset-bilibili", revisionId: "rev-bilibili", mediaDigest: "a".repeat(64), mimeType: "video/mp4", size: 4096 },
      metadataDigest: digest(canonicalPublicationMetadataJson(tiktokMetadata)), privacyStatus: "private",
    });
    assert.equal(bilibili.code, "REQUEST_DATA_VALID");
    if (bilibili.code === "REQUEST_DATA_VALID") {
      const rejected = await repository.create({
        ownerUid, tenantId, intent: bilibili.intent, metadata: tiktokMetadata,
      });
      assert.deepEqual(rejected, { code: "INVALID_RECORD" });
    }

    const principal = ownerPrincipal();
    const id = tiktok.record.id;
    const revision = tiktok.record.revision;

    const accepted = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: revision, observationId: "observation-1", observation: "DISPATCH_ACCEPTED",
    });
    assert.equal(accepted.code, "APPLIED");
    if (accepted.code !== "APPLIED") return;
    assert.equal(accepted.record.state, "QUEUED");

    const foreignOwner = await applyPublicationObservation(environment.pool, {
      principal: { ...principal, ownerUid: "owner-other" }, publicationId: id,
      expectedRevision: accepted.record.revision, observationId: "observation-foreign", observation: "UPLOAD_STARTED",
    });
    assert.deepEqual(foreignOwner, { code: "NOT_FOUND" });

    const started = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: accepted.record.revision,
      observationId: "observation-2", observation: "UPLOAD_STARTED",
    });
    assert.equal(started.code, "APPLIED");
    if (started.code !== "APPLIED") return;
    assert.equal(started.record.state, "UPLOADING");
    assert.equal(started.record.transportKind, "REAL_TIKTOK");

    const premature = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: started.record.revision,
      observationId: "observation-3", observation: "PUBLISH_PRIVATE_CONFIRMED",
    });
    assert.deepEqual(premature, { code: "REJECTED", reason: "PUBLISH_ID_REQUIRED" });

    const stale = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: started.record.revision - 1,
      observationId: "observation-4", observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider: { publishId: "tiktok-publish-1" },
    });
    assert.deepEqual(stale, { code: "CONFLICT" });

    const confirmed = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: started.record.revision,
      observationId: "observation-5", observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider: { publishId: "tiktok-publish-1", providerStatus: "PUBLISH_COMPLETE" },
    });
    assert.equal(confirmed.code, "APPLIED");
    if (confirmed.code !== "APPLIED") return;
    assert.equal(confirmed.record.state, "PUBLISHED_PRIVATE");
    assert.equal(confirmed.record.verificationState, "REMOTE_PUBLICATION_VERIFIED");
    assert.equal(confirmed.record.transportKind, "REAL_TIKTOK");
    assert.equal(confirmed.record.remoteVideoId, "tiktok-publish-1");
    assert.equal(confirmed.record.receipt?.verification, "VERIFIED");

    // Replay of the same observation is idempotent, a new confirmation is terminal.
    const replay = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: confirmed.record.revision,
      observationId: "observation-5", observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider: { publishId: "tiktok-publish-1" },
    });
    assert.equal(replay.code, "DUPLICATE");
    const terminal = await applyPublicationObservation(environment.pool, {
      principal, publicationId: id, expectedRevision: confirmed.record.revision,
      observationId: "observation-6", observation: "UPLOAD_STARTED",
    });
    assert.deepEqual(terminal, { code: "REJECTED", reason: "TERMINAL_STATE" });

    // A fresh repository over a new connection sees the committed state (restart).
    const restarted = createPublicationRepository(environment.pool);
    const restored = await restarted.get(ownerUid, id);
    assert.equal(restored?.state, "PUBLISHED_PRIVATE");
    assert.equal(restored?.receipt?.observationId, "observation-5");
    const events = await restarted.events(ownerUid, id);
    assert.deepEqual(events.map(event => event.toState),
      ["AWAITING_CONFIRMATION", "QUEUED", "UPLOADING", "PUBLISHED_PRIVATE"]);

    // Failure recovery: unknown outcome may still be reconciled to a confirmed publication.
    const failing = await repository.create({
      ownerUid, tenantId, channelId: "channel-tiktok-db", rightsEvidenceRef: "rights-evidence-tiktok-db",
      intent: intentFor("tiktok", "tiktok-key-2", tiktokMetadata), metadata: tiktokMetadata,
    });
    assert.equal(failing.code, "APPLIED");
    if (failing.code !== "APPLIED") return;
    const steps = [
      { observationId: "recovery-1", observation: "DISPATCH_ACCEPTED" as const },
      { observationId: "recovery-2", observation: "UPLOAD_STARTED" as const },
      { observationId: "recovery-3", observation: "OUTCOME_UNKNOWN" as const },
    ];
    let currentRevision = failing.record.revision;
    for (const step of steps) {
      const applied = await applyPublicationObservation(environment.pool, {
        principal, publicationId: failing.record.id, expectedRevision: currentRevision, ...step,
      });
      assert.equal(applied.code, "APPLIED");
      if (applied.code !== "APPLIED") return;
      currentRevision = applied.record.revision;
    }
    const failure = await applyPublicationObservation(environment.pool, {
      principal, publicationId: failing.record.id, expectedRevision: currentRevision,
      observationId: "recovery-4", observation: "PERMANENT_FAILURE", error: { code: "TIKTOK_REJECTED", message: "video too long" },
    });
    assert.equal(failure.code, "APPLIED");
    if (failure.code !== "APPLIED") return;
    assert.equal(failure.record.state, "FAILED");
    assert.equal(failure.record.verificationState, "REMOTE_PUBLICATION_FAILED");
    assert.match(failure.record.lastError ?? "", /TIKTOK_REJECTED/);

    const requeued = await repository.transition(ownerUid, failing.record.id, failure.record.revision, "QUEUED");
    assert.equal(requeued.code, "APPLIED");
    if (requeued.code !== "APPLIED") return;
    const recovered = await applyPublicationObservation(environment.pool, {
      principal, publicationId: failing.record.id, expectedRevision: requeued.record.revision,
      observationId: "recovery-5", observation: "UPLOAD_STARTED",
    });
    assert.equal(recovered.code, "APPLIED");
    assert.equal(recovered.code === "APPLIED" ? recovered.record.state : "", "UPLOADING");
  });
});
