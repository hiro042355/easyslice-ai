import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IdentityPoolClient } from "google-auth-library";
import {
  createProductionMediaBucket,
  createStorageCompatibleAuthClient,
} from "../../lib/server/productionMediaRuntime/gcsAdapter";
import { readProductionMediaWifConfiguration } from "../../lib/server/productionMediaRuntime/mediaWifCredential";

const environment = Object.freeze({
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com",
});

test("media WIF authority is exact and independent from Firebase service account", () => {
  const result = readProductionMediaWifConfiguration(environment);
  assert.equal(result.serviceAccountEmail, environment.GCP_MEDIA_WIF_SERVICE_ACCOUNT);
  assert.throws(() => readProductionMediaWifConfiguration({
    ...environment,
    GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  }), /Invalid Production media/);
});

test("GCS compatibility adapter preserves the impersonated authorization header", async () => {
  let calls = 0;
  const requests: unknown[] = [];
  const source = {
    async request(options: unknown) {
      requests.push(options);
      return { data: { accepted: true } };
    },
    async getRequestHeaders() {
      calls += 1;
      return new Headers({ authorization: "Bearer opaque-test-token", "x-goog-user-project": "nexcut-prod-jp-2026" });
    },
  } as unknown as IdentityPoolClient;
  const compatible = createStorageCompatibleAuthClient(source) as unknown as {
    projectId: string;
    request(options: unknown): Promise<unknown>;
    getRequestHeaders(url?: string): Promise<Record<string, string>>;
  };

  assert.equal(compatible.projectId, "nexcut-prod-jp-2026");
  assert.deepEqual(await compatible.getRequestHeaders("https://storage.googleapis.com"), {
    authorization: "Bearer opaque-test-token",
    "x-goog-user-project": "nexcut-prod-jp-2026",
  });
  assert.equal(calls, 1);

  const request = { url: "https://storage.googleapis.com/upload", method: "POST" };
  assert.deepEqual(await compatible.request(request), { data: { accepted: true } });
  assert.deepEqual(requests, [request]);
});

test("GCS composition retains the exact Production bucket authority", () => {
  const authClient = {} as IdentityPoolClient;
  assert.equal(createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media").name, "nexcut-prod-jp-2026-media");
  assert.throws(() => createProductionMediaBucket(authClient, "nexcut-staging-media"), /Invalid Production media bucket/);
});

test("reusable media runtime sources do not log or embed static credentials", () => {
  const sources = [
    "lib/server/productionMediaRuntime/mediaWifCredential.ts",
    "lib/server/productionMediaRuntime/gcsAdapter.ts",
    "lib/server/productionMediaRuntime/cloudSqlAdapter.ts",
  ].map(file => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /console\.|NEXT_PUBLIC_|google_service_account_key|service-account\.json/);
  assert.doesNotMatch(sources, /SELECT 1|CREATE TABLE|ALTER TABLE|GRANT /);
});
