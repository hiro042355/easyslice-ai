import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
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
} from "../../lib/publicationIntegration/adapterTransport";
import { applyAdapterObservation } from "../../lib/tiktokPublication/observationApplication";
import { readTikTokObservationReport } from "../../lib/tiktokPublication/observationBoundary";
import { executeTikTokPublication } from "../../lib/tiktokPublication/execution";
import { reconcileTikTokPublication } from "../../lib/tiktokPublication/reconciliation";
import {
  readTikTokPublicationRequest,
  TIKTOK_PUBLICATION_REQUEST_VERSION,
} from "../../lib/tiktokPublication/requestBoundary";

/**
 * Two-process loopback integration.
 *
 * The adapter is a real, separate Node process running the repository's own
 * `PublicationRequestEndpoint` and `TikTokPublicationService` against in-memory
 * ports and a mock TikTok publisher. Core talks to it over a real loopback socket,
 * and Core's observation endpoint is a real HTTP server in this process that
 * verifies the adapter's signature and writes the durable PostgreSQL row.
 *
 * Nothing here contacts TikTok: the publisher is a deterministic mock.
 */
const adapterRepo = process.env.NEXCUT_TIKTOK_ADAPTER_REPO
  ?? resolve(process.cwd(), "..", "inspect-tiktok-publisher");

const transportKeyId = "loopback-transport-1";
const transportSecret = "loopback-transport-secret";
const grantKeyId = "loopback-grant-1";
const grantSecret = "loopback-grant-secret";

const metadata: PublicationMetadataDeclaration = Object.freeze({
  title: "Loopback TikTok publication",
  description: "two-process integration",
  tags: Object.freeze(["loopback"]),
  subtitleRefs: Object.freeze([]),
  contentFormat: "TIKTOK_SHORT_VIDEO",
});

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

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
      mediaDigest: "c".repeat(64),
      mimeType: "video/mp4",
      size: 4096,
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

const startAdapterProcess = async (
  observationUrl: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<{
  port: number;
  child: ChildProcessWithoutNullStreams;
  stop: () => Promise<void>;
}> => {
  // A shell is required to launch npx on Windows; `stop` kills the whole process
  // tree with taskkill so the wrapper cannot keep this test alive.
  const child = spawn("npx", ["tsx", "scripts/tiktok-publication-loopback-server.ts"], {
    cwd: adapterRepo,
    shell: true,
    env: {
      ...process.env,
      PORT: "0",
      TRANSPORT_KEY_ID: transportKeyId,
      TRANSPORT_SECRET: transportSecret,
      GRANT_KEY_ID: grantKeyId,
      GRANT_SIGNING_KEY: grantSecret,
      CORE_OBSERVATION_URL: observationUrl,
      ...extraEnv,
    },
  }) as ChildProcessWithoutNullStreams;

  const killTree = (): void => {
    if (child.exitCode !== null) return;
    if (process.platform === "win32" && child.pid !== undefined) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  };

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    let buffer = "";
    const timer = setTimeout(() => {
      killTree();
      rejectPort(new Error(`adapter did not listen: ${buffer.slice(-2000)}`));
    }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = /LISTENING (\d+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      rejectPort(new Error(`adapter exited with ${code}: ${buffer.slice(-2000)}`));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPort(new Error(`adapter failed to start: ${error.message}`));
    });
  });

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null) return;
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      killTree();
      setTimeout(done, 10_000);
    });
    child.stdout.destroy();
    child.stderr.destroy();
    child.stdin.destroy();
  };

  return { port, child, stop };
};

const startCoreObservationServer = async (
  pool: Parameters<typeof applyAdapterObservation>[0],
  options: Readonly<{ reject?: (observation: string) => boolean }> = {},
) => {
  const applied: string[] = [];
  const rejected: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) {
          headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
        }
        const verdict = verifyAdapterObservationSignature({
          body,
          headers,
          secrets: { [transportKeyId]: transportSecret },
        });
        if (verdict !== "VERIFIED") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: verdict === "STALE" ? "adapter_request_stale" : "adapter_signature_invalid" } }));
          return;
        }
        const boundary = await readTikTokObservationReport({
          headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
          text: async () => body,
        });
        if (boundary.code !== "REPORT_ACCEPTED") {
          response.writeHead(boundary.status, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: boundary.error } }));
          return;
        }
        if (options.reject?.(boundary.report.observation)) {
          // Test-only fault injection: Core loses this observation, so the durable row
          // never learns the outcome the adapter already knows.
          rejected.push(boundary.report.observation);
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: "publication_not_found" } }));
          return;
        }
        applied.push(boundary.report.observation);
        const outcome = await applyAdapterObservation(pool, boundary.report);
        if (outcome.code === "REJECTED") {
          response.writeHead(outcome.status, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: outcome.error } }));
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          code: outcome.code,
          publicationId: outcome.record.id,
          state: outcome.record.state,
          revision: outcome.record.revision,
        }));
      })();
    });
  });

  const port = await new Promise<number>((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      done(typeof address === "object" && address ? address.port : 0);
    });
  });

  return {
    url: `http://127.0.0.1:${port}${ADAPTER_OBSERVATION_PATH}`,
    applied,
    rejected,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
};

const adapterStats = async (port: number): Promise<{
  dispatches: number;
  publisherCalls: number;
  observations: number;
  statusCalls: number;
  publicationsCreated: number;
}> => {
  const response = await fetch(`http://127.0.0.1:${port}/stats`);
  return (await response.json()) as {
    dispatches: number;
    publisherCalls: number;
    observations: number;
    statusCalls: number;
    publicationsCreated: number;
  };
};

test("Core and the adapter run as separate processes over a signed loopback socket", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-two-process";
    const tenantId = "local-tenant";
    const ownership = createDurableMediaOwnershipRepository(environment.pool);
    const rights = createRightsRegistry(environment.pool);
    const job = await ownership.createJob(ownerUid);
    const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
    assert.ok(exported);
    const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
    assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

    const core = await startCoreObservationServer(environment.pool);
    let adapter = await startAdapterProcess(core.url);
    const depsFor = (port: number) => ({
      client: environment.pool,
      ownership,
      rights,
      adapter: {
        endpoint: `http://127.0.0.1:${port}`,
        transportKeyId,
        transportSecret,
        grantKeyId,
        grantSigningKey: grantSecret,
      },
      tenantId,
    });

    try {
      // 1. Core -> real adapter process -> mock TikTok -> signed observation -> Core DB.
      const command = await commandFor(job.id, exported.id, ownerUid, "two-1");
      const published = await executeTikTokPublication(depsFor(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-two-1",
        command,
      });
      assert.equal(published.code, "PUBLICATION_CONFIRMED");
      if (published.code !== "PUBLICATION_CONFIRMED") return;
      assert.equal(published.record.state, "PUBLISHED_PRIVATE");
      assert.equal(published.record.transportKind, "REAL_TIKTOK");
      assert.equal(published.record.remoteVideoId, `mock-publish-${published.record.id}`);

      const stored = await createPublicationRepository(environment.pool).get(ownerUid, published.record.id);
      assert.equal(stored?.state, "PUBLISHED_PRIVATE");
      assert.equal(stored?.receipt?.verification, "VERIFIED");

      const afterPublish = await adapterStats(adapter.port);
      assert.equal(afterPublish.publisherCalls, 1);
      assert.ok(afterPublish.observations >= 2, "adapter reported its progress to Core");
      assert.ok(core.applied.includes("DISPATCH_ACCEPTED") || core.applied.includes("UPLOAD_STARTED"));
      assert.ok(core.applied.includes("PUBLISH_PRIVATE_CONFIRMED"));

      // 2. Replaying the same Core request must not reach the adapter at all.
      const replay = await executeTikTokPublication(depsFor(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-two-1",
        command,
      });
      assert.equal(replay.code, "PUBLICATION_CONFIRMED");
      assert.equal(replay.code === "PUBLICATION_CONFIRMED" ? replay.record.id : "", published.record.id);
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1);

      // 3. Transport rules hold against the real process.
      const rawBody = JSON.stringify({ grant: "not-a-real-grant" });
      const post = async (timestamp: number, secret: string) => {
        const mac = createHmac("sha256", secret)
          .update(adapterSignatureMessage(ADAPTER_PUBLICATION_PATH, rawBody, timestamp))
          .digest("base64url");
        return fetch(`http://127.0.0.1:${adapter.port}${ADAPTER_PUBLICATION_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-nexcut-transport-key-id": transportKeyId,
            "x-nexcut-transport-timestamp": String(timestamp),
            "x-nexcut-transport-signature": mac,
          },
          body: rawBody,
        });
      };
      const now = Date.now();
      const badSignature = await post(now, "wrong-secret");
      assert.equal(badSignature.status, 401);
      const stale = await post(now - 10 * 60_000, transportSecret);
      assert.equal(stale.status, 401);
      assert.equal(((await stale.json()) as { error: { code: string } }).error.code, "stale_request");
      const firstSigned = await post(now, transportSecret);
      assert.equal(firstSigned.status, 200);
      assert.equal(((await firstSigned.json()) as { code: string }).code, "GRANT_REJECTED");
      const replayed = await post(now, transportSecret);
      assert.equal(replayed.status, 409);
      assert.equal(((await replayed.json()) as { error: { code: string } }).error.code, "replay_rejected");

      // 4. Adapter restart: Core still restores the stored result, and a new
      //    publication succeeds against the restarted process.
      await adapter.stop();
      adapter = await startAdapterProcess(core.url);
      const restored = await createPublicationRepository(environment.pool).get(ownerUid, published.record.id);
      assert.equal(restored?.state, "PUBLISHED_PRIVATE");
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 0);

      const secondCommand = await commandFor(job.id, exported.id, ownerUid, "two-2");
      const second = await executeTikTokPublication(depsFor(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-two-2",
        command: secondCommand,
      });
      assert.equal(second.code, "PUBLICATION_CONFIRMED");
      assert.notEqual(second.code === "PUBLICATION_CONFIRMED" ? second.record.id : "", published.record.id);
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1);
    } finally {
      await adapter.stop();
      await core.close();
    }
  });
});

/**
 * Recovery over real processes.
 *
 * The adapter publishes, Core loses the confirmation observation, so the durable
 * row stays OUTCOME_UNKNOWN (INTERRUPTED). Reconciling against the same adapter
 * must settle the row from the adapter's ledger without asking TikTok to publish
 * again. After an adapter restart its in-memory ledger is empty: the answer is
 * "no record", which is not evidence of absence, so Core keeps OUTCOME_UNKNOWN.
 */
test("a lost Core observation is reconciled against the real adapter without republishing", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-reconcile-two-process";
    const tenantId = "local-tenant";
    const ownership = createDurableMediaOwnershipRepository(environment.pool);
    const rights = createRightsRegistry(environment.pool);
    const job = await ownership.createJob(ownerUid);
    const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
    assert.ok(exported);
    const seeded = await rights.create(rightsEvidence(ownerUid, tenantId, `rights-${ownerUid}`));
    assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");

    const core = await startCoreObservationServer(environment.pool, {
      // Core drops the one observation that carries the settled provider outcome.
      reject: (observation) => observation === "PUBLISH_PRIVATE_CONFIRMED",
    });
    const lostResponseEnv = { MOCK_PUBLISH_MODE: "RESPONSE_LOST", MOCK_STATUS_MODE: "PUBLISHED" } as const;
    let adapter = await startAdapterProcess(core.url, lostResponseEnv);

    const publishDepsFor = (port: number) => ({
      client: environment.pool,
      ownership,
      rights,
      adapter: {
        endpoint: `http://127.0.0.1:${port}`,
        transportKeyId,
        transportSecret,
        grantKeyId,
        grantSigningKey: grantSecret,
      },
      tenantId,
    });
    const reconcileDepsFor = (port: number) => ({
      client: environment.pool,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret },
      tenantId,
    });

    try {
      // 1. The adapter does the work, Core never records the result.
      const command = await commandFor(job.id, exported.id, ownerUid, "reconcile-1");
      const lost = await executeTikTokPublication(publishDepsFor(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-reconcile-1",
        command,
      });
      assert.equal(lost.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(lost.code === "PUBLICATION_IN_PROGRESS" ? lost.record.state : "", "INTERRUPTED");
      const publicationId = lost.record.id;
      assert.ok(core.rejected.includes("PUBLISH_PRIVATE_CONFIRMED"));
      const afterLoss = await adapterStats(adapter.port);
      assert.equal(afterLoss.publisherCalls, 1);
      assert.equal(afterLoss.dispatches, 1);

      // 2. Reconciliation reads the adapter ledger and settles the row; nothing is republished.
      const confirmed = await reconcileTikTokPublication(reconcileDepsFor(adapter.port), { ownerUid, publicationId });
      assert.equal(confirmed.code, "PUBLICATION_CONFIRMED");
      if (confirmed.code !== "PUBLICATION_CONFIRMED") return;
      assert.equal(confirmed.record.state, "PUBLISHED_PRIVATE");
      assert.equal(confirmed.record.remoteVideoId, `mock-publish-${publicationId}`);
      const afterReconcile = await adapterStats(adapter.port);
      assert.equal(afterReconcile.publisherCalls, 1, "reconciliation never publishes");
      assert.equal(afterReconcile.dispatches, 1);
      assert.equal(afterReconcile.statusCalls, 1);

      // 3. Repeating it after the row settled touches neither the adapter nor TikTok.
      const repeated = await reconcileTikTokPublication(reconcileDepsFor(adapter.port), { ownerUid, publicationId });
      assert.equal(repeated.code, "PUBLICATION_NOT_RECONCILABLE");
      assert.equal(repeated.code === "PUBLICATION_NOT_RECONCILABLE" ? repeated.record.state : "", "PUBLISHED_PRIVATE");
      const stillOne = await adapterStats(adapter.port);
      assert.equal(stillOne.publisherCalls, 1);
      assert.equal(stillOne.dispatches, 1);
      assert.equal(stillOne.statusCalls, 1, "a settled row is not re-queried");

      // 4. A second publication is left unknown, then the adapter restarts and forgets its ledger.
      const secondCommand = await commandFor(job.id, exported.id, ownerUid, "reconcile-2");
      const secondLost = await executeTikTokPublication(publishDepsFor(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-reconcile-2",
        command: secondCommand,
      });
      assert.equal(secondLost.code, "PUBLICATION_IN_PROGRESS");
      const secondId = secondLost.record.id;
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 2);

      await adapter.stop();
      adapter = await startAdapterProcess(core.url, lostResponseEnv);
      const afterRestart = await adapterStats(adapter.port);
      assert.equal(afterRestart.publisherCalls, 0);

      const unknown = await reconcileTikTokPublication(reconcileDepsFor(adapter.port), {
        ownerUid,
        publicationId: secondId,
      });
      assert.equal(unknown.code, "PUBLICATION_STILL_UNKNOWN");
      assert.equal(unknown.code === "PUBLICATION_STILL_UNKNOWN" ? unknown.adapterState : "", "NOT_FOUND");
      assert.ok(unknown.code === "PUBLICATION_STILL_UNKNOWN" && unknown.retryAfterSeconds > 0);

      const stored = await createPublicationRepository(environment.pool).get(ownerUid, secondId);
      assert.equal(stored?.state, "INTERRUPTED", "missing adapter evidence never resets to queued");
      const afterUnknown = await adapterStats(adapter.port);
      assert.equal(afterUnknown.publisherCalls, 0, "no publication was started by reconciliation");
      assert.equal(afterUnknown.dispatches, 0);
    } finally {
      await adapter.stop();
      await core.close();
    }
  });
});

/**
 * Double-post proof.
 *
 * The count that matters is Mock TikTok's publication creations (`publicationsCreated`),
 * not HTTP requests. A creation is counted once per publication id in each adapter
 * process; creations are summed across adapter restarts, so a restart that clears the
 * in-memory ledger cannot hide a second creation. Every scenario below must end with
 * exactly one creation per publication and zero automatic resends.
 */
type DoublePostHarness = {
  readonly created: () => Promise<number>;
  readonly retire: (adapter: { port: number; stop: () => Promise<void> }) => Promise<void>;
  readonly retireByKill: (adapter: { port: number; child: ChildProcessWithoutNullStreams; stop: () => Promise<void> }) => Promise<void>;
};

const doublePostHarness = (): DoublePostHarness => {
  let retired = 0;
  return {
    created: async () => retired,
    retire: async (adapter) => {
      retired += (await adapterStats(adapter.port)).publicationsCreated;
      await adapter.stop();
    },
    // Reads Mock creations first, then force-kills the process tree without a graceful
    // shutdown. taskkill /F on Windows, SIGKILL elsewhere.
    retireByKill: async (adapter) => {
      retired += (await adapterStats(adapter.port)).publicationsCreated;
      const pid = adapter.child.pid;
      if (process.platform === "win32" && pid !== undefined) {
        await new Promise<void>((done) => {
          const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
          killer.once("exit", () => done());
        });
      } else {
        adapter.child.kill("SIGKILL");
      }
      await adapter.stop();
    },
  };
};

const doublePostSetup = async (environment: { pool: Parameters<typeof applyAdapterObservation>[0] }, ownerUid: string) => {
  const ownership = createDurableMediaOwnershipRepository(environment.pool as never);
  const rights = createRightsRegistry(environment.pool as never);
  const job = await ownership.createJob(ownerUid);
  const exported = await ownership.createExport(job.id, ownerUid, "video/mp4");
  assert.ok(exported);
  const seeded = await rights.create(rightsEvidence(ownerUid, "local-tenant", `rights-${ownerUid}`));
  assert.ok(seeded.code === "APPLIED" || seeded.code === "CONFLICT");
  return { ownership, rights, job, exported };
};

test("double-post: Core restart, adapter restart, observation loss, timeout and status loss never create a second TikTok publication", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-double-post-restarts";
    const { ownership, rights, job, exported } = await doublePostSetup(environment as never, ownerUid);
    const repo = createPublicationRepository(environment.pool as never);
    const harness = doublePostHarness();
    const adapterDeps = (port: number, client: typeof environment.pool) => ({
      client,
      ownership,
      rights,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret, grantKeyId, grantSigningKey: grantSecret },
      tenantId: "local-tenant",
    });
    const reconcileDeps = (port: number, client: typeof environment.pool) => ({
      client,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret },
      tenantId: "local-tenant",
    });

    // Observation loss plus a lost publish response: the adapter creates, Core records nothing.
    let core = await startCoreObservationServer(environment.pool as never, {
      reject: (observation) => observation === "PUBLISH_PRIVATE_CONFIRMED",
    });
    let adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "RESPONSE_LOST", MOCK_STATUS_MODE: "PUBLISHED" });
    let publicationId = "";
    try {
      const command = await commandFor(job.id, exported.id, ownerUid, "dp-1");
      const first = await executeTikTokPublication(adapterDeps(adapter.port, environment.pool as never), {
        ownerUid,
        idempotencyKey: "idem-dp-1",
        command,
      });
      assert.equal(first.code, "PUBLICATION_IN_PROGRESS");
      publicationId = first.record.id;
      assert.equal((await adapterStats(adapter.port)).publicationsCreated, 1, "TikTok created the post once");

      // Core restart: a brand-new observation server on the same database.
      core.close();
      core = await startCoreObservationServer(environment.pool as never, {
        reject: (observation) => observation === "PUBLISH_PRIVATE_CONFIRMED",
      });

      // The same idempotency key after the Core restart must not reach the adapter.
      const replay = await executeTikTokPublication(adapterDeps(adapter.port, environment.pool as never), {
        ownerUid,
        idempotencyKey: "idem-dp-1",
        command,
      });
      assert.equal(replay.code, "PUBLICATION_IN_PROGRESS");
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1);

      // Repeated reconciliation: the answer is settled from the ledger each time, never by a publish.
      for (let pass = 0; pass < 3; pass += 1) {
        await reconcileTikTokPublication(reconcileDeps(adapter.port, environment.pool as never), { ownerUid, publicationId });
      }
      const settled = await repo.get(ownerUid, publicationId);
      assert.equal(settled?.state, "PUBLISHED_PRIVATE");
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1);

      // Adapter restart: the in-memory ledger is gone. Core still holds the settled row and
      // must not resend, and the restarted adapter must create nothing.
      await harness.retire(adapter);
      adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "SUCCESS", MOCK_STATUS_MODE: "PUBLISHED" });
      const afterRestart = await executeTikTokPublication(adapterDeps(adapter.port, environment.pool as never), {
        ownerUid,
        idempotencyKey: "idem-dp-1",
        command,
      });
      assert.equal(afterRestart.code, "PUBLICATION_CONFIRMED");
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 0);
      assert.equal((await adapterStats(adapter.port)).publicationsCreated, 0);

      assert.equal(await harness.created(), 1, "exactly one publication was created across Core and adapter restarts");
    } finally {
      await harness.retire(adapter).catch(() => undefined);
      core.close();
    }
  });
});

test("process kill: a force-killed adapter after publishing never produces a second TikTok publication", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-process-kill-adapter";
    const { ownership, rights, job, exported } = await doublePostSetup(environment as never, ownerUid);
    const repo = createPublicationRepository(environment.pool as never);
    const harness = doublePostHarness();
    const reconcileDeps = (port: number) => ({
      client: environment.pool as never,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret },
      tenantId: "local-tenant",
    });
    const publishDeps = (port: number) => ({
      client: environment.pool as never,
      ownership,
      rights,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret, grantKeyId, grantSigningKey: grantSecret },
      tenantId: "local-tenant",
    });
    // Core never receives the adapter's observation, so the publication stays unknown to Core.
    const core = await startCoreObservationServer(environment.pool as never, {
      reject: (observation) => observation === "PUBLISH_PRIVATE_CONFIRMED",
    });
    // The adapter creates the TikTok publication, then its response is lost: Core never learns the outcome.
    let adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "RESPONSE_LOST", MOCK_STATUS_MODE: "PUBLISHED" });
    try {
      const command = await commandFor(job.id, exported.id, ownerUid, "pk-adapter");
      const first = await executeTikTokPublication(publishDeps(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-pk-adapter",
        command,
      });
      assert.equal(first.code, "PUBLICATION_IN_PROGRESS");
      const publicationId = first.code === "PUBLICATION_IN_PROGRESS" ? first.record.id : "";
      assert.equal((await adapterStats(adapter.port)).publicationsCreated, 1, "Mock TikTok created the post before the kill");

      // Hard kill of the adapter process (no graceful shutdown). Its counter is read first and carried into the total.
      await harness.retireByKill(adapter);
      adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "SUCCESS", MOCK_STATUS_MODE: "PUBLISHED" });

      // The restarted adapter has no ledger entry: reconciliation must not confirm, resend or create.
      const reconciled = await reconcileTikTokPublication(reconcileDeps(adapter.port), { ownerUid, publicationId });
      assert.notEqual(reconciled.code, "PUBLICATION_CONFIRMED", "no ledger record is not proof of a post");
      assert.notEqual((await repo.get(ownerUid, publicationId))?.state, "PUBLISHED_PRIVATE");
      const after = await adapterStats(adapter.port);
      assert.equal(after.publisherCalls, 0, "reconciliation never reaches the publisher");
      assert.equal(after.publicationsCreated, 0, "the restarted adapter created nothing");

      assert.equal(await harness.created(), 1, "exactly one TikTok publication across the adapter kill and restart");
    } finally {
      await adapter.stop();
      await core.close();
    }
  });
});

test("double-post: an HTTP timeout leaves OUTCOME_UNKNOWN, which never auto-reposts", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-double-post-timeout";
    const { ownership, rights, job, exported } = await doublePostSetup(environment as never, ownerUid);
    const harness = doublePostHarness();
    const deps = (port: number) => ({
      client: environment.pool as never,
      ownership,
      rights,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret, grantKeyId, grantSigningKey: grantSecret },
      tenantId: "local-tenant",
    });
    const core = await startCoreObservationServer(environment.pool as never);
    // The mock creates the post, then the socket is reset before the answer returns.
    const adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "UNKNOWN_OUTCOME", MOCK_STATUS_MODE: "PUBLISHED" });
    try {
      const command = await commandFor(job.id, exported.id, ownerUid, "dp-timeout");
      const timedOut = await executeTikTokPublication(deps(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-dp-timeout",
        command,
      });
      assert.notEqual(timedOut.code, "PUBLICATION_CONFIRMED", "a timeout is never recorded as success");
      assert.equal(timedOut.code === "PUBLICATION_IN_PROGRESS" ? timedOut.outcomeUnknown : false, true);
      assert.equal(timedOut.code, "PUBLICATION_IN_PROGRESS");
      const publicationId = timedOut.code === "PUBLICATION_IN_PROGRESS" ? timedOut.record.id : "";
      const publishCallsAfterTimeout = (await adapterStats(adapter.port)).publisherCalls;

      // Retrying the same request while the row is UNKNOWN must not reach the publisher again.
      const retry = await executeTikTokPublication(deps(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-dp-timeout",
        command,
      });
      assert.equal(retry.code, "PUBLICATION_IN_PROGRESS");
      assert.equal((await adapterStats(adapter.port)).publisherCalls, publishCallsAfterTimeout);

      const reconciled = await reconcileTikTokPublication(
        { client: environment.pool as never, adapter: { endpoint: `http://127.0.0.1:${adapter.port}`, transportKeyId, transportSecret }, tenantId: "local-tenant" },
        { ownerUid, publicationId },
      );
      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1, "reconciliation never publishes");
      // The adapter ledger recorded the reset as UNKNOWN, so reconciliation must not invent a confirmation.
      assert.notEqual(reconciled.code, "PUBLICATION_CONFIRMED", "an UNKNOWN ledger entry is not confirmed by reconciliation");

      await harness.retire(adapter);
      assert.equal(await harness.created(), 1, "TikTok created exactly one post for the timed-out request");
    } finally {
      await adapter.stop();
      await core.close();
    }
  });
});

test("double-post: status loss keeps the row UNKNOWN and repeated or concurrent reconciliation never creates a second post", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const ownerUid = "owner-double-post-status";
    const { ownership, rights, job, exported } = await doublePostSetup(environment as never, ownerUid);
    const harness = doublePostHarness();
    const deps = (port: number) => ({
      client: environment.pool as never,
      ownership,
      rights,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret, grantKeyId, grantSigningKey: grantSecret },
      tenantId: "local-tenant",
    });
    const reconcileDeps = (port: number) => ({
      client: environment.pool as never,
      adapter: { endpoint: `http://127.0.0.1:${port}`, transportKeyId, transportSecret },
      tenantId: "local-tenant",
    });
    const core = await startCoreObservationServer(environment.pool as never, {
      reject: (observation) => observation === "PUBLISH_PRIVATE_CONFIRMED",
    });
    // The status endpoint fails, so the adapter's answer is lost to Core during reconciliation.
    const adapter = await startAdapterProcess(core.url, { MOCK_PUBLISH_MODE: "RESPONSE_LOST", MOCK_STATUS_MODE: "ERROR" });
    try {
      const command = await commandFor(job.id, exported.id, ownerUid, "dp-status");
      const lost = await executeTikTokPublication(deps(adapter.port), {
        ownerUid,
        idempotencyKey: "idem-dp-status",
        command,
      });
      assert.equal(lost.code, "PUBLICATION_IN_PROGRESS");
      const publicationId = lost.record.id;

      const statusLost = await reconcileTikTokPublication(reconcileDeps(adapter.port), { ownerUid, publicationId });
      assert.notEqual(statusLost.code, "PUBLICATION_CONFIRMED", "a failed status answer never confirms");
      const stillUnknown = await createPublicationRepository(environment.pool as never).get(ownerUid, publicationId);
      assert.equal(stillUnknown?.state, "INTERRUPTED");

      // Concurrent reconciliations against the same row: they may settle or defer, but none publishes.
      const burst = await Promise.allSettled(
        Array.from({ length: 5 }, () => reconcileTikTokPublication(reconcileDeps(adapter.port), { ownerUid, publicationId })),
      );
      for (const outcome of burst) {
        assert.equal(outcome.status, "fulfilled", "each concurrent reconciliation settles without throwing");
        if (outcome.status === "fulfilled") assert.notEqual(outcome.value.code, "PUBLICATION_CONFIRMED", "a failed status answer never confirms");
      }

      assert.equal((await adapterStats(adapter.port)).publisherCalls, 1, "reconciliation never publishes");
      await harness.retire(adapter);
      assert.equal(await harness.created(), 1, "exactly one TikTok publication across status loss and a concurrent reconciliation burst");
    } finally {
      await adapter.stop();
      await core.close();
    }
  });
});
