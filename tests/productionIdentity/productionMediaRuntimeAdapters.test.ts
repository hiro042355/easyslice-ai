import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IdentityPoolClient } from "google-auth-library";
import type { Pool } from "pg";
import {
  AUTHORIZED_BUCKET_MAP,
  createProductionMediaBucket,
  createStorageCompatibleAuthClient,
  resolveAuthorizedBucketName,
} from "../../lib/server/productionMediaRuntime/gcsAdapter";
import { readProductionMediaWifConfiguration } from "../../lib/server/productionMediaRuntime/mediaWifCredential";
import {
  withProductionMediaCloudSqlPool,
  validateMediaCloudSqlAuthority,
} from "../../lib/server/productionMediaRuntime/cloudSqlAdapter";

const environment = Object.freeze({
  APP_ENVIRONMENT: "production",
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com",
});

test("media WIF authority is exact and independent from Firebase service account", () => {
  const result = readProductionMediaWifConfiguration(environment, "production");
  assert.equal(result.serviceAccountEmail, environment.GCP_MEDIA_WIF_SERVICE_ACCOUNT);
  assert.throws(() => readProductionMediaWifConfiguration({
    ...environment,
    GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  }, "production"), /Invalid Production media/);
});

test("readProductionMediaWifConfiguration enforces fail-closed environment validation", () => {
  const envWithoutAppEnv = {
    ...environment,
    APP_ENVIRONMENT: undefined,
  };
  assert.throws(
    () => readProductionMediaWifConfiguration(envWithoutAppEnv, undefined),
    /Unauthorized or missing APP_ENVIRONMENT: undefined/,
  );
  assert.throws(
    () => readProductionMediaWifConfiguration(environment, "development"),
    /Unauthorized or missing APP_ENVIRONMENT: development/,
  );
  // Staging with production WIF authority fails closed
  assert.throws(
    () => readProductionMediaWifConfiguration(environment, "staging"),
    /production WIF authority cannot be used in staging/,
  );
  // Staging without approved WIF parameters fails closed
  assert.throws(
    () => readProductionMediaWifConfiguration({
      APP_ENVIRONMENT: "staging",
      GCP_PROJECT_ID: "easyslice-staging",
      GCP_WIF_PROVIDER_RESOURCE: "projects/123/locations/global/workloadIdentityPools/staging/providers/vercel",
      GCP_MEDIA_WIF_SERVICE_ACCOUNT: "staging-media@easyslice-staging.iam.gserviceaccount.com",
    }, "staging"),
    /Staging media WIF authority requires explicit Product Owner configuration approval/,
  );
});

test("validateMediaCloudSqlAuthority enforces fail-closed connection tuple validation", () => {
  const validProductionTuple = {
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    database: "nexcut",
    iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  };
  // Production succeeds with exact tuple
  assert.doesNotThrow(() => validateMediaCloudSqlAuthority("production", validProductionTuple));

  // Missing or unknown environment throws
  assert.throws(
    () => validateMediaCloudSqlAuthority(undefined, validProductionTuple),
    /Unauthorized or missing APP_ENVIRONMENT: undefined/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("local", validProductionTuple),
    /Unauthorized or missing APP_ENVIRONMENT: local/,
  );

  // Missing fields fail
  assert.throws(
    () => validateMediaCloudSqlAuthority("production", { ...validProductionTuple, instanceConnectionName: "" }),
    /Missing Cloud SQL instance connection name/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("production", { ...validProductionTuple, database: "" }),
    /Missing Cloud SQL database name/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("production", { ...validProductionTuple, iamUser: "" }),
    /Missing Cloud SQL IAM user/,
  );

  // Mismatched production fields fail
  assert.throws(
    () => validateMediaCloudSqlAuthority("production", { ...validProductionTuple, database: "staging_db" }),
    /Invalid Production Cloud SQL authority: database mismatch/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("production", { ...validProductionTuple, instanceConnectionName: "other-instance" }),
    /Invalid Production Cloud SQL authority: instance mismatch/,
  );

  // Staging with production credentials fails closed
  assert.throws(
    () => validateMediaCloudSqlAuthority("staging", validProductionTuple),
    /production database credentials cannot be used in staging/,
  );

  // Staging without explicit PO approval fails closed
  assert.throws(
    () => validateMediaCloudSqlAuthority("staging", {
      instanceConnectionName: "easyslice-staging:asia-northeast1:staging-pg",
      database: "easyslice_staging",
      iamUser: "staging-app-sa@easyslice-staging.iam",
    }),
    /Staging Cloud SQL authority requires explicit Product Owner configuration approval/,
  );
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
  assert.equal(createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "production").name, "nexcut-prod-jp-2026-media");
  assert.throws(() => createProductionMediaBucket(authClient, "nexcut-staging-media", "production"), /Invalid Production media bucket/);
});

test("resolveAuthorizedBucketName enforces fail-closed environment-to-bucket isolation", () => {
  assert.equal(
    resolveAuthorizedBucketName("production", AUTHORIZED_BUCKET_MAP.production),
    "nexcut-prod-jp-2026-media",
  );
  assert.equal(
    resolveAuthorizedBucketName("staging", AUTHORIZED_BUCKET_MAP.staging),
    "easyslice-staging-media-artifacts",
  );
  assert.throws(
    () => resolveAuthorizedBucketName("production", AUTHORIZED_BUCKET_MAP.staging),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("staging", AUTHORIZED_BUCKET_MAP.production),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName(undefined, AUTHORIZED_BUCKET_MAP.production),
    /unauthorized environment undefined/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("development", AUTHORIZED_BUCKET_MAP.production),
    /unauthorized environment development/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("production", undefined),
    /missing bucket name/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("production", "arbitrary-unknown-bucket"),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("staging", "arbitrary-unknown-bucket"),
    /Invalid Production media bucket authority/,
  );
});

test("createProductionMediaBucket supports staging when explicitly passed", () => {
  const authClient = {} as IdentityPoolClient;
  const stagingBucket = createProductionMediaBucket(authClient, "easyslice-staging-media-artifacts", "staging");
  assert.equal(stagingBucket.name, "easyslice-staging-media-artifacts");
  assert.throws(
    () => createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "staging"),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => createProductionMediaBucket(authClient, "easyslice-staging-media-artifacts", undefined),
    /unauthorized environment undefined/,
  );
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
  }, "production");

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
  }, "production"), /callback failed/);
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
  }, "production"), (error: Error) => {
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
  }, "production"), (error) => error === callbackError);
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
  }, "production"), (error: Error) => {
    assert.equal(error.message, "Production media Cloud SQL cleanup failed");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  assert.deepEqual(events, ["pool-close", "connector-close"]);
});
