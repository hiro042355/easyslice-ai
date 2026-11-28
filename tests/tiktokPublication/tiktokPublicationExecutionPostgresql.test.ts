import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { canonicalPublicationMetadataJson, type PublicationMetadataDeclaration } from "../../lib/publicationRecords/metadata";
import { createPublicationRepository } from "../../lib/publicationRecords/repository";
import { createDurableMediaOwnershipRepository } from "../../lib/server/durableMediaOwnership";
import { canonicalRightsDigest, type RightsEvidenceInput } from "../../lib/rightsRegistry/contracts";
import { createRightsRegistry } from "../../lib/rightsRegistry/repository";
import {
  ADAPTER_OBSERVATION_PATH,
  ADAPTER_PUBLICATION_PATH,
  adapterSignatureMessage,
  verifyAdapterObservationSignature,
  verifyAdapterRequestSignature,
} from "../../lib/publicationIntegration/adapterTransport";
import { applyAdapterObservation } from "../../lib/tiktokPublication/observationApplication";
import {
  TIKTOK_OBSERVATION_REQUEST_VERSION,
  type AdapterObservationReport,
} from "../../lib/tiktokPublication/observationBoundary";
import { verifyPublicationGrant, type PublicationGrantClaims } from "../../lib/publicationIntegration/grant";
import { executeTikTokPublication } from "../../lib/tiktokPublication/execution";
import {
  readTikTokPublicationRequest,
  TIKTOK_PUBLICATION_REQUEST_VERSION,
} from "../../lib/tiktokPublication/requestBoundary";

/**
 * Loopback integration: Core service -> real HTTP -> adapter-shaped stub.
 *
 * The stub is deliberately independent of Core's client code. It verifies the
 * transport signature with the same rule an adapter would, verifies the grant with
 * the grant key only, and answers as the Mock TikTok API would. The assertions then
 * read the durable PostgreSQL record, so the whole path is exercised rather than a
 * fake port.
 */
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const transportKeyId = "core-transport-1";
const transportSecret = "core-transport-secret";
const grantKeyId = "grant-k1";
const grantSecret = "grant-signing-secret";

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "Loopback TikTok publication",
  description: "core to adapter loopback",
  tags: Object.freeze(["tiktok"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "TIKTOK_SHORT_VIDEO",
});

type StubMode = "publish" | "unknown" | "provider_rejected";
type StubCall = Readonly<{ signature: string; grant: string; claims?: PublicationGrantClaims }>;

const startAdapter = async (state: { mode: StubMode }) => {
  const calls: StubCall[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value[0] : value;
    }
    const signature = verifyAdapterRequestSignature({
      body,
      headers,
      secrets: { [transportKeyId]: transportSecret },
      now: Date.now(),
    });
    if (signature !== "VERIFIED") {
      calls.push({ signature, grant: "NOT_CHECKED" });
      respond(response, 401, { error: "unauthenticated" });
      return;
    }
    let token = "";
    try {
      token = String((JSON.parse(body) as { grant?: unknown }).grant ?? "");
    } catch {
      calls.push({ signature, grant: "MALFORMED_BODY" });
      respond(response, 400, { code: "GRANT_REJECTED", reason: "MALFORMED" });
      return;
    }
    const grant = verifyPublicationGrant({
      token,
      signingKeys: { [grantKeyId]: grantSecret },
      expectedPlatform: "tiktok",
      now: Date.now(),
    });
    if (grant.code !== "GRANT_VERIFIED") {
      calls.push({ signature, grant: grant.code });
      respond(response, 400, { code: "GRANT_REJECTED", reason: grant.code });
      return;
    }
    calls.push({ signature, grant: "GRANT_VERIFIED", claims: grant.claims });
    const publicationId = grant.claims.publicationId;
    if (state.mode === "publish") {
      respond(response, 200, { code: "PUBLISHED_PRIVATE", publicationId, publishId: "publish-loopback-1" });
    } else if (state.mode === "unknown") {
      respond(response, 200, { code: "OUTCOME_UNKNOWN", publicationId });
    } else {
      respond(response, 200, { code: "PROVIDER_REJECTED", publicationId, providerCode: "spam_risk_too_many_posts" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("adapter-stub-not-bound");
  return Object.freeze({
    endpoint: `http://127.0.0.1:${address.port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
};

const respond = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const rightsEvidence = (ownerUid: string, tenantId: string, rightsKey: string): RightsEvidenceInput => {
  const effectiveAtMs = Date.now() - 60_000;
  const base = {
    licenseKind: "OWNED" as const,
    licenseRef: "license-loopback",
    evidenceRef: "evidence-loopback",
    permittedUsage: ["PUBLICATION"] as const,
    platformPermissions: [{ platform: "tiktok" as const, allowed: true, usages: ["PUBLICATION"] as const }],
    effectiveAtMs,
  };
  return Object.freeze({
    ownerUid,
    tenantId,
    rightsKey,
    sourceId: "source-loopback",
    licenseKind: base.licenseKind,
    licenseRef: base.licenseRef,
    evidenceRef: base.evidenceRef,
    evidenceDigest: canonicalRightsDigest(base),
    permittedUsage: base.permittedUsage,
    platformPermissions: base.platformPermissions,
    effectiveAtMs,
  });
};

const commandFor = async (jobId: string, exportId: string, ownerUid: string, key: string) => {
  const body = Object.freeze({
    requestVersion: TIKTOK_PUBLICATION_REQUEST_VERSION,
    operationId: `op-${key}`,
    asset: Object.freeze({
      artifactId: `asset-${key}`,
      revisionId: `rev-${key}`,
      mediaDigest: "b".repeat(64),
      mimeType: "video/mp4",
      size: 8192,
    }),
    metadata,
    metadataDigest: sha256(canonicalPublicationMetadataJson(metadata)),
    contentFormat: "TIKTOK_SHORT_VIDEO",
    coreResource: Object.freeze({ namespace: "core-export", jobId, exportId }),
    rightsKey: `rights-${ownerUid}`,
    channelId: "channel-loopback",
  });
  const parsed = await readTikTokPublicationRequest(new Request("http://127.0.0.1/api/v1/publications/tiktok", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), key);
  if (parsed.code !== "REQUEST_ACCEPTED") throw new Error(`request-rejected:${parsed.error}`);
  return parsed.command;
};

test("Core publishes to TikTok through the adapter and never double-posts on replay", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-tiktok-loopback";
    const tenantId = "tenant-tiktok-loopback";
    const ownership = createDurableMediaOwnershipRepository(environment.pool);
    const rights = createRightsRegistry(environment.pool);

    const job = await ownership.createJob(ownerUid);
    const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
    assert.ok(exported);

    const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
    assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

    const state: { mode: StubMode } = { mode: "publish" };
    const adapter = await startAdapter(state);
    const deps = {
      client: environment.pool,
      ownership,
      rights,
      adapter: {
        endpoint: adapter.endpoint,
        transportKeyId,
        transportSecret,
        grantKeyId,
        grantSigningKey: grantSecret,
      },
      tenantId,
    };

    try {
      // 1. The happy path: Core -> signed HTTP -> stub -> Core DB.
      const command = await commandFor(job.id, exported.id, ownerUid, "loopback-1");
      const first = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-1", command });
      assert.equal(first.code, "PUBLICATION_CONFIRMED");
      if (first.code !== "PUBLICATION_CONFIRMED") return;
      assert.equal(first.record.platform, "tiktok");
      assert.equal(first.record.state, "PUBLISHED_PRIVATE");
      assert.equal(first.record.remoteVideoId, "publish-loopback-1");
      assert.equal(first.record.verificationState, "REMOTE_PUBLICATION_VERIFIED");
      assert.equal(first.record.transportKind, "REAL_TIKTOK");
      assert.equal(adapter.calls.length, 1);
      assert.equal(adapter.calls[0]?.signature, "VERIFIED");
      assert.equal(adapter.calls[0]?.grant, "GRANT_VERIFIED");
      assert.equal(adapter.calls[0]?.claims?.publicationId, first.record.id);
      assert.equal(adapter.calls[0]?.claims?.ownerUid, ownerUid);
      assert.equal(adapter.calls[0]?.claims?.platform, "tiktok");
      assert.equal(adapter.calls[0]?.claims?.contentFormat, "TIKTOK_SHORT_VIDEO");

      const stored = await createPublicationRepository(environment.pool).get(ownerUid, first.record.id);
      assert.equal(stored?.state, "PUBLISHED_PRIVATE");
      assert.equal(stored?.remoteVideoId, "publish-loopback-1");

      // 2. Replay of the same idempotency key returns the stored result, no second send.
      const replay = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-1", command });
      assert.equal(replay.code, "PUBLICATION_CONFIRMED");
      assert.equal(replay.code === "PUBLICATION_CONFIRMED" ? replay.record.id : "", first.record.id);
      assert.equal(adapter.calls.length, 1, "a replay must not reach the adapter again");

      // 3. An unexplained answer becomes OUTCOME_UNKNOWN and stays so on replay.
      state.mode = "unknown";
      const unknownCommand = await commandFor(job.id, exported.id, ownerUid, "loopback-2");
      const unknown = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-2", command: unknownCommand });
      assert.equal(unknown.code, "PUBLICATION_IN_PROGRESS");
      if (unknown.code !== "PUBLICATION_IN_PROGRESS") return;
      assert.equal(unknown.outcomeUnknown, true);
      assert.equal(unknown.record.state, "INTERRUPTED");
      assert.equal(unknown.record.verificationState, "REMOTE_STATE_UNKNOWN");
      assert.equal(adapter.calls.length, 2);

      const unknownReplay = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-2", command: unknownCommand });
      assert.equal(unknownReplay.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(unknownReplay.code === "PUBLICATION_IN_PROGRESS" ? unknownReplay.outcomeUnknown : false, true);
      assert.equal(adapter.calls.length, 2, "an unknown outcome must never be re-sent");

      // 4. A provider verdict is terminal.
      state.mode = "provider_rejected";
      const rejectedCommand = await commandFor(job.id, exported.id, ownerUid, "loopback-3");
      const rejected = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-3", command: rejectedCommand });
      assert.equal(rejected.code, "PUBLICATION_FAILED");
      if (rejected.code !== "PUBLICATION_FAILED") return;
      assert.equal(rejected.record.state, "FAILED");
      assert.match(rejected.record.lastError ?? "", /PROVIDER_REJECTED/);

      // 5. The adapter refuses an unsigned request: the signature check is live, not assumed.
      const unsigned = await fetch(`${adapter.endpoint}/publications/tiktok`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant: "x" }),
      });
      assert.equal(unsigned.status, 401);

      // 6. Another owner cannot publish someone else's export; nothing is dispatched.
      const callsBefore = adapter.calls.length;
      const foreignCommand = await commandFor(job.id, exported.id, ownerUid, "loopback-4");
      const foreign = await executeTikTokPublication(deps, {
        ownerUid: "owner-tiktok-foreign",
        idempotencyKey: "idem-loopback-4",
        command: foreignCommand,
      });
      assert.equal(foreign.code, "PUBLICATION_REJECTED");
      assert.equal(foreign.code === "PUBLICATION_REJECTED" ? foreign.status : 0, 403);
      assert.equal(adapter.calls.length, callsBefore);

      // 7. Revoked rights block dispatch before a record or a grant exists.
      const latest = await rights.getLatest(ownerUid, `rights-${ownerUid}`);
      assert.ok(latest);
      const revoked = await rights.revoke(ownerUid, `rights-${ownerUid}`, latest.revision);
      assert.equal(revoked.code, "APPLIED");
      const blockedCommand = await commandFor(job.id, exported.id, ownerUid, "loopback-5");
      const blocked = await executeTikTokPublication(deps, { ownerUid, idempotencyKey: "idem-loopback-5", command: blockedCommand });
      assert.equal(blocked.code, "PUBLICATION_REJECTED");
      assert.equal(blocked.code === "PUBLICATION_REJECTED" ? blocked.status : 0, 403);
      assert.match(blocked.code === "PUBLICATION_REJECTED" ? blocked.error : "", /^rights_/);
      assert.equal(adapter.calls.length, callsBefore);
      const leftBehind = await environment.pool.query(
        "SELECT count(*)::int AS n FROM workflow.publication_intents WHERE owner_uid = $1 AND idempotency_key = 'idem-loopback-5'",
        [ownerUid],
      );
      assert.equal(Number(leftBehind.rows[0]?.n), 0, "a rejected request must not leave a record");
    } finally {
      await adapter.close();
    }
  });
});

test("an unreachable adapter yields OUTCOME_UNKNOWN rather than a failure or a resend", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-tiktok-down";
    const tenantId = "tenant-tiktok-down";
    const ownership = createDurableMediaOwnershipRepository(environment.pool);
    const rights = createRightsRegistry(environment.pool);
    const job = await ownership.createJob(ownerUid);
    const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
    assert.ok(exported);
    const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
    assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

    const command = await commandFor(job.id, exported.id, ownerUid, "down-1");
    // Port 1 on loopback refuses immediately: the request may still have been retried
    // by a proxy in the real world, so the outcome is unknown, not failed.
    const result = await executeTikTokPublication({
      client: environment.pool,
      ownership,
      rights,
      adapter: {
        endpoint: "http://127.0.0.1:1",
        transportKeyId,
        transportSecret,
        grantKeyId,
        grantSigningKey: grantSecret,
      },
      tenantId,
    }, { ownerUid, idempotencyKey: "idem-down-1", command });
    assert.equal(result.code, "PUBLICATION_IN_PROGRESS");
    if (result.code !== "PUBLICATION_IN_PROGRESS") return;
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.record.state, "INTERRUPTED");
    const second = await executeTikTokPublication({
      client: environment.pool,
      ownership,
      rights,
      adapter: {
        endpoint: "http://127.0.0.1:1",
        transportKeyId,
        transportSecret,
        grantKeyId,
        grantSigningKey: grantSecret,
      },
      tenantId,
    }, { ownerUid, idempotencyKey: "idem-down-1", command });
    assert.equal(second.code, "PUBLICATION_IN_PROGRESS");
    assert.equal(second.code === "PUBLICATION_IN_PROGRESS" ? second.record.id : "", result.record.id);
  });
});

test("adapter observations drive Core state with scope, superseded and duplicate rules", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-tiktok-observation";
    const tenantId = "local-tenant";
    const ownership = createDurableMediaOwnershipRepository(environment.pool);
    const rights = createRightsRegistry(environment.pool);
    const job = await ownership.createJob(ownerUid);
    const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
    assert.ok(exported);
    const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
    assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

    const command = await commandFor(job.id, exported.id, ownerUid, "obs-1");
    const repository = createPublicationRepository(environment.pool);
    const created = await repository.create({
      ownerUid,
      tenantId,
      intent: command.intent,
      metadata: command.metadata,
      channelId: command.channelId,
      rightsEvidenceRef: "evidence-loopback",
    });
    assert.ok(created.code === "APPLIED");
    const publicationId = created.record.id;

    const report = (observation: AdapterObservationReport, overrides: Partial<AdapterObservationReport> = {}) =>
      Object.freeze({ ...observation, ...overrides });

    const dispatch: AdapterObservationReport = report({
      requestVersion: TIKTOK_OBSERVATION_REQUEST_VERSION,
      ownerUid,
      tenantId,
      publicationId,
      observationId: "obs-dispatch-1",
      observation: "DISPATCH_ACCEPTED",
    });

    const queued = await applyAdapterObservation(environment.pool, dispatch);
    assert.equal(queued.code, "APPLIED");
    assert.equal(queued.code === "APPLIED" ? queued.record.state : undefined, "QUEUED");

    // The same observation again is absorbed, not applied twice.
    const repeated = await applyAdapterObservation(environment.pool, report(dispatch, { observationId: "obs-dispatch-2" }));
    assert.equal(repeated.code, "DUPLICATE");
    assert.equal(repeated.code === "DUPLICATE" ? repeated.record.state : undefined, "QUEUED");

    const started = await applyAdapterObservation(environment.pool, report(dispatch, {
      observationId: "obs-start-1",
      observation: "UPLOAD_STARTED",
    }));
    assert.equal(started.code, "APPLIED");
    assert.equal(started.code === "APPLIED" ? started.record.state : undefined, "UPLOADING");

    // A late DISPATCH_ACCEPTED from the adapter must not move the row backwards.
    const late = await applyAdapterObservation(environment.pool, report(dispatch, { observationId: "obs-dispatch-3" }));
    assert.equal(late.code, "DUPLICATE");
    assert.equal(late.code === "DUPLICATE" ? late.record.state : undefined, "UPLOADING");

    // A foreign owner is answered as not-found and changes nothing.
    const foreign = await applyAdapterObservation(environment.pool, report(dispatch, {
      ownerUid: "owner-tiktok-foreign",
      observationId: "obs-foreign-1",
      observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider: Object.freeze({ publishId: "publish-foreign" }),
    }));
    assert.equal(foreign.code, "REJECTED");
    assert.equal(foreign.code === "REJECTED" ? foreign.status : undefined, 404);

    const confirmed = await applyAdapterObservation(environment.pool, report(dispatch, {
      observationId: "obs-confirmed-1",
      observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider: Object.freeze({ publishId: "publish-obs-1", providerStatus: "PUBLISH_COMPLETE" }),
    }));
    assert.equal(confirmed.code, "APPLIED");
    if (confirmed.code !== "APPLIED") return;
    assert.equal(confirmed.record.state, "PUBLISHED_PRIVATE");
    assert.equal(confirmed.record.transportKind, "REAL_TIKTOK");
    assert.equal(confirmed.record.remoteVideoId, "publish-obs-1");

    const stored = await repository.get(ownerUid, publicationId);
    assert.equal(stored?.state, "PUBLISHED_PRIVATE");
    assert.equal(stored?.receipt?.verification, "VERIFIED");

    // The adapter's own signature rule is verified independently in both directions.
    const body = JSON.stringify(dispatch);
    const timestamp = Date.now();
    const signature = createHmac("sha256", "transport-secret").update(
      adapterSignatureMessage(ADAPTER_OBSERVATION_PATH, body, timestamp),
    ).digest("base64url");
    const headers = {
      "x-nexcut-transport-key-id": "transport-key-1",
      "x-nexcut-transport-timestamp": String(timestamp),
      "x-nexcut-transport-signature": signature,
    };
    const secrets = Object.freeze({ "transport-key-1": "transport-secret" });
    assert.equal(verifyAdapterObservationSignature({ body, headers, secrets, now: timestamp }), "VERIFIED");
    assert.equal(verifyAdapterObservationSignature({ body: `${body} `, headers, secrets, now: timestamp }), "UNAUTHENTICATED");
    assert.equal(verifyAdapterObservationSignature({ body, headers, secrets, now: timestamp + 120_000 }), "STALE");
    // A signature minted for the publication leg cannot be replayed onto the observation leg.
    const publicationSignature = createHmac("sha256", "transport-secret").update(
      adapterSignatureMessage(ADAPTER_PUBLICATION_PATH, body, timestamp),
    ).digest("base64url");
    assert.equal(verifyAdapterObservationSignature({
      body,
      headers: Object.freeze({ ...headers, "x-nexcut-transport-signature": publicationSignature }),
      secrets,
      now: timestamp,
    }), "UNAUTHENTICATED");
  });
});
