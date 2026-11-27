import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validatePublicationIntent } from "../../lib/publicationBoundary/validation";
import {
  canonicalPublicationMetadataJson,
  type PublicationMetadataDeclaration,
} from "../../lib/publicationRecords/metadata";
import { createPublicationRepository } from "../../lib/publicationRecords/repository";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "Y49 durable publication",
  description: "real PostgreSQL repository test",
  tags: Object.freeze(["y49", "durable"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "YOUTUBE_REGULAR",
});

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

const intentFor = (key: string) => {
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
      size: 4096,
    },
    metadataDigest: digest(canonicalPublicationMetadataJson(metadata)),
    privacyStatus: "private",
  });
  if (result.code !== "REQUEST_DATA_VALID") throw new Error("publication-intent-invalid");
  return result.intent;
};

test("durable publication repository persists, deduplicates and fences transitions", async () => {
  await withPostgreSqlTestEnvironment(async environment => {
    const repository = createPublicationRepository(environment.pool);
    const input = {
      ownerUid: "owner-y49-a",
      tenantId: "tenant-y49",
      intent: intentFor("publication-key-a"),
      metadata,
      channelId: "channel-y49",
      rightsEvidenceRef: "rights/y49/evidence",
    };
    const created = await repository.create(input);
    assert.equal(created.code, "APPLIED");
    if (created.code !== "APPLIED") return;
    assert.equal(created.record.verificationState, "REMOTE_STATE_UNKNOWN");
    assert.equal(created.record.transportKind, "NONE");
    await assert.rejects(environment.pool.query(
      "UPDATE workflow.publication_intents SET verification_state='REMOTE_PUBLICATION_VERIFIED' WHERE owner_uid=$1 AND id=$2",
      [input.ownerUid, created.record.id],
    ));

    const duplicate = await repository.create(input);
    assert.equal(duplicate.code, "EXISTING");
    assert.equal(duplicate.code === "EXISTING" ? duplicate.record.id : "", created.record.id);

    const conflicting = await repository.create({
      ...input,
      intent: intentFor("publication-key-a"),
      metadata: Object.freeze({ ...metadata, title: "different title" }),
    });
    assert.equal(conflicting.code, "CONFLICT");

    assert.equal((await repository.list("owner-y49-a")).length, 1);
    assert.equal((await repository.list("owner-y49-b")).length, 0);
    assert.equal(await repository.get("owner-y49-b", created.record.id), undefined);

    const queued = await repository.transition("owner-y49-a", created.record.id, 1, "QUEUED");
    assert.equal(queued.code, "APPLIED");
    if (queued.code !== "APPLIED") return;
    assert.equal(queued.record.state, "QUEUED");
    assert.equal(queued.record.revision, 2);

    const stale = await repository.transition("owner-y49-a", created.record.id, 1, "CANCELLED");
    assert.equal(stale.code, "CONFLICT");
    const illegal = await repository.transition("owner-y49-a", created.record.id, 2, "RECONCILING");
    assert.equal(illegal.code, "CONFLICT");
    const foreignOwner = await repository.transition("owner-y49-b", created.record.id, 2, "CANCELLED");
    assert.equal(foreignOwner.code, "NOT_FOUND");

    const events = await repository.events("owner-y49-a", created.record.id);
    assert.deepEqual(events.map(event => event.toState), ["AWAITING_CONFIRMATION", "QUEUED"]);
  });
});
