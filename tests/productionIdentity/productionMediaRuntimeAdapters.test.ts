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
import {
  readProductionMediaWifConfiguration,
  PRODUCTION_PROJECT_NUMBER,
  PRODUCTION_WIF_PROVIDER_RESOURCE,
} from "../../lib/server/productionMediaRuntime/mediaWifCredential";
import {
  withProductionMediaCloudSqlPool,
  validateMediaCloudSqlAuthority,
} from "../../lib/server/productionMediaRuntime/cloudSqlAdapter";
import {
  executeProductionMediaRuntime,
  type MediaRuntimeClientFactories,
} from "../../lib/server/productionMediaRuntime/compositionCore";
import {
  STAGING_DATABASE_IAM_USER,
  STAGING_PROJECT_ID,
  STAGING_SERVICE_ACCOUNT_EMAIL,
} from "../../lib/staging/stagingEnvironment";

const STAGING_WIF_PROVIDER_RESOURCE =
  "projects/123456789012/locations/global/workloadIdentityPools/vercel-staging/providers/vercel-staging";

const fullStagingEnv = Object.freeze({
  APP_ENVIRONMENT: "staging",
  GCP_PROJECT_ID: STAGING_PROJECT_ID,
  GCP_WIF_PROVIDER_RESOURCE: STAGING_WIF_PROVIDER_RESOURCE,
  GCP_MEDIA_WIF_SERVICE_ACCOUNT: STAGING_SERVICE_ACCOUNT_EMAIL,
  MEDIA_BUCKET_NAME: "easyslice-staging-media-artifacts",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "nexcut-staging:asia-northeast1:easyslice-staging-pg",
  POSTGRES_DATABASE: "easyslice_staging",
  POSTGRES_IAM_USER: STAGING_DATABASE_IAM_USER,
});

const environment = Object.freeze({
  APP_ENVIRONMENT: "production",
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: `projects/${PRODUCTION_PROJECT_NUMBER}/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production`,
  GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com",
});

const fullProductionEnv = Object.freeze({
  ...environment,
  MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
  POSTGRES_DATABASE: "nexcut",
  POSTGRES_IAM_USER: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
});

test("media WIF authority is exact and independent from Firebase service account", () => {
  const result = readProductionMediaWifConfiguration(environment, "production");
  assert.equal(result.serviceAccountEmail, environment.GCP_MEDIA_WIF_SERVICE_ACCOUNT);
  assert.equal(result.providerResource, PRODUCTION_WIF_PROVIDER_RESOURCE);
  assert.throws(() => readProductionMediaWifConfiguration({
    ...environment,
    GCP_MEDIA_WIF_SERVICE_ACCOUNT: "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  }, "production"), /Invalid Production media/);
});

test("readProductionMediaWifConfiguration enforces exact production project number", () => {
  assert.throws(
    () => readProductionMediaWifConfiguration({
      ...environment,
      GCP_WIF_PROVIDER_RESOURCE: "projects/999999999999/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
    }, "production"),
    /Invalid Production media WIF provider authority: project number or pool mismatch/,
  );
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
  // Staging accepts only the pinned staging project, pool/provider and service account
  const staging = readProductionMediaWifConfiguration(fullStagingEnv, "staging");
  assert.equal(staging.projectId, STAGING_PROJECT_ID);
  assert.equal(staging.providerResource, STAGING_WIF_PROVIDER_RESOURCE);
  assert.equal(staging.serviceAccountEmail, STAGING_SERVICE_ACCOUNT_EMAIL);

  assert.throws(
    () => readProductionMediaWifConfiguration({ ...fullStagingEnv, GCP_PROJECT_ID: "easyslice-staging" }, "staging"),
    /Invalid Staging media project authority/,
  );
  assert.throws(
    () => readProductionMediaWifConfiguration({
      ...fullStagingEnv,
      GCP_WIF_PROVIDER_RESOURCE: "projects/123/locations/global/workloadIdentityPools/staging/providers/vercel",
    }, "staging"),
    /Invalid Staging media WIF provider authority/,
  );
  assert.throws(
    () => readProductionMediaWifConfiguration({
      ...fullStagingEnv,
      GCP_WIF_PROVIDER_RESOURCE: "projects/123456789012/locations/global/workloadIdentityPools/vercel-staging/providers/vercel-production",
    }, "staging"),
    /Invalid Staging media WIF provider authority/,
  );
  assert.throws(
    () => readProductionMediaWifConfiguration({
      ...fullStagingEnv,
      GCP_MEDIA_WIF_SERVICE_ACCOUNT: "other-sa@nexcut-staging.iam.gserviceaccount.com",
    }, "staging"),
    /Invalid Staging media service-account authority/,
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

  // Staging accepts only the pinned staging project, database and IAM user
  const validStagingTuple = {
    instanceConnectionName: "nexcut-staging:asia-northeast1:easyslice-staging-pg",
    database: "easyslice_staging",
    iamUser: STAGING_DATABASE_IAM_USER,
  };
  assert.doesNotThrow(() => validateMediaCloudSqlAuthority("staging", validStagingTuple));
  assert.throws(
    () => validateMediaCloudSqlAuthority("staging", {
      ...validStagingTuple,
      instanceConnectionName: "easyslice-staging:asia-northeast1:staging-pg",
    }),
    /instance must belong to the nexcut-staging project/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("staging", { ...validStagingTuple, database: "nexcut_staging" }),
    /expected database "easyslice_staging"/,
  );
  assert.throws(
    () => validateMediaCloudSqlAuthority("staging", {
      ...validStagingTuple,
      iamUser: "staging-app-sa@easyslice-staging.iam",
    }),
    /expected IAM user/,
  );
});

test("executeProductionMediaRuntime enforces zero factory calls on invalid configuration", async () => {
  const callCounts = {
    getOidcToken: 0,
    createWifClient: 0,
    createBucket: 0,
    withCloudSqlPool: 0,
  };

  const spyFactories: MediaRuntimeClientFactories = Object.freeze({
    getOidcToken: async () => { callCounts.getOidcToken++; return "token"; },
    createWifClient: () => { callCounts.createWifClient++; return {} as IdentityPoolClient; },
    createBucket: () => { callCounts.createBucket++; return {} as ReturnType<typeof createProductionMediaBucket>; },
    withCloudSqlPool: async () => { callCounts.withCloudSqlPool++; return "done" as never; },
  });

  const invalidTestCases = [
    { name: "missing APP_ENVIRONMENT", env: { ...fullProductionEnv, APP_ENVIRONMENT: undefined } },
    { name: "unknown APP_ENVIRONMENT", env: { ...fullProductionEnv, APP_ENVIRONMENT: "development" } },
    { name: "missing GCP_PROJECT_ID", env: { ...fullProductionEnv, GCP_PROJECT_ID: undefined } },
    { name: "invalid WIF project number", env: { ...fullProductionEnv, GCP_WIF_PROVIDER_RESOURCE: "projects/123/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production" } },
    { name: "production WIF in staging", env: { ...fullProductionEnv, APP_ENVIRONMENT: "staging" } },
    { name: "missing MEDIA_BUCKET_NAME", env: { ...fullProductionEnv, MEDIA_BUCKET_NAME: undefined } },
    { name: "staging bucket in production", env: { ...fullProductionEnv, MEDIA_BUCKET_NAME: "easyslice-staging-media-artifacts" } },
    { name: "missing CLOUD_SQL_INSTANCE_CONNECTION_NAME", env: { ...fullProductionEnv, CLOUD_SQL_INSTANCE_CONNECTION_NAME: undefined } },
    { name: "missing POSTGRES_DATABASE", env: { ...fullProductionEnv, POSTGRES_DATABASE: undefined } },
    { name: "missing POSTGRES_IAM_USER", env: { ...fullProductionEnv, POSTGRES_IAM_USER: undefined } },
    { name: "mismatched Cloud SQL database", env: { ...fullProductionEnv, POSTGRES_DATABASE: "other-database" } },
  ];

  for (const { name, env } of invalidTestCases) {
    const priorCounts = { ...callCounts };
    await assert.rejects(
      async () => executeProductionMediaRuntime(async () => "success", spyFactories, env),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
      `Expected rejection for test case: ${name}`,
    );
    // Directly verify that ZERO factory calls occurred
    assert.deepEqual(callCounts, priorCounts, `Factory calls occurred during invalid case: ${name}`);
  }
});

test("executeProductionMediaRuntime enforces strict Phase A -> Phase B ordered execution log", async () => {
  const executionOrder: string[] = [];

  const spyFactories: MediaRuntimeClientFactories = Object.freeze({
    getOidcToken: async () => { executionOrder.push("getOidcToken"); return "token"; },
    createWifClient: () => { executionOrder.push("createWifClient"); return {} as IdentityPoolClient; },
    createBucket: () => { executionOrder.push("createBucket"); return {} as ReturnType<typeof createProductionMediaBucket>; },
    withCloudSqlPool: async (_auth, _config, op) => {
      executionOrder.push("withCloudSqlPool:open");
      const fakePool = {} as Pool;
      const res = await op(fakePool);
      executionOrder.push("withCloudSqlPool:close");
      return res;
    },
  });

  const result = await executeProductionMediaRuntime(async ({ bucket, pool }) => {
    executionOrder.push("operation:execute");
    assert.ok(bucket);
    assert.ok(pool);
    return "operation-complete";
  }, spyFactories, fullProductionEnv);

  assert.equal(result, "operation-complete");
  assert.deepEqual(executionOrder, [
    "createWifClient",
    "createBucket",
    "withCloudSqlPool:open",
    "operation:execute",
    "withCloudSqlPool:close",
  ]);
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
    "lib/server/productionMediaRuntime/compositionCore.ts",
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

test("staging runtime composition binds the staging project, bucket and environment", async () => {
  const calls: string[] = [];
  let bucketProjectId: string | undefined;
  let poolEnvironment: string | undefined;
  const factories: MediaRuntimeClientFactories = Object.freeze({
    getOidcToken: async () => "oidc",
    createWifClient: (configuration) => {
      calls.push(`wif:${configuration.projectId}:${configuration.serviceAccountEmail}`);
      return {} as IdentityPoolClient;
    },
    createBucket: (_auth, bucketName, environment, projectId) => {
      calls.push(`bucket:${environment}:${bucketName}`);
      bucketProjectId = projectId;
      return {} as ReturnType<typeof createProductionMediaBucket>;
    },
    withCloudSqlPool: async (_auth, configuration, operation, _deps, environment) => {
      calls.push(`sql:${environment}:${configuration.database}`);
      poolEnvironment = environment;
      return operation({} as Pool);
    },
  });

  const result = await executeProductionMediaRuntime(
    async () => "ok",
    factories,
    fullStagingEnv,
  );

  assert.equal(result, "ok");
  assert.equal(bucketProjectId, STAGING_PROJECT_ID);
  assert.equal(poolEnvironment, "staging");
  assert.deepEqual(calls, [
    `wif:${STAGING_PROJECT_ID}:${STAGING_SERVICE_ACCOUNT_EMAIL}`,
    "bucket:staging:easyslice-staging-media-artifacts",
    "sql:staging:easyslice_staging",
  ]);
});

test("media storage rejects a project that does not belong to the active environment", () => {
  const authClient = {} as IdentityPoolClient;
  assert.throws(
    () => createProductionMediaBucket(authClient, "easyslice-staging-media-artifacts", "staging", "nexcut-prod-jp-2026"),
    /Invalid media storage project authority/,
  );
  assert.throws(
    () => createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "production", "nexcut-staging"),
    /Invalid media storage project authority/,
  );
  assert.doesNotThrow(
    () => createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "production", "nexcut-prod-jp-2026"),
  );
});
