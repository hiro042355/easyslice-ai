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
  ADAPTER_PUBLICATION_PATH,
  ADAPTER_STATUS_PATH,
  adapterSignatureMessage,
  verifyAdapterRequestSignature,
} from "../../lib/publicationIntegration/adapterTransport";
import { verifyPublicationGrant } from "../../lib/publicationIntegration/grant";
import { executeTikTokPublication } from "../../lib/tiktokPublication/execution";
import {
  readTikTokPublicationRequest,
  TIKTOK_PUBLICATION_REQUEST_VERSION,
} from "../../lib/tiktokPublication/requestBoundary";
import { reconcileTikTokPublication } from "../../lib/tiktokPublication/reconciliation";
import { createAdapterRateLimiter } from "../../lib/tiktokPublication/adapterRateLimit";
import { projectTikTokReconciliation } from "../../lib/tiktokPublication/responseProjector";

/**
 * OUTCOME_UNKNOWN reconciliation over a real PostgreSQL row and a real loopback
 * socket. The stub is adapter-shaped: it verifies the transport signature with the
 * same rule the adapter uses and answers only on the read-only status contract. It
 * also counts publish calls, which is how these tests prove that reconciling never
 * starts a second TikTok post.
 */
const transportKeyId = "reconcile-transport-1";
const transportSecret = "reconcile-transport-secret";
const grantKeyId = "reconcile-grant-1";
const grantSecret = "reconcile-grant-secret";

const tenantId = "tenant-reconcile";
const ownerUid = "owner-reconcile";

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "Reconciliation TikTok publication",
  description: "outcome unknown recovery",
  tags: Object.freeze(["reconcile"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "TIKTOK_SHORT_VIDEO",
});

type StatusMode =
  | "PUBLISHED"
  | "PUBLISHED_NO_REMOTE_ID"
  | "PROCESSING"
  | "FAILED"
  | "UNKNOWN"
  | "NOT_FOUND"
  | "MALFORMED"
  | "UNAUTHORIZED";

type AdapterState = Readonly<{
  publishMode: "UNKNOWN" | "PUBLISHED";
  statusMode: StatusMode;
  statusDelayMs?: number;
}>;

type AdapterCalls = {
  publish: number;
  status: number;
  rejected: string[];
};

const view = (
  publicationId: string,
  overrides: Record<string, unknown>,
): Record<string, unknown> => Object.freeze({
  statusVersion: "publication-status-v1",
  publicationId,
  adapterState: "PUBLISHED_PRIVATE",
  settled: true,
  remotePublicationId: "publish-remote-1",
  providerStatus: "PUBLISH_COMPLETE",
  errorCategory: null,
  dispatchEvidence: "LEDGER_RECORDED",
  reconciliationRequired: false,
  lastCheckedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const respond = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const startAdapter = async (state: AdapterState) => {
  const calls: AdapterCalls = { publish: 0, status: 0, rejected: [] };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
    const path = (request.url ?? "/").split("?")[0];

    if (path === ADAPTER_STATUS_PATH) {
      const keyId = headers["x-nexcut-transport-key-id"];
      const timestamp = Number(headers["x-nexcut-transport-timestamp"]);
      const supplied = headers["x-nexcut-transport-signature"] ?? "";
      if (keyId !== transportKeyId) {
        calls.rejected.push("unknown_key");
        respond(response, 401, { error: { code: "unknown_transport_key" } });
        return;
      }
      if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) {
        calls.rejected.push("stale");
        respond(response, 401, { error: { code: "stale_request" } });
        return;
      }
      const expected = createHmac("sha256", transportSecret)
        .update(adapterSignatureMessage(ADAPTER_STATUS_PATH, body, timestamp))
        .digest("base64url");
      if (expected !== supplied) {
        calls.rejected.push("signature");
        respond(response, 401, { error: { code: "adapter_signature_invalid" } });
        return;
      }
      let parsed: { publicationId?: unknown; tenantId?: unknown };
      try {
        parsed = JSON.parse(body) as { publicationId?: unknown; tenantId?: unknown };
      } catch {
        respond(response, 400, { error: { code: "malformed_body" } });
        return;
      }
      const publicationId = typeof parsed.publicationId === "string" ? parsed.publicationId : "";
      calls.status += 1;
      if (state.statusDelayMs) await new Promise((done) => setTimeout(done, state.statusDelayMs));
      if (state.statusMode === "UNAUTHORIZED") {
        respond(response, 401, { error: { code: "adapter_signature_invalid" } });
        return;
      }
      if (state.statusMode === "MALFORMED") {
        respond(response, 200, { status: view("a-different-publication", {}) });
        return;
      }
      if (parsed.tenantId !== tenantId || state.statusMode === "NOT_FOUND") {
        respond(response, 200, {
          status: view(publicationId, {
            adapterState: "NOT_FOUND",
            settled: false,
            remotePublicationId: null,
            providerStatus: null,
            dispatchEvidence: "NO_LEDGER_ENTRY",
            reconciliationRequired: true,
          }),
        });
        return;
      }
      if (state.statusMode === "PROCESSING") {
        respond(response, 200, {
          status: view(publicationId, {
            adapterState: "PUBLISHING",
            settled: false,
            remotePublicationId: null,
            providerStatus: "PROCESSING_UPLOAD",
            reconciliationRequired: true,
          }),
        });
        return;
      }
      if (state.statusMode === "UNKNOWN") {
        respond(response, 200, {
          status: view(publicationId, {
            adapterState: "UNKNOWN",
            settled: false,
            remotePublicationId: null,
            providerStatus: null,
            reconciliationRequired: true,
          }),
        });
        return;
      }
      if (state.statusMode === "FAILED") {
        respond(response, 200, {
          status: view(publicationId, {
            adapterState: "FAILED",
            remotePublicationId: null,
            providerStatus: "FAILED",
            errorCategory: "MOCK_REJECTED",
            reconciliationRequired: false,
          }),
        });
        return;
      }
      if (state.statusMode === "PUBLISHED_NO_REMOTE_ID") {
        respond(response, 200, { status: view(publicationId, { remotePublicationId: null }) });
        return;
      }
      respond(response, 200, { status: view(publicationId, {}) });
      return;
    }

    if (path !== ADAPTER_PUBLICATION_PATH) {
      respond(response, 404, { error: { code: "not_found" } });
      return;
    }
    const verdict = verifyAdapterRequestSignature({
      body,
      headers,
      secrets: { [transportKeyId]: transportSecret },
      now: Date.now(),
    });
    if (verdict !== "VERIFIED") {
      calls.rejected.push(`publish_${verdict}`);
      respond(response, 401, { error: { code: "adapter_signature_invalid" } });
      return;
    }
    let token = "";
    try {
      token = String((JSON.parse(body) as { grant?: unknown }).grant ?? "");
    } catch {
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
      respond(response, 400, { code: "GRANT_REJECTED", reason: grant.code });
      return;
    }
    calls.publish += 1;
    if (state.publishMode === "UNKNOWN") {
      // The adapter did the work (or may have), but Core never sees the answer.
      respond(response, 504, { error: { code: "mock_response_lost" } });
      return;
    }
    respond(response, 200, {
      code: "PUBLISHED_PRIVATE",
      publicationId: grant.claims.publicationId,
      publishId: `publish-remote-${grant.claims.publicationId}`,
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("adapter-stub-not-bound");
  return Object.freeze({
    endpoint: `http://127.0.0.1:${address.port}`,
    calls,
    close: () => new Promise<void>((done) => server.close(() => done())),
  });
};

const rightsEvidence = (owner: string, tenant: string, rightsKey: string): RightsEvidenceInput => {
  const effectiveAtMs = Date.now() - 60_000;
  const base = {
    licenseKind: "OWNED" as const,
    licenseRef: "license-reconcile",
    evidenceRef: "evidence-reconcile",
    permittedUsage: ["PUBLICATION"] as const,
    platformPermissions: [{ platform: "tiktok" as const, allowed: true, usages: ["PUBLICATION"] as const }],
    effectiveAtMs,
  };
  return Object.freeze({
    ownerUid: owner,
    tenantId: tenant,
    rightsKey,
    sourceId: "source-reconcile",
    licenseKind: base.licenseKind,
    licenseRef: base.licenseRef,
    evidenceRef: base.evidenceRef,
    evidenceDigest: canonicalRightsDigest(base),
    permittedUsage: base.permittedUsage,
    platformPermissions: base.platformPermissions,
    effectiveAtMs,
  });
};

const commandFor = async (jobId: string, exportId: string, owner: string, key: string) => {
  const body = Object.freeze({
    requestVersion: TIKTOK_PUBLICATION_REQUEST_VERSION,
    operationId: `op-${key}`,
    asset: Object.freeze({
      artifactId: `asset-${key}`,
      revisionId: `rev-${key}`,
      mediaDigest: "d".repeat(64),
      mimeType: "video/mp4",
      size: 2048,
    }),
    metadata,
    metadataDigest: sha256(canonicalPublicationMetadataJson(metadata)),
    contentFormat: "TIKTOK_SHORT_VIDEO",
    coreResource: Object.freeze({ namespace: "core-export", jobId, exportId }),
    rightsKey: `rights-${owner}`,
    channelId: "channel-reconcile",
  });
  const parsed = await readTikTokPublicationRequest(new Request("http://127.0.0.1/api/v1/publications/tiktok", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), key);
  if (parsed.code !== "REQUEST_ACCEPTED") throw new Error(`request-rejected:${parsed.error}`);
  return parsed.command;
};

type Environment = Parameters<Parameters<typeof withPostgreSqlTestEnvironment>[0]>[0];

const seed = async (
  environment: Environment,
  adapterEndpoint: string,
  input: Readonly<{ owner?: string; tenant?: string; key?: string }> = {},
) => {
  const owner = input.owner ?? ownerUid;
  const tenant = input.tenant ?? tenantId;
  const key = input.key ?? "reconcile-1";
  const ownership = createDurableMediaOwnershipRepository(environment.pool);
  const rights = createRightsRegistry(environment.pool);
  const job = await ownership.createJob(owner);
  const exported = await ownership.createExport(job.id, owner, "video/mp4");
  assert.ok(exported);
  const seeded = await rights.create(rightsEvidence(owner, tenant, `rights-${owner}`));
  assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");
  const deps = {
    client: environment.pool,
    ownership,
    rights,
    adapter: {
      endpoint: adapterEndpoint,
      transportKeyId,
      transportSecret,
      grantKeyId,
      grantSigningKey: grantSecret,
    },
    tenantId: tenant,
  };
  const command = await commandFor(job.id, exported.id, owner, key);
  const executed = await executeTikTokPublication(deps, {
    ownerUid: owner,
    idempotencyKey: key,
    command,
  });
  assert.equal(executed.code, "PUBLICATION_IN_PROGRESS");
  if (executed.code !== "PUBLICATION_IN_PROGRESS") throw new Error("seed-failed");
  assert.equal(executed.outcomeUnknown, true);
  assert.equal(executed.record.state, "INTERRUPTED");
  return executed.record.id;
};

const reconcileDeps = (
  environment: Environment,
  adapterEndpoint: string,
  overrides: Record<string, unknown> = {},
) => ({
  client: environment.pool,
  adapter: {
    endpoint: adapterEndpoint,
    transportKeyId,
    transportSecret,
  },
  tenantId,
  ...overrides,
});

const attempts = async (environment: Environment, publicationId: string): Promise<string[]> => {
  const result = await environment.pool.query<{ result: string }>(
    `SELECT result FROM workflow.publication_reconciliation_attempts
      WHERE publication_id = $1 ORDER BY attempt`,
    [publicationId],
  );
  return result.rows.map((row) => row.result);
};

test("a settled adapter answer confirms OUTCOME_UNKNOWN without a second publish", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED" });
    try {
      const publicationId = await seed(environment, adapter.endpoint);
      assert.equal(adapter.calls.publish, 1);

      const first = await reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(first.code, "PUBLICATION_CONFIRMED");
      if (first.code !== "PUBLICATION_CONFIRMED") return;
      assert.equal(first.record.state, "PUBLISHED_PRIVATE");
      assert.equal(first.record.remoteVideoId, "publish-remote-1");

      const stored = await createPublicationRepository(environment.pool).get(ownerUid, publicationId);
      assert.equal(stored?.state, "PUBLISHED_PRIVATE");

      // Repeated reconciliation is a no-op on a settled row, and never reaches publish.
      const again = await reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(again.code, "PUBLICATION_NOT_RECONCILABLE");
      assert.equal(adapter.calls.publish, 1);
      assert.deepEqual(await attempts(environment, publicationId), ["CONFIRMED"]);
    } finally {
      await adapter.close();
    }
  });
});

test("processing, unknown and missing adapter records keep OUTCOME_UNKNOWN with a retry schedule", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    for (const statusMode of ["PROCESSING", "UNKNOWN", "NOT_FOUND"] as const) {
      const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode });
      try {
        const publicationId = await seed(environment, adapter.endpoint, { key: `mode-${statusMode}` });
        const result = await reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), {
          ownerUid,
          publicationId,
        });
        assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN", statusMode);
        if (result.code !== "PUBLICATION_STILL_UNKNOWN") continue;
        assert.equal(result.record.state, "INTERRUPTED", statusMode);
        assert.equal(result.adapterState, statusMode === "NOT_FOUND" ? "NOT_FOUND" : statusMode === "UNKNOWN" ? "UNKNOWN" : "PUBLISHING");
        assert.ok(result.retryAfterSeconds >= 1, statusMode);
        assert.ok(Date.parse(result.nextCheckAt) > Date.now(), statusMode);
        assert.equal(adapter.calls.publish, 1, statusMode);
        assert.deepEqual(await attempts(environment, publicationId), ["STILL_UNKNOWN"]);
      } finally {
        await adapter.close();
      }
    }
  });
});

test("an unreachable, unauthenticated or malformed adapter answer never confirms or resends", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    // Wrong transport secret: the adapter rejects Core's signature.
    const unauthorized = await startAdapter({ publishMode: "UNKNOWN", statusMode: "UNAUTHORIZED" });
    try {
      const publicationId = await seed(environment, unauthorized.endpoint, { key: "auth" });
      const result = await reconcileTikTokPublication(
        reconcileDeps(environment, unauthorized.endpoint, { adapter: {
          endpoint: unauthorized.endpoint,
          transportKeyId,
          transportSecret: "not-the-secret",
        } }),
        { ownerUid, publicationId },
      );
      assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN");
      if (result.code === "PUBLICATION_STILL_UNKNOWN") {
        assert.equal(result.adapterState, "ADAPTER_UNREACHABLE");
        assert.equal(result.record.state, "INTERRUPTED");
      }
      assert.equal(unauthorized.calls.publish, 1);
    } finally {
      await unauthorized.close();
    }

    // A stale Core clock is rejected by the adapter's timestamp window.
    const stale = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED" });
    try {
      const publicationId = await seed(environment, stale.endpoint, { key: "stale" });
      const result = await reconcileTikTokPublication(
        reconcileDeps(environment, stale.endpoint, { now: () => Date.now() - 10 * 60_000 }),
        { ownerUid, publicationId },
      );
      assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN");
      if (result.code === "PUBLICATION_STILL_UNKNOWN") assert.equal(result.adapterState, "ADAPTER_UNREACHABLE");
      assert.equal(stale.calls.publish, 1);
      const record = await createPublicationRepository(environment.pool).get(ownerUid, publicationId);
      assert.equal(record?.state, "INTERRUPTED");
    } finally {
      await stale.close();
    }

    // A contract violation (a status for another publication) is not evidence.
    const malformed = await startAdapter({ publishMode: "UNKNOWN", statusMode: "MALFORMED" });
    try {
      const publicationId = await seed(environment, malformed.endpoint, { key: "malformed" });
      const result = await reconcileTikTokPublication(reconcileDeps(environment, malformed.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN");
      assert.equal(malformed.calls.publish, 1);
    } finally {
      await malformed.close();
    }

    // Nothing listening at all.
    const closed = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED" });
    const deadEndpoint = closed.endpoint;
    await closed.close();
    const publicationId = await seed(environment, deadEndpoint, { key: "dead" });
    const result = await reconcileTikTokPublication(reconcileDeps(environment, deadEndpoint), {
      ownerUid,
      publicationId,
    });
    assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN");
    if (result.code === "PUBLICATION_STILL_UNKNOWN") assert.equal(result.adapterState, "ADAPTER_UNREACHABLE");
  });
});

test("a settled failure is recorded, while a success without a remote id is not evidence", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const failed = await startAdapter({ publishMode: "UNKNOWN", statusMode: "FAILED" });
    try {
      const publicationId = await seed(environment, failed.endpoint, { key: "failed" });
      const result = await reconcileTikTokPublication(reconcileDeps(environment, failed.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(result.code, "PUBLICATION_FAILED");
      const stored = await createPublicationRepository(environment.pool).get(ownerUid, publicationId);
      assert.equal(stored?.state, "FAILED");
      assert.equal(failed.calls.publish, 1);
    } finally {
      await failed.close();
    }

    const noRemoteId = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED_NO_REMOTE_ID" });
    try {
      const publicationId = await seed(environment, noRemoteId.endpoint, { key: "no-remote" });
      const result = await reconcileTikTokPublication(reconcileDeps(environment, noRemoteId.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN");
      if (result.code === "PUBLICATION_STILL_UNKNOWN") {
        assert.equal(result.record.state, "INTERRUPTED");
        assert.equal(result.retryAfterSeconds, 300);
      }
      assert.equal(noRemoteId.calls.publish, 1);
    } finally {
      await noRemoteId.close();
    }
  });
});

test("foreign tenants and unknown publication ids are indistinguishable and never queried", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED" });
    try {
      const foreignId = await seed(environment, adapter.endpoint, {
        key: "foreign",
        tenant: "tenant-other",
      });
      const foreign = await reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), {
        ownerUid,
        publicationId: foreignId,
      });
      assert.equal(foreign.code, "PUBLICATION_NOT_FOUND");
      assert.equal(adapter.calls.status, 0);

      const missing = await reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), {
        ownerUid,
        publicationId: "00000000-0000-4000-8000-000000000000",
      });
      assert.equal(missing.code, "PUBLICATION_NOT_FOUND");
      assert.equal(adapter.calls.status, 0);
    } finally {
      await adapter.close();
    }
  });
});

test("concurrent reconciliations converge on one confirmed publication and one publish call", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED", statusDelayMs: 150 });
    try {
      const publicationId = await seed(environment, adapter.endpoint, { key: "concurrent" });
      const [left, right] = await Promise.all([
        reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), { ownerUid, publicationId }),
        reconcileTikTokPublication(reconcileDeps(environment, adapter.endpoint), { ownerUid, publicationId }),
      ]);
      assert.equal(left.code, "PUBLICATION_CONFIRMED");
      assert.equal(right.code, "PUBLICATION_CONFIRMED");
      const stored = await createPublicationRepository(environment.pool).get(ownerUid, publicationId);
      assert.equal(stored?.state, "PUBLISHED_PRIVATE");
      assert.equal(adapter.calls.publish, 1);
      assert.equal(adapter.calls.status, 2);
    } finally {
      await adapter.close();
    }
  });
});

test("the durable status budget answers 429 with Retry-After and recovers after the window", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PROCESSING" });
    try {
      const publicationId = await seed(environment, adapter.endpoint, { key: "budget" });
      const limiter = createAdapterRateLimiter(environment.pool, { statusPerMinute: 1, publishPerMinute: 5 });

      const first = await reconcileTikTokPublication(
        reconcileDeps(environment, adapter.endpoint, { rateLimiter: limiter }),
        { ownerUid, publicationId },
      );
      assert.equal(first.code, "PUBLICATION_STILL_UNKNOWN");

      const limited = await reconcileTikTokPublication(
        reconcileDeps(environment, adapter.endpoint, { rateLimiter: limiter }),
        { ownerUid, publicationId },
      );
      assert.equal(limited.code, "PUBLICATION_RATE_LIMITED");
      if (limited.code !== "PUBLICATION_RATE_LIMITED") return;
      assert.ok(limited.retryAfterSeconds >= 1 && limited.retryAfterSeconds <= 60);
      assert.ok(Date.parse(limited.nextCheckAt) > Date.now());
      assert.equal(adapter.calls.status, 1);

      const projected = projectTikTokReconciliation(limited);
      assert.equal(projected.status, 429);
      assert.equal(projected.headers?.["retry-after"], String(limited.retryAfterSeconds));

      // Move the consumed bucket into the past: the same fixed-window rule a later
      // minute would apply, without making the test wait a real minute.
      await environment.pool.query(
        `UPDATE workflow.publication_adapter_rate_limits
            SET window_start = window_start - interval '2 minutes'
          WHERE tenant_id = $1 AND scope = 'STATUS'`,
        [tenantId],
      );
      const recovered = await reconcileTikTokPublication(
        reconcileDeps(environment, adapter.endpoint, { rateLimiter: limiter }),
        { ownerUid, publicationId },
      );
      assert.equal(recovered.code, "PUBLICATION_STILL_UNKNOWN");
      assert.equal(adapter.calls.status, 2);
      assert.equal(adapter.calls.publish, 1);
    } finally {
      await adapter.close();
    }
  });
});

test("the publish budget and the in-flight lease gate new posts, not idempotent replays", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const adapter = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PROCESSING" });
    try {
      const ownership = createDurableMediaOwnershipRepository(environment.pool);
      const rights = createRightsRegistry(environment.pool);
      const job = await ownership.createJob(ownerUid);
      const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
      assert.ok(exported);
      const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
      assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

      const limiter = createAdapterRateLimiter(environment.pool, {
        publishPerMinute: 1,
        statusPerMinute: 10,
        maxConcurrentPublishes: 2,
      });
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
        rateLimiter: limiter,
      };

      const firstCommand = await commandFor(job.id, exported.id, ownerUid, "budget-a");
      const first = await executeTikTokPublication(deps, {
        ownerUid,
        idempotencyKey: "budget-a",
        command: firstCommand,
      });
      assert.equal(first.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(adapter.calls.publish, 1);

      // A different publication is over budget: no row, no adapter call.
      const secondCommand = await commandFor(job.id, exported.id, ownerUid, "budget-b");
      const second = await executeTikTokPublication(deps, {
        ownerUid,
        idempotencyKey: "budget-b",
        command: secondCommand,
      });
      assert.equal(second.code, "PUBLICATION_RATE_LIMITED");
      if (second.code === "PUBLICATION_RATE_LIMITED") assert.ok(second.retryAfterSeconds >= 1);
      assert.equal(adapter.calls.publish, 1);
      const overBudget = await environment.pool.query(
        `SELECT id FROM workflow.publication_intents WHERE owner_uid = $1 AND idempotency_key = 'budget-b'`,
        [ownerUid],
      );
      assert.equal(overBudget.rows.length, 0);

      // Replaying the stored key is still answered from the row: the budget never
      // turns an idempotent retry into a 429.
      const replay = await executeTikTokPublication(deps, {
        ownerUid,
        idempotencyKey: "budget-a",
        command: firstCommand,
      });
      assert.equal(replay.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(adapter.calls.publish, 1);

      // A lease held by another in-flight publication blocks new posts.
      const leaseLimiter = createAdapterRateLimiter(environment.pool, {
        publishPerMinute: 10,
        maxConcurrentPublishes: 1,
        leaseSeconds: 60,
      });
      await leaseLimiter.acquireLease(tenantId, "held-elsewhere");
      const thirdCommand = await commandFor(job.id, exported.id, ownerUid, "budget-c");
      const blocked = await executeTikTokPublication({ ...deps, rateLimiter: leaseLimiter }, {
        ownerUid,
        idempotencyKey: "budget-c",
        command: thirdCommand,
      });
      assert.equal(blocked.code, "PUBLICATION_RATE_LIMITED");
      assert.equal(adapter.calls.publish, 1);

      await leaseLimiter.releaseLease(tenantId, "held-elsewhere");
      const fourthCommand = await commandFor(job.id, exported.id, ownerUid, "budget-d");
      const allowed = await executeTikTokPublication({ ...deps, rateLimiter: leaseLimiter }, {
        ownerUid,
        idempotencyKey: "budget-d",
        command: fourthCommand,
      });
      assert.equal(allowed.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(adapter.calls.publish, 2);
    } finally {
      await adapter.close();
    }
  });
});

test("repeated reconciliation across a Core restart and an adapter restart never publishes twice", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const first = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PROCESSING" });
    let publicationId: string;
    try {
      publicationId = await seed(environment, first.endpoint, { key: "restart-chain" });
      // Several rounds while the adapter still reports PROCESSING: each one stays UNKNOWN.
      for (let round = 0; round < 3; round += 1) {
        const result = await reconcileTikTokPublication(reconcileDeps(environment, first.endpoint), {
          ownerUid,
          publicationId,
        });
        assert.equal(result.code, "PUBLICATION_STILL_UNKNOWN", `round ${round}`);
      }
      assert.equal(first.calls.publish, 1);
    } finally {
      await first.close();
    }

    // Adapter restarts with no memory of the publication; reconciliation must not publish.
    const restarted = await startAdapter({ publishMode: "UNKNOWN", statusMode: "NOT_FOUND" });
    try {
      const notFound = await reconcileTikTokPublication(reconcileDeps(environment, restarted.endpoint), {
        ownerUid,
        publicationId,
      });
      assert.equal(notFound.code, "PUBLICATION_STILL_UNKNOWN");
      assert.equal(restarted.calls.publish, 0, "reconciliation after an adapter restart never publishes");
    } finally {
      await restarted.close();
    }

    // Core restarts: a fresh pool on the same database, then the adapter settles the outcome.
    const settled = await startAdapter({ publishMode: "UNKNOWN", statusMode: "PUBLISHED" });
    const coreRestartedPool = environment.pool;
    try {
      const confirmed = await reconcileTikTokPublication(
        reconcileDeps(environment, settled.endpoint, { client: coreRestartedPool }),
        { ownerUid, publicationId },
      );
      assert.equal(confirmed.code, "PUBLICATION_CONFIRMED");
      assert.equal(settled.calls.publish, 0, "confirmation never publishes");
      const stored = await createPublicationRepository(environment.pool).get(ownerUid, publicationId);
      assert.equal(stored?.state, "PUBLISHED_PRIVATE");
      assert.deepEqual(await attempts(environment, publicationId), [
        "STILL_UNKNOWN",
        "STILL_UNKNOWN",
        "STILL_UNKNOWN",
        "STILL_UNKNOWN",
        "CONFIRMED",
      ]);
    } finally {
      await settled.close();
    }
  });
});
