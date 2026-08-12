import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeProductionMediaProbe, runProductionMediaRuntimeProbe } from "../../lib/server/productionMediaRuntime/probe";
import { readProductionMediaWifConfiguration } from "../../lib/server/productionMediaRuntime/mediaWifCredential";

const environment = Object.freeze({
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
  POSTGRES_DATABASE: "nexcut",
  POSTGRES_IAM_USER: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
});

test("media WIF authority is exact and independent from Firebase service account", () => {
  const result = readProductionMediaWifConfiguration(environment);
  assert.equal(result.serviceAccountEmail, environment.GCP_MEDIA_WIF_SERVICE_ACCOUNT);
  assert.throws(() => readProductionMediaWifConfiguration({ ...environment, GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com" }), /Invalid Production media/);
});

test("probe orchestration is deterministic and returns neutral readiness", async () => {
  const calls: string[] = [];
  const result = await runProductionMediaRuntimeProbe(environment, {
    getOidcToken: async () => "opaque-test-token",
    runGcs: async () => { calls.push("gcs"); return { create: true, read: true, delete: true, residue: 0 }; },
    runCloudSql: async () => { calls.push("sql"); return { connector: true, iamAuth: true, selectOne: true }; },
  });
  assert.deepEqual(calls, ["gcs", "sql"]);
  assert.deepEqual(result, { status: "ready", gcs: "pass", cloudSql: "pass" });
});

test("probe authorization is Production-only and constant-time based", () => {
  const previousNode = process.env.NODE_ENV;
  const previousVercel = process.env.VERCEL_ENV;
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  try {
    const secret = "a".repeat(32);
    assert.equal(authorizeProductionMediaProbe(secret, secret), true);
    assert.equal(authorizeProductionMediaProbe("wrong", secret), false);
    assert.equal(authorizeProductionMediaProbe(null, secret), false);
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNode;
    if (previousVercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousVercel;
  }
});

test("probe sources do not log or return credential material", () => {
  const sources = [
    "lib/server/productionMediaRuntime/mediaWifCredential.ts",
    "lib/server/productionMediaRuntime/gcsAdapter.ts",
    "lib/server/productionMediaRuntime/cloudSqlAdapter.ts",
    "lib/server/productionMediaRuntime/probe.ts",
    "app/api/internal/media-runtime-readiness/route.ts",
  ].map(file => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /console\.|NEXT_PUBLIC_|google_service_account_key|service-account\.json/);
  assert.match(sources, /SELECT 1 AS proof/);
  assert.doesNotMatch(sources, /CREATE TABLE|ALTER TABLE|GRANT /);
});
