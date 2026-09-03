import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IdentityPoolClient } from "google-auth-library";
import type { Pool } from "pg";
import {
  createProductionMediaBucket,
  createStorageCompatibleAuthClient,
} from "../../lib/server/productionMediaRuntime/gcsAdapter";
import { readProductionMediaWifConfiguration } from "../../lib/server/productionMediaRuntime/mediaWifCredential";
import { withProductionMediaCloudSqlPool } from "../../lib/server/productionMediaRuntime/cloudSqlAdapter";

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
  class ForeignResponseHeaders {
    forEach(callback: (value: string, name: string) => void) {
      callback("https://storage.googleapis.test/upload/session", "location");
    }
  }
  const responseHeaders = new ForeignResponseHeaders();
  assert.equal(responseHeaders instanceof Headers, false);
  const source = {
    async request(options: unknown) {
      requests.push(options);
      return {
        data: { accepted: true },
        headers: responseHeaders,
      };
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
  assert.deepEqual(await compatible.request(request), {
    data: { accepted: true },
    headers: { location: "https://storage.googleapis.test/upload/session" },
  });
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

test("media Cloud SQL facade preserves callback-scoped native pool cleanup", async () => {
  const events: string[] = [];
  const nativePool = {
    async end() { events.push("pool-close"); },
  } as unknown as Pool;
  const result = await withProductionMediaCloudSqlPool({} as IdentityPoolClient, {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  }, async (pool) => {
    events.push("callback");
    assert.equal(pool, nativePool);
    return "complete";
  }, {
    createConnectorAuthority() {
      return {
        database: "nexcut",
        iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
        async getDriverOptions() { return { stream: () => { throw new Error("not invoked"); } }; },
        close() { events.push("connector-close"); },
      };
    },
    createPool() { return nativePool; },
  });

  assert.equal(result, "complete");
  assert.deepEqual(events, ["callback", "pool-close", "connector-close"]);
});

test("media Cloud SQL facade cleans pool and connector when callback fails", async () => {
  const events: string[] = [];
  const nativePool = { async end() { events.push("pool-close"); } } as unknown as Pool;
  await assert.rejects(withProductionMediaCloudSqlPool({} as IdentityPoolClient, {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  }, async () => { throw new Error("callback failed"); }, {
    createConnectorAuthority: () => ({
      database: "nexcut",
      iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
      async getDriverOptions() { return { stream: () => { throw new Error("not invoked"); } }; },
      close() { events.push("connector-close"); },
    }),
    createPool: () => nativePool,
  }), /callback failed/);
  assert.deepEqual(events, ["pool-close", "connector-close"]);
});

test("media Connector cleanup still runs when native pool end fails", async () => {
  const events: string[] = [];
  const nativePool = {
    async end() { events.push("pool-close"); throw new Error("sensitive pool cleanup detail"); },
  } as unknown as Pool;
  await assert.rejects(withProductionMediaCloudSqlPool({} as IdentityPoolClient, {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  }, async () => "complete", {
    createConnectorAuthority: () => ({
      database: "nexcut",
      iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
      async getDriverOptions() { return { stream: () => { throw new Error("not invoked"); } }; },
      close() { events.push("connector-close"); },
    }),
    createPool: () => nativePool,
  }), (error: Error) => {
    assert.equal(error.message, "Production media Cloud SQL cleanup failed");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  assert.deepEqual(events, ["pool-close", "connector-close"]);
});

test("media preserves callback failure while attempting every failing cleanup", async () => {
  const events: string[] = [];
  const callbackError = new Error("business callback failure");
  const nativePool = {
    async end() { events.push("pool-close"); throw new Error("sensitive pool cleanup detail"); },
  } as unknown as Pool;
  await assert.rejects(withProductionMediaCloudSqlPool({} as IdentityPoolClient, {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  }, async () => { throw callbackError; }, {
    createConnectorAuthority: () => ({
      database: "nexcut",
      iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
      async getDriverOptions() { return { stream: () => { throw new Error("not invoked"); } }; },
      close() { events.push("connector-close"); throw new Error("sensitive connector cleanup detail"); },
    }),
    createPool: () => nativePool,
  }), (error) => error === callbackError);
  assert.deepEqual(events, ["pool-close", "connector-close"]);
});

test("media Connector close failure exposes only the closed cleanup error", async () => {
  const events: string[] = [];
  const nativePool = { async end() { events.push("pool-close"); } } as unknown as Pool;
  await assert.rejects(withProductionMediaCloudSqlPool({} as IdentityPoolClient, {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  }, async () => "complete", {
    createConnectorAuthority: () => ({
      database: "nexcut",
      iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
      async getDriverOptions() { return { stream: () => { throw new Error("not invoked"); } }; },
      close() { events.push("connector-close"); throw new Error("sensitive connector cleanup detail"); },
    }),
    createPool: () => nativePool,
  }), (error: Error) => {
    assert.equal(error.message, "Production media Cloud SQL cleanup failed");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  assert.deepEqual(events, ["pool-close", "connector-close"]);
});
