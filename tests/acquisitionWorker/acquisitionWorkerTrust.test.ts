import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ACQUISITION_WORKER_AUTH_FAILURES,
  AcquisitionWorkerTrustFailure,
  createAcquisitionWorkerTrustClient,
  readAcquisitionWorkerTrustConfiguration,
} from "../../lib/server/acquisitionWorkerTrust/client";

const environment = Object.freeze({
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  GCP_ACQUISITION_WIF_SERVICE_ACCOUNT: "nexcut-prod-acq-invoker@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  ACQUISITION_WORKER_URL: "https://nexcut-prod-acquisition-worker-bfqspeoqrq-an.a.run.app",
});

test("configuration fixes the Production WIF, invoker, Worker destination, and canonical audience", () => {
  assert.deepEqual(readAcquisitionWorkerTrustConfiguration(environment), {
    projectId: environment.GCP_PROJECT_ID,
    providerResource: environment.GCP_WIF_PROVIDER_RESOURCE,
    invokerServiceAccount: environment.GCP_ACQUISITION_WIF_SERVICE_ACCOUNT,
    workerUrl: environment.ACQUISITION_WORKER_URL,
  });
  for (const [name, value] of Object.entries(environment)) {
    assert.throws(() => readAcquisitionWorkerTrustConfiguration({ ...environment, [name]: `${value}-other` }), /worker-auth-config-invalid/);
  }
});

test("correct, wrong, and unauthenticated proof uses fixed destinations and returns no token", async () => {
  const configuration = readAcquisitionWorkerTrustConfiguration(environment);
  const audiences: string[] = [];
  const requests: Array<{ input: string; authorization?: string }> = [];
  const logs: unknown[] = [];
  let now = 0;
  const client = createAcquisitionWorkerTrustClient(configuration, {
    async getIdToken(audience) { audiences.push(audience); return `opaque-${audiences.length}`; },
    async fetch(input, init) {
      const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
      requests.push({ input, authorization });
      if (authorization === "Bearer opaque-1") return Response.json({ ready: true }, { status: 200 });
      return new Response(null, { status: 404 });
    },
    log(entry) { logs.push(entry); },
    now() { now += 25; return now; },
  });
  const result = await client.verify();
  assert.equal(audiences[0], configuration.workerUrl);
  assert.equal(audiences[1], "https://invalid-audience.nexcut.invalid");
  assert.equal(requests.every((request) => request.input === `${configuration.workerUrl}/readyz`), true);
  assert.equal(requests[2]?.authorization, undefined);
  assert.deepEqual(result.correctAudience, { tokenObtained: true, httpStatus: 200, audienceMatch: true, workerReady: true, invokerIdentityMatch: true });
  assert.equal(result.wrongAudience.rejected, true);
  assert.equal(result.unauthenticated.rejected, true);
  const publicEvidence = JSON.stringify({ result, logs });
  assert.doesNotMatch(publicEvidence, /opaque-|authorization|oidc|access.token|id.token/i);
});

test("safe failures distinguish rejection, unavailability, and timeout without raw errors", async () => {
  const configuration = readAcquisitionWorkerTrustConfiguration(environment);
  const base = { getIdToken: async () => "opaque", log() {}, now: () => 0 } as const;
  await assert.rejects(createAcquisitionWorkerTrustClient(configuration, {
    ...base,
    fetch: async () => new Response(null, { status: 403 }),
  }).verify(), (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-auth-rejected");
  await assert.rejects(createAcquisitionWorkerTrustClient(configuration, {
    ...base,
    fetch: async () => { throw new Error("private-details"); },
  }).verify(), (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-unavailable" && !error.message.includes("private-details"));
  assert.deepEqual(ACQUISITION_WORKER_AUTH_FAILURES, [
    "worker-auth-config-invalid", "worker-federation-failed", "worker-token-exchange-failed", "worker-impersonation-failed",
    "worker-id-token-failed", "worker-auth-rejected", "worker-unavailable", "worker-timeout", "worker-invalid-response",
  ]);
});

test("reusable trust client remains server-only and normal Production flows stay disconnected", () => {
  const client = readFileSync("lib/server/acquisitionWorkerTrust/client.ts", "utf8");
  const composition = readFileSync("lib/server/acquisitionWorkerTrust/composition.ts", "utf8");
  const ingestion = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.match(composition, /^import "server-only";/);
  assert.equal(existsSync("app/api/internal/acquisition-worker-trust/route.ts"), false);
  assert.match(client, /\/readyz/);
  assert.doesNotMatch(`${client}\n${composition}`, /NEXT_PUBLIC_|storageKey|ownerUid|DATABASE_URL|console\.(?:error|warn)/);
  assert.doesNotMatch(`${ingestion}\n${workspace}\n${aiMv}`, /acquisitionWorkerTrust|verifyProductionAcquisitionWorkerTrust/);
});

test("Terraform trust remains Production-only and least privilege", () => {
  const wif = readFileSync("infra/production/gcp/vercel-wif.tf", "utf8");
  const service = readFileSync("infra/production/gcp/acquisition-worker.tf", "utf8");
  assert.match(wif, /assertion\.owner_id[\s\S]*assertion\.project_id[\s\S]*assertion\.environment == 'production'/);
  assert.match(wif, /vercel_acquisition_invoker_impersonator[\s\S]*roles\/iam\.workloadIdentityUser/);
  assert.match(service, /acquisition_worker_invoker[\s\S]*roles\/run\.invoker/);
  assert.doesNotMatch(`${wif}\n${service}`, /allUsers|allAuthenticatedUsers|roles\/(?:owner|editor|storage\.admin|cloudsql)/i);
});
