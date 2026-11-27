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

const startAdapterProcess = async (observationUrl: string): Promise<{
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

const startCoreObservationServer = async (pool: Parameters<typeof applyAdapterObservation>[0]) => {
  const applied: string[] = [];
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
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
};

const adapterStats = async (port: number): Promise<{ dispatches: number; publisherCalls: number; observations: number }> => {
  const response = await fetch(`http://127.0.0.1:${port}/stats`);
  return (await response.json()) as { dispatches: number; publisherCalls: number; observations: number };
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
