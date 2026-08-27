import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { AwsClient } from "google-auth-library";
import { Gaxios, type GaxiosOptions } from "gaxios";
import {
  ACQUISITION_CONTROL_PREFIX,
  PersistentAcquisitionIdempotencyStore,
  acquisitionControlObjectName,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { AcquisitionWorkerFailure, type AcquisitionResult } from "../../lib/server/acquisitionWorker/types";
import {
  AcquisitionControlAuthFailure,
  ACQUISITION_GOOGLE_CLOUD_PROJECT_ID,
  GcsAcquisitionControlObjectStore,
  classifyGcpStsFailure,
  classifyProjectIdFailure,
  classifyImdsv2RoleCredentialPayload,
  createAdcAccessTokenSupplier,
  createAcquisitionControlStore,
  createAcquisitionGoogleAuth,
  createGoogleAuthTelemetryTransporter,
  installStsTransporterTelemetryBridge,
  readAcquisitionControlConfiguration,
  validateGoogleCredentialPolicy,
} from "../../lib/server/acquisitionWorker/gcsControlStore";
import { AcquisitionWorkerStartupTelemetry, type AwsSessionTokenBoundaryKey,
  type GoogleAuthEvidenceKey, type GoogleAuthStage, type OuterAccessTokenProgress,
  type OuterTokenResultShape, type ProjectIdEvidenceKey, type ProjectIdFailureReason,
  type StartupEvidence } from "../../worker/acquisition/startupTelemetry";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const ID2 = "223e4567-e89b-42d3-a456-426614174000";
const success = (id = ID): AcquisitionResult => Object.freeze({ acquisitionId: id, status: "succeeded",
  artifactReference: `acquisition:${id}`, media: Object.freeze({ contentType: "video/mp4", byteSize: 4,
    durationSeconds: 10, hasVideo: true, hasAudio: true }) });
const failure = (id: string, code: "youtube-bot-check" | "network-failure", retryable: boolean): AcquisitionResult =>
  Object.freeze({ acquisitionId: id, status: "failed", errorCode: code, retryable });

class FakeObjects implements AcquisitionControlObjectStore {
  readonly values = new Map<string, { generation: string; record: AcquisitionControlRecord }>();
  writes = 0;
  create(name: string, record: AcquisitionControlRecord) {
    if (this.values.has(name)) return Promise.resolve({ status: "exists" as const });
    this.writes += 1;
    const generation = String(this.writes);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "created" as const, generation });
  }
  read(name: string) {
    const value = this.values.get(name);
    return Promise.resolve(value
      ? { status: "found" as const, object: Object.freeze({ generation: value.generation, record: value.record }) }
      : { status: "missing" as const });
  }
  replace(name: string, expected: string, record: AcquisitionControlRecord) {
    const value = this.values.get(name);
    if (!value || value.generation !== expected) return Promise.resolve({ status: "precondition-failed" as const });
    this.writes += 1;
    const generation = String(this.writes);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "updated" as const, generation });
  }
}

const store = (objects: FakeObjects) => new PersistentAcquisitionIdempotencyStore(objects, undefined, 200, 50, 5);

test("first claim, concurrent same-fingerprint replay, restart replay, and conflict are persistent", async () => {
  const objects = new FakeObjects();
  let operations = 0;
  const firstStore = store(objects);
  const operation = async () => { operations += 1; await new Promise((resolve) => setTimeout(resolve, 25)); return success(); };
  const [first, concurrent] = await Promise.all([
    firstStore.execute(ID, "canonical-youtube-request", operation),
    store(objects).execute(ID, "canonical-youtube-request", operation),
  ]);
  assert.deepEqual(first, success());
  assert.deepEqual(concurrent, success());
  assert.equal(operations, 1);
  assert.deepEqual(await store(objects).execute(ID, "canonical-youtube-request", async () => { throw new Error("must-not-run"); }), success());
  await assert.rejects(store(objects).execute(ID, "different-request", async () => success()),
    (error: unknown) => error instanceof AcquisitionWorkerFailure && error.code === "idempotency-conflict");
});

test("terminal bot-check is replayed while retryable failure requires an explicit delayed reclaim", async () => {
  const objects = new FakeObjects();
  const terminal = failure(ID, "youtube-bot-check", false);
  assert.deepEqual(await store(objects).execute(ID, "a", async () => terminal), terminal);
  assert.deepEqual(await store(objects).execute(ID, "a", async () => success()), terminal);
  const transient = failure(ID2, "network-failure", true);
  assert.deepEqual(await store(objects).execute(ID2, "b", async () => transient), transient);
  assert.deepEqual(await store(objects).execute(ID2, "b", async () => success(ID2)), transient);
});

test("expired lease takeover is atomic and fences the stale owner terminal write", async () => {
  const objects = new FakeObjects();
  const name = acquisitionControlObjectName(ID);
  const old = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "a".repeat(64), state: "running", leaseOwner: ID2, fenceToken: 1,
    leaseExpiresAt: "2000-01-01T00:00:00.000Z", createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z" });
  const created = await objects.create(name, old);
  assert.equal(created.status, "created");
  const contenderA = store(objects).execute(ID, "not-the-seeded-fingerprint", async () => success());
  await assert.rejects(contenderA, /idempotency-conflict/);

  const current = objects.values.get(name)!;
  const staleTerminal = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: old.requestFingerprint, state: "failed", fenceToken: 1,
    createdAt: old.createdAt, updatedAt: new Date().toISOString(), result: failure(ID, "network-failure", true) });
  const takeover = validateAcquisitionControlRecord({ ...old, leaseOwner: crypto.randomUUID(), fenceToken: 2,
    leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(), updatedAt: new Date().toISOString() });
  const won = await objects.replace(name, current.generation, takeover);
  assert.equal(won.status, "updated");
  assert.deepEqual(await objects.replace(name, current.generation, staleTerminal), { status: "precondition-failed" });
});

test("two stale-takeover contenders allow one operation and replay its result", async () => {
  const objects = new FakeObjects();
  const fingerprint = "canonical-request";
  const old = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: createHash("sha256").update(fingerprint).digest("hex"), state: "running",
    leaseOwner: ID2, fenceToken: 1, leaseExpiresAt: "2000-01-01T00:00:00.000Z",
    createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z" });
  await objects.create(acquisitionControlObjectName(ID), old);
  let operations = 0;
  const operation = async () => { operations += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return success(); };
  const results = await Promise.all([store(objects).execute(ID, fingerprint, operation), store(objects).execute(ID, fingerprint, operation)]);
  assert.deepEqual(results, [success(), success()]);
  assert.equal(operations, 1);
  assert.equal(objects.values.get(acquisitionControlObjectName(ID))!.record.fenceToken, 2);
});

test("lease heartbeat renews and lease-loss abort reaches the operation", async () => {
  const renewed = new FakeObjects();
  const renewing = new PersistentAcquisitionIdempotencyStore(renewed, undefined, 80, 10, 5);
  await renewing.execute(ID, "heartbeat", async () => {
    await new Promise((resolve) => setTimeout(resolve, 28));
    return success();
  });
  assert.equal(renewed.writes >= 3, true);

  class LosingObjects extends FakeObjects {
    override replace(name: string, expected: string, record: AcquisitionControlRecord) {
      if (record.state === "running") return Promise.resolve({ status: "precondition-failed" as const });
      return super.replace(name, expected, record);
    }
  }
  const losing = new PersistentAcquisitionIdempotencyStore(new LosingObjects(), undefined, 80, 10, 5);
  await assert.rejects(losing.execute(ID2, "lease-loss", (signal) => new Promise<AcquisitionResult>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new AcquisitionWorkerFailure("acquisition-cancelled", true)), { once: true });
  })), (error: unknown) => error instanceof AcquisitionWorkerFailure && error.code === "acquisition-cancelled");
});

test("retryable terminal failure is reclaimed only after explicit delay", async () => {
  const objects = new FakeObjects();
  let now = 1_800_000_000_000;
  const clock = { now: () => now, ownerToken: () => crypto.randomUUID(),
    sleep: (_ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true })) };
  const persistent = new PersistentAcquisitionIdempotencyStore(objects, clock, 90_000, 30_000, 1_000);
  const transient = failure(ID, "network-failure", true);
  assert.deepEqual(await persistent.execute(ID, "retry", async () => transient), transient);
  assert.deepEqual(await persistent.execute(ID, "retry", async () => success()), transient);
  now += 61_000;
  assert.deepEqual(await persistent.execute(ID, "retry", async () => success()), success());
});

test("record and object naming persist no raw URL, UID, token, path, or listing authority", () => {
  assert.equal(acquisitionControlObjectName(ID), `${ACQUISITION_CONTROL_PREFIX}${ID}.json`);
  assert.throws(() => acquisitionControlObjectName("client-id"), /invalid-acquisition-id/);
  const record = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() });
  assert.doesNotMatch(JSON.stringify(record), /https?:|DaxW|uid|cookie|credential|stderr|stdout|\/workspace/i);
});

test("GCS adapter uses exact objects and generation preconditions without listing or token persistence", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const responses = [
    Response.json({ generation: "1" }),
    new Response(JSON.stringify(validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
      requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() })),
      { headers: { "x-goog-generation": "1", "content-type": "application/json" } }),
    Response.json({ generation: "2" }),
  ];
  const fetchImpl = async (input: string, init?: RequestInit) => { calls.push({ input, init }); return responses.shift()!; };
  const adapter = new GcsAcquisitionControlObjectStore(
    readAcquisitionControlConfiguration({ MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media" }),
    { getAccessToken: async () => "opaque-token" }, fetchImpl);
  const terminal = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() });
  assert.deepEqual(await adapter.create(acquisitionControlObjectName(ID), terminal), { status: "created", generation: "1" });
  assert.equal((await adapter.read(acquisitionControlObjectName(ID))).status, "found");
  assert.deepEqual(await adapter.replace(acquisitionControlObjectName(ID), "1", terminal), { status: "updated", generation: "2" });
  assert.match(calls[0]!.input, /ifGenerationMatch=0/);
  assert.match(calls[2]!.input, /ifGenerationMatch=1/);
  assert.equal(calls.some((call) => /\/o\?(?!uploadType)|prefix=|list/i.test(call.input)), false);
  assert.doesNotMatch(calls.map((call) => String(call.init?.body ?? "")).join(""), /opaque-token/);
});

test("closed Production and experiment bucket authorities fail closed", () => {
  assert.deepEqual(readAcquisitionControlConfiguration({ MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media" }),
    { mode: "PRODUCTION", bucket: "nexcut-prod-jp-2026-media", prefix: ACQUISITION_CONTROL_PREFIX });
  assert.throws(() => readAcquisitionControlConfiguration({}), /invalid-acquisition-control-authority/);
  assert.throws(() => readAcquisitionControlConfiguration({ ACQUISITION_CONTROL_MODE: "PRODUCTION",
    ACQUISITION_CONTROL_BUCKET: "nexcut-production-acquisition-host-experiment-owner001" }), /invalid-acquisition-control-authority/);
  assert.throws(() => readAcquisitionControlConfiguration({ ACQUISITION_CONTROL_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_BUCKET: "nexcut-prod-jp-2026-media",
    ACQUISITION_EXPERIMENT_BUCKET: "nexcut-prod-jp-2026-media" }), /invalid-acquisition-control-authority/);
  assert.deepEqual(readAcquisitionControlConfiguration({ ACQUISITION_CONTROL_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_BUCKET: "nexcut-production-acquisition-host-experiment-owner001",
    ACQUISITION_EXPERIMENT_BUCKET: "nexcut-production-acquisition-host-experiment-owner001" }),
  { mode: "EXPERIMENT", bucket: "nexcut-production-acquisition-host-experiment-owner001", prefix: ACQUISITION_CONTROL_PREFIX });
});

test("ADC supplier returns only an in-memory token and safely classifies failures and cancellation", async () => {
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => ({ token: "opaque-token" }) }) });
  assert.equal(await supplier.getAccessToken(), "opaque-token");
  const raw = new Error("raw-provider-secret-detail");
  const failing = createAdcAccessTokenSupplier({ getClient: async () => { throw raw; } });
  await assert.rejects(failing.getAccessToken(), (error: unknown) => error instanceof AcquisitionControlAuthFailure
    && error.message === "acquisition-control-auth-failed" && !String(error).includes(raw.message));
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(supplier.getAccessToken(aborted.signal), AcquisitionControlAuthFailure);
});

test("credential policy permits ambient or external_account ADC and rejects service-account JSON", async () => {
  await validateGoogleCredentialPolicy({});
  await validateGoogleCredentialPolicy({ GOOGLE_APPLICATION_CREDENTIALS: "/authority/external.json" },
    async () => JSON.stringify({ type: "external_account" }));
  await assert.rejects(validateGoogleCredentialPolicy({ GOOGLE_APPLICATION_CREDENTIALS: "/authority/key.json" },
    async () => JSON.stringify({ type: "service_account", private_key: "must-not-surface" })),
  (error: unknown) => error instanceof AcquisitionControlAuthFailure && !String(error).includes("must-not-surface"));
});

test("credential policy maps unreadable and malformed external-account files to closed substages", async () => {
  const stages: GoogleAuthStage[] = [];
  const observer = { googleAuthStage: (stage: GoogleAuthStage) => stages.push(stage) };
  await assert.rejects(validateGoogleCredentialPolicy({ GOOGLE_APPLICATION_CREDENTIALS: "/closed" },
    async () => { throw new Error("private path secret"); }, observer), AcquisitionControlAuthFailure);
  assert.deepEqual(stages, ["CREDENTIAL_FILE_LOAD"]);
  stages.length = 0;
  await assert.rejects(validateGoogleCredentialPolicy({ GOOGLE_APPLICATION_CREDENTIALS: "/closed" },
    async () => "{malformed", observer), AcquisitionControlAuthFailure);
  assert.deepEqual(stages, ["CREDENTIAL_FILE_LOAD", "EXTERNAL_ACCOUNT_PARSE"]);
});

test("GoogleAuth transporter maps only fixed credential boundaries and proves success after delegation", async () => {
  const stages: GoogleAuthStage[] = [];
  const evidence: GoogleAuthEvidenceKey[] = [];
  const base = new Gaxios();
  base.request = (async () => ({ data: {}, status: 200, statusText: "OK", headers: new Headers(), config: {} })) as typeof base.request;
  const transporter = createGoogleAuthTelemetryTransporter({
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {},
    googleAuthStage: (stage) => stages.push(stage), googleAuthEvidence: (key) => evidence.push(key),
  }, base);
  const urls = [
    "http://169.254.169.254/latest/api/token",
    "http://169.254.169.254/latest/meta-data/placement/availability-zone",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role",
    "https://sts.googleapis.com/v1/token",
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/closed:generateAccessToken",
  ];
  for (const url of urls) await transporter.request({ url } as GaxiosOptions);
  assert.deepEqual(stages, ["IMDSV2_TOKEN", "AWS_REGION_DISCOVERY", "AWS_ROLE_CREDENTIAL_FETCH",
    "AWS_ROLE_CREDENTIAL_FETCH", "GCP_STS_EXCHANGE", "GCP_STS_EXCHANGE", "SERVICE_ACCOUNT_IMPERSONATION"]);
  assert.deepEqual(evidence, ["imdsv2TokenAcquired", "awsRegionResolved", "awsRoleCredentialsAcquired",
    "gcpStsExchangeSucceeded", "serviceAccountImpersonationSucceeded"]);
});

test("acquisition GoogleAuth uses the closed project authority without Cloud Resource Manager discovery", async () => {
  let requests = 0;
  const base = new Gaxios();
  base.request = (async () => {
    requests += 1;
    throw new Error("must-not-contact-cloud-resource-manager");
  }) as typeof base.request;
  const evidence: Array<readonly [ProjectIdEvidenceKey, StartupEvidence]> = [];
  const auth = createAcquisitionGoogleAuth({
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    projectIdEvidence: (key, value) => evidence.push([key, value]),
  }, base);
  assert.equal(ACQUISITION_GOOGLE_CLOUD_PROJECT_ID, "nexcut-prod-jp-2026");
  assert.equal(await auth.getProjectId(), ACQUISITION_GOOGLE_CLOUD_PROJECT_ID);
  assert.equal(requests, 0);
  assert.deepEqual(evidence, []);
  assert.deepEqual(Reflect.get(auth, "scopes"), ["https://www.googleapis.com/auth/devstorage.read_write"]);
});

test("explicit project authority carries the offline full composition past getClient without CRM lookup", async () => {
  let crmRequests = 0;
  let getClientCalls = 0;
  let getAccessTokenCalls = 0;
  let googleAuthInitialized = 0;
  const continuation: string[] = [];
  const accepted: StartupEvidence[] = [];
  const base = new Gaxios();
  base.request = (async (options) => {
    if (String(options.url).includes("cloudresourcemanager.googleapis.com")) crmRequests += 1;
    throw new Error("must-not-contact-external-authority");
  }) as typeof base.request;
  const auth = createAcquisitionGoogleAuth(undefined, base);
  Reflect.set(auth, "jsonContent", {
    type: "external_account",
    audience: "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed",
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    credential_source: {
      environment_id: "aws1",
      region_url: "http://169.254.169.254/latest/meta-data/placement/availability-zone",
      url: "http://169.254.169.254/latest/meta-data/iam/security-credentials",
      regional_cred_verification_url: "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
    },
  });
  const getClient = auth.getClient.bind(auth);
  auth.getClient = async () => {
    getClientCalls += 1;
    const client = await getClient();
    client.getAccessToken = async () => {
      getAccessTokenCalls += 1;
      return { token: "memory-only" };
    };
    return client;
  };
  const store = await createAcquisitionControlStore({ MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media" }, auth,
    async () => { throw new Error("must-not-contact-storage"); }, undefined, {
      controlAuthorityValidated() {}, googleAuthStage() {}, googleAuthEvidence() {},
      googleAuthBoundaryEvidence: (key, value) => { if (key === "accessTokenAccepted") accepted.push(value); },
      outerContinuationEvidence: (key) => continuation.push(key),
      googleAuthStarting() {}, googleAuthInitialized: () => { googleAuthInitialized += 1; },
      controlStoreStarting() {}, controlStoreInitialized() {},
    });
  assert.equal(store instanceof GcsAcquisitionControlObjectStore, true);
  assert.equal(await auth.getProjectId(), ACQUISITION_GOOGLE_CLOUD_PROJECT_ID);
  assert.equal(crmRequests, 0);
  assert.equal(getClientCalls, 1);
  assert.equal(getAccessTokenCalls, 1);
  assert.deepEqual(continuation, ["outerGetClientStarted", "outerClientResolved", "outerGetAccessTokenInvoked",
    "outerContinuationEntered"]);
  assert.deepEqual(accepted, ["YES"]);
  assert.equal(googleAuthInitialized, 1);
});

test("Cloud Resource Manager project lookup telemetry classifies closed success and invalid responses", async () => {
  const cases: ReadonlyArray<readonly [unknown, StartupEvidence, ProjectIdFailureReason]> = [
    [{ projectId: "synthetic-project" }, "YES", "UNKNOWN"],
    [{}, "NO", "INVALID_RESPONSE"],
    [{ projectId: "" }, "NO", "INVALID_RESPONSE"],
    ["malformed", "NO", "INVALID_RESPONSE"],
  ];
  for (const [data, projectIdPresent, reason] of cases) {
    let calls = 0;
    const evidence: Array<readonly [ProjectIdEvidenceKey, StartupEvidence]> = [];
    let failure: ProjectIdFailureReason = "UNKNOWN";
    const base = new Gaxios();
    base.request = (async (options) => {
      calls += 1;
      return { data, status: 200, statusText: "OK", headers: new Headers(), config: options };
    }) as typeof base.request;
    const response = await createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      projectIdEvidence: (key, value) => evidence.push([key, value]),
      projectIdFailure: (value) => { failure = value; },
    }, base).request({ url: "https://cloudresourcemanager.googleapis.com/v1/projects/566365202495" });
    assert.equal(response.data, data);
    assert.equal(calls, 1);
    assert.deepEqual(evidence, [["cloudResourceManagerRequestStarted", "YES"],
      ["cloudResourceManagerResponseObserved", "YES"],
      ["cloudResourceManagerProjectIdPresent", projectIdPresent]]);
    assert.equal(failure, reason);
  }
});

test("Cloud Resource Manager project lookup telemetry classifies 401, 403, 5xx, timeout, and unknown rejection", async () => {
  const cases: ReadonlyArray<readonly [number | undefined, string | undefined, ProjectIdFailureReason, StartupEvidence]> = [
    [401, undefined, "PERMISSION_DENIED", "YES"], [403, undefined, "PERMISSION_DENIED", "YES"],
    [500, undefined, "UNAVAILABLE", "YES"], [503, undefined, "UNAVAILABLE", "YES"],
    [undefined, "ETIMEDOUT", "TIMEOUT", "NO"], [undefined, undefined, "UNKNOWN", "NO"],
  ];
  for (const [status, code, expected, responseObserved] of cases) {
    const evidence: Array<readonly [ProjectIdEvidenceKey, StartupEvidence]> = [];
    let reason: ProjectIdFailureReason = "UNKNOWN";
    let calls = 0;
    const error = Object.assign(new Error("must-not-project"), code ? { code } : {}, status === undefined ? {}
      : { response: { status, data: { error: { status: status === 403 ? "PERMISSION_DENIED" : "UNAVAILABLE" } } } });
    const base = new Gaxios();
    base.request = (async () => { calls += 1; throw error; }) as typeof base.request;
    await assert.rejects(createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      projectIdEvidence: (key, value) => evidence.push([key, value]),
      projectIdFailure: (value) => { reason = value; },
    }, base).request({ url: "https://cloudresourcemanager.googleapis.com/v1/projects/566365202495" }), error);
    assert.equal(calls, 1);
    assert.equal(reason, expected);
    assert.deepEqual(evidence.slice(0, 2), [["cloudResourceManagerRequestStarted", "YES"],
      ["cloudResourceManagerResponseObserved", responseObserved]]);
    assert.equal(JSON.stringify({ evidence, reason }).includes("must-not-project"), false);
  }
  assert.equal(classifyProjectIdFailure({ response: { status: 403 } }), "PERMISSION_DENIED");
  assert.equal(classifyProjectIdFailure({ response: { status: 503 } }), "UNAVAILABLE");
  assert.equal(classifyProjectIdFailure({ code: "ECONNABORTED" }), "TIMEOUT");
  assert.equal(classifyProjectIdFailure(new Error("unclassified")), "UNKNOWN");
});

test("project-ID wrapper observes one delegated lookup and retains completion through downstream failure", async () => {
  const telemetry = new AcquisitionWorkerStartupTelemetry();
  telemetry.enter("GOOGLE_AUTH_INIT");
  let projectCalls = 0;
  let requestCalls = 0;
  let accessTokenCalls = 0;
  const client = new AwsClient({
    audience: "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed",
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    aws_security_credentials_supplier: {
      getAwsRegion: async () => "ap-northeast-1",
      getAwsSecurityCredentials: async () => ({ accessKeyId: "closed", secretAccessKey: "closed", token: "closed" }),
    },
  });
  const stsCredential = Reflect.get(client, "stsCredential") as object;
  const transporter = Reflect.get(stsCredential, "transporter") as Gaxios;
  transporter.request = (async (options) => {
    requestCalls += 1;
    return { data: { projectId: "synthetic-project" }, status: 200, statusText: "OK",
      headers: new Headers(), config: options };
  }) as typeof transporter.request;
  client.getAccessToken = async () => { accessTokenCalls += 1; return { token: "memory-only" }; };
  client.getProjectId = async () => {
    projectCalls += 1;
    const response = await transporter.request({
      url: "https://cloudresourcemanager.googleapis.com/v1/projects/566365202495",
    });
    return (response.data as { projectId: string }).projectId;
  };
  assert.equal(installStsTransporterTelemetryBridge(client, {
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    googleAuthBoundaryEvidence: (key, value) => telemetry.observeGoogleAuth(key, value),
    projectIdEvidence: (key, value) => telemetry.observeProjectId(key, value),
    projectIdFailure: (reason) => telemetry.failProjectId(reason),
  }), true);
  assert.equal(await client.getProjectId(), "synthetic-project");
  const event = telemetry.failure();
  assert.equal(projectCalls, 1);
  assert.equal(requestCalls, 1);
  assert.equal(accessTokenCalls, 0);
  assert.equal(event.projectIdResolutionStarted, "YES");
  assert.equal(event.cloudResourceManagerRequestStarted, "YES");
  assert.equal(event.cloudResourceManagerResponseObserved, "YES");
  assert.equal(event.cloudResourceManagerProjectIdPresent, "YES");
  assert.equal(event.projectIdResolutionCompleted, "YES");
  assert.equal(event.projectIdFailureReason, "UNKNOWN");
});

test("post-impersonation transporter projects only closed response evidence", async () => {
  const cases = [
    [{ accessToken: "memory-only", expireTime: "2099-01-01T00:00:00Z" }, ["YES", "YES", "YES", "YES"]],
    [{ expireTime: "2099-01-01T00:00:00Z" }, ["YES", "NO", "NO", "YES"]],
    [{ accessToken: "", expireTime: "2099-01-01T00:00:00Z" }, ["YES", "YES", "NO", "YES"]],
    [{ accessToken: 7, expireTime: "2099-01-01T00:00:00Z" }, ["YES", "YES", "NO", "YES"]],
    [{ accessToken: "memory-only", expireTime: "invalid" }, ["YES", "YES", "YES", "NO"]],
    ["malformed", ["YES", "NO", "UNKNOWN", "UNKNOWN"]],
  ] as const;
  for (const [data, expected] of cases) {
    const observed: Array<readonly [GoogleAuthEvidenceKey, StartupEvidence]> = [];
    const base = new Gaxios();
    base.request = (async (options) => ({ data, status: 200, statusText: "OK", headers: new Headers(), config: options })) as typeof base.request;
    await createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      googleAuthBoundaryEvidence: (key, value) => observed.push([key, value]),
    }, base).request({ url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/closed:generateAccessToken" });
    assert.deepEqual(observed.map((entry) => entry[1]), expected);
    assert.deepEqual(observed.map((entry) => entry[0]), ["impersonationHttpResponse", "impersonationResponseSchema",
      "impersonatedTokenPresent", "impersonatedExpiryValid"]);
    assert.doesNotMatch(JSON.stringify(observed), /memory-only|2099|invalid/);
  }
});

test("access-token observation preserves call count and closed acceptance evidence", async () => {
  for (const [token, expected] of [["memory-only", "YES"], ["", "NO"], [undefined, "NO"], [7, "NO"]] as const) {
    let calls = 0;
    const observed: Array<readonly [GoogleAuthEvidenceKey, StartupEvidence]> = [];
    const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => {
      calls += 1; return { token: token as string | undefined };
    } }) }, undefined, (key, value) => observed.push([key, value]));
    if (expected === "YES") assert.equal(await supplier.getAccessToken(), "memory-only");
    else await assert.rejects(supplier.getAccessToken(), AcquisitionControlAuthFailure);
    assert.equal(calls, 1);
    assert.deepEqual(observed, [["accessTokenAccepted", expected]]);
  }
});

test("outer access-token boundary retains exact closed progress and result shape", async () => {
  const cases: ReadonlyArray<Readonly<{
    name: string; result: unknown; progress: OuterAccessTokenProgress; shape: OuterTokenResultShape; succeeds: boolean;
  }>> = [
    { name: "valid", result: { token: "synthetic" }, progress: "TOKEN_RETURN", shape: "OBJECT", succeeds: true },
    { name: "empty", result: { token: "" }, progress: "ACCEPTANCE_OBSERVER", shape: "OBJECT", succeeds: false },
    { name: "missing", result: {}, progress: "ACCEPTANCE_OBSERVER", shape: "OBJECT", succeeds: false },
    { name: "null-token", result: { token: null }, progress: "ACCEPTANCE_OBSERVER", shape: "OBJECT", succeeds: false },
    { name: "non-string", result: { token: 7 }, progress: "ACCEPTANCE_OBSERVER", shape: "OBJECT", succeeds: false },
    { name: "null-result", result: null, progress: "OUTER_TOKEN_RESULT_RECEIVED", shape: "NULLISH", succeeds: false },
    { name: "undefined-result", result: undefined, progress: "OUTER_TOKEN_RESULT_RECEIVED", shape: "NULLISH", succeeds: false },
    { name: "primitive-result", result: 7, progress: "ACCEPTANCE_OBSERVER", shape: "OTHER", succeeds: false },
  ];
  for (const entry of cases) {
    const observed: Array<readonly [OuterAccessTokenProgress, OuterTokenResultShape | undefined]> = [];
    const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({
      getAccessToken: async () => entry.result,
    }) } as never, undefined, undefined, (progress, shape) => observed.push([progress, shape]));
    if (entry.succeeds) assert.equal(await supplier.getAccessToken(), "synthetic", entry.name);
    else await assert.rejects(supplier.getAccessToken(), AcquisitionControlAuthFailure, entry.name);
    assert.equal(observed.at(-1)?.[0], entry.progress, entry.name);
    assert.equal(observed[0]?.[1], entry.shape, entry.name);
  }
});

test("outer continuation boundaries retain the last completed step without extra auth calls", async () => {
  const run = async (getClient: () => Promise<never>) => {
    const boundaries: string[] = [];
    const supplier = createAdcAccessTokenSupplier({ getClient }, undefined, undefined, undefined,
      (key) => boundaries.push(key));
    await assert.rejects(supplier.getAccessToken(), AcquisitionControlAuthFailure);
    return boundaries;
  };
  assert.deepEqual(await run(async () => { throw new Error("synthetic"); }), ["outerGetClientStarted"]);

  let calls = 0;
  const rejected: string[] = [];
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => {
    calls += 1; throw new Error("synthetic");
  } }) }, undefined, undefined, undefined, (key) => rejected.push(key));
  await assert.rejects(supplier.getAccessToken(), AcquisitionControlAuthFailure);
  assert.equal(calls, 1);
  assert.deepEqual(rejected, ["outerGetClientStarted", "outerClientResolved", "outerGetAccessTokenInvoked"]);
});

test("successful outer continuation records every boundary and same-execution correlation", async () => {
  const boundaries: string[] = [];
  const correlations: Array<readonly [string, object]> = [];
  const marker = Object.freeze({});
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({
    getAccessToken: async () => ({ token: "synthetic" }),
  }) }, undefined, undefined, undefined, (key) => boundaries.push(key),
  (boundary, value) => correlations.push([boundary, value]), marker);
  assert.equal(await supplier.getAccessToken(), "synthetic");
  assert.deepEqual(boundaries, ["outerGetClientStarted", "outerClientResolved", "outerGetAccessTokenInvoked",
    "outerContinuationEntered"]);
  assert.deepEqual(correlations, [["OUTER_CONTINUATION", marker]]);
});

test("outer access-token boundary retains the last completed substage across throwing boundaries", async () => {
  const getterProgress: OuterAccessTokenProgress[] = [];
  const getterBoundaries: string[] = [];
  const throwing = Object.defineProperty({}, "token", { get() { throw new Error("synthetic"); } });
  const getterSupplier = createAdcAccessTokenSupplier({ getClient: async () => ({
    getAccessToken: async () => throwing,
  }) } as never, undefined, undefined, (progress) => getterProgress.push(progress),
  (key) => getterBoundaries.push(key));
  await assert.rejects(getterSupplier.getAccessToken(), AcquisitionControlAuthFailure);
  assert.deepEqual(getterProgress, ["OUTER_TOKEN_RESULT_RECEIVED"]);
  assert.deepEqual(getterBoundaries, ["outerGetClientStarted", "outerClientResolved", "outerGetAccessTokenInvoked",
    "outerContinuationEntered"]);

  const observerProgress: OuterAccessTokenProgress[] = [];
  const observerSupplier = createAdcAccessTokenSupplier({ getClient: async () => ({
    getAccessToken: async () => ({ token: "synthetic" }),
  }) }, undefined, () => { throw new Error("synthetic observer failure"); },
  (progress) => observerProgress.push(progress));
  await assert.rejects(observerSupplier.getAccessToken(), AcquisitionControlAuthFailure);
  assert.deepEqual(observerProgress, ["OUTER_TOKEN_RESULT_RECEIVED", "TOKEN_PROPERTY_READ", "ACCEPTANCE_OBSERVER"]);
});

test("getAccessToken bridge observes cache assignment without an additional acquisition", async () => {
  let calls = 0;
  const observed: Array<readonly [GoogleAuthEvidenceKey, StartupEvidence]> = [];
  const client = new AwsClient({
    audience: "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed",
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    aws_security_credentials_supplier: {
      getAwsRegion: async () => "ap-northeast-1",
      getAwsSecurityCredentials: async () => ({ accessKeyId: "closed", secretAccessKey: "closed" }),
    },
  });
  Reflect.set(client, "getAccessToken", async () => {
    calls += 1;
    Reflect.set(client, "cachedAccessToken", { access_token: "memory-only" });
    return { token: "memory-only" };
  });
  assert.equal(installStsTransporterTelemetryBridge(client, {
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    googleAuthBoundaryEvidence: (key, value) => observed.push([key, value]),
  }), true);
  await client.getAccessToken();
  assert.equal(calls, 1);
  assert.deepEqual(observed, [["getAccessTokenReturned", "YES"], ["credentialCacheAssigned", "YES"]]);
});

test("successful AWS role credential retrieval advances the closed stage before STS transition", async () => {
  const stages: GoogleAuthStage[] = [];
  const evidence: GoogleAuthEvidenceKey[] = [];
  const base = new Gaxios();
  base.request = (async () => ({ data: {}, status: 200, statusText: "OK", headers: new Headers(), config: {} })) as typeof base.request;
  const transporter = createGoogleAuthTelemetryTransporter({
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {},
    googleAuthStage: (stage) => stages.push(stage), googleAuthEvidence: (key) => evidence.push(key),
  }, base);
  await transporter.request({
    url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role",
  } as GaxiosOptions);
  assert.deepEqual(evidence, ["awsRoleCredentialsAcquired"]);
  assert.deepEqual(stages, ["AWS_ROLE_CREDENTIAL_FETCH", "GCP_STS_EXCHANGE"]);
});

test("actual IMDS role response projects original shape and strictly normalizes recognized credential strings", async () => {
  for (const [data, expectedShape, expectedToken, normalized] of [
    [{ AccessKeyId: "synthetic", SecretAccessKey: "synthetic", Token: "synthetic-session" }, "PLAIN_OBJECT", "YES", false],
    [{ AccessKeyId: "synthetic", SecretAccessKey: "synthetic" }, "PLAIN_OBJECT", "NO", false],
    [JSON.stringify({ AccessKeyId: "synthetic", SecretAccessKey: "synthetic", Token: "synthetic-session" }),
      "JSON_STRING", "YES", true],
    [JSON.stringify({ AccessKeyId: "synthetic", SecretAccessKey: "synthetic" }), "JSON_STRING", "NO", true],
    ["malformed", "OTHER", "UNKNOWN", false],
  ] as const) {
    const observed: Array<readonly [AwsSessionTokenBoundaryKey, StartupEvidence]> = [];
    const shapes: string[] = [];
    const base = new Gaxios();
    const originalResponse = { data, status: 200, statusText: "OK", headers: new Headers(), config: {} };
    base.request = (async (options) => Object.assign(originalResponse, { config: options })) as typeof base.request;
    const transporter = createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      sessionTokenBoundaryEvidence: (key, value) => observed.push([key, value]),
      imdsv2PayloadShape: (value) => shapes.push(value),
    }, base);
    const response = await transporter.request({
      url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role",
    });
    assert.equal(response, originalResponse);
    if (normalized) {
      assert.equal(typeof response.data, "object");
      assert.deepEqual(response.data, JSON.parse(data as string));
    } else assert.equal(response.data, data);
    assert.deepEqual(shapes, [expectedShape]);
    assert.deepEqual(observed, [["imdsv2RoleTokenPresent", expectedToken]]);
    assert.doesNotMatch(JSON.stringify(observed), /synthetic-session|SYNTHETIC|AWS4-HMAC/);
  }
});

test("IMDS credential normalization is exact-endpoint-only and preserves unrecognized responses", async () => {
  const credential = JSON.stringify({ AccessKeyId: "synthetic", SecretAccessKey: "synthetic", Token: "synthetic-session" });
  for (const [url, data, normalized] of [
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role", credential, true],
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role", "{", false],
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role", '{"unrelated":true}', false],
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role", "[]", false],
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role", "7", false],
    ["http://169.254.169.254/latest/meta-data/iam/security-credentials", credential, false],
    ["http://169.254.169.254/latest/meta-data/placement/availability-zone", credential, false],
    ["https://sts.googleapis.com/v1/token", credential, false],
  ] as const) {
    const base = new Gaxios();
    const originalResponse = { data, status: 200, statusText: "OK", headers: new Headers(), config: {} };
    base.request = (async (options) => Object.assign(originalResponse, { config: options })) as typeof base.request;
    const response = await createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    }, base).request({ url });
    assert.equal(response, originalResponse);
    assert.equal(typeof response.data === "object", normalized);
    if (!normalized) assert.equal(response.data, data);
  }
});

test("IMDS role response-shape classifier remains closed and rejects unrelated payloads", () => {
  assert.deepEqual(classifyImdsv2RoleCredentialPayload({ unrelated: true }),
    { shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload('{"unrelated":true}'),
    { shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload(7),
    { shape: "OTHER", tokenPresent: "UNKNOWN" });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload(new Uint8Array()),
    { shape: "OTHER", tokenPresent: "UNKNOWN" });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload(null),
    { shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload(undefined),
    { shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  let getterCalls = 0;
  const accessorPayload = Object.defineProperty({}, "AccessKeyId", {
    get() { getterCalls += 1; return "forbidden"; },
  });
  assert.deepEqual(classifyImdsv2RoleCredentialPayload(accessorPayload),
    { shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  assert.equal(getterCalls, 0);
});

test("actual signer supplier input projects token presence without a second credential acquisition", async () => {
  for (const [token, expected] of [["synthetic-session", "YES"], [undefined, "NO"]] as const) {
    let credentialCalls = 0;
    const observed: Array<readonly [AwsSessionTokenBoundaryKey, StartupEvidence]> = [];
    const client = new AwsClient({
      audience: "//iam.googleapis.com/projects/0/locations/global/workloadIdentityPools/closed/providers/closed",
      subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
      token_url: "http://127.0.0.1/unused",
      aws_security_credentials_supplier: {
        getAwsRegion: async () => "ap-northeast-1",
        getAwsSecurityCredentials: async () => {
          credentialCalls += 1;
          return { accessKeyId: "SYNTHETIC", secretAccessKey: "synthetic-only", ...(token ? { token } : {}) };
        },
      },
    });
    assert.equal(installStsTransporterTelemetryBridge(client, {
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      sessionTokenBoundaryEvidence: (key, value) => observed.push([key, value]),
    }), true);
    await client.retrieveSubjectToken();
    assert.equal(credentialCalls, 1);
    assert.deepEqual(observed, [["signerInputTokenPresent", expected]]);
    assert.doesNotMatch(JSON.stringify(observed), /synthetic-session|SYNTHETIC/);
  }
});

test("full default supplier path normalizes only the credential envelope and preserves token absence", async () => {
  for (const includeToken of [true, false]) {
    const observed: Array<readonly [AwsSessionTokenBoundaryKey, StartupEvidence]> = [];
    const shapes: string[] = [];
    const urls: string[] = [];
    const base = new Gaxios();
    base.request = (async (options: GaxiosOptions) => {
      const url = String(options.url ?? "");
      urls.push(url);
      const data = url.endsWith("/placement/availability-zone") ? "ap-northeast-1a"
        : url.endsWith("/security-credentials") ? "closed-role"
          : JSON.stringify({ AccessKeyId: "synthetic", SecretAccessKey: "synthetic",
            ...(includeToken ? { Token: "synthetic-session" } : {}) });
      return { data, status: 200, statusText: "OK", headers: new Headers(), config: options };
    }) as typeof base.request;
    const observer = {
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      sessionTokenBoundaryEvidence: (key: AwsSessionTokenBoundaryKey, value: StartupEvidence) =>
        observed.push([key, value]),
      imdsv2PayloadShape: (value: string) => shapes.push(value),
    };
    const transporter = createGoogleAuthTelemetryTransporter(observer, base);
    const client = new AwsClient({
      audience: "//iam.googleapis.com/projects/0/locations/global/workloadIdentityPools/closed/providers/closed",
      subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
      token_url: "http://127.0.0.1/unused",
      credential_source: {
        environment_id: "aws1",
        region_url: "http://169.254.169.254/latest/meta-data/placement/availability-zone",
        url: "http://169.254.169.254/latest/meta-data/iam/security-credentials",
        regional_cred_verification_url: "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
      },
    });
    Reflect.get(client, "supplierContext").transporter = transporter;
    assert.equal(installStsTransporterTelemetryBridge(client, observer), true);
    const subject = JSON.parse(decodeURIComponent(await client.retrieveSubjectToken())) as
      Readonly<{ headers: ReadonlyArray<Readonly<{ key: string; value: string }>> }>;
    const headerNames = new Set(subject.headers.map(({ key }) => key.toLowerCase()));
    assert.deepEqual(shapes, ["JSON_STRING"]);
    assert.deepEqual(observed, [
      ["imdsv2RoleTokenPresent", includeToken ? "YES" : "NO"],
      ["signerInputTokenPresent", includeToken ? "YES" : "NO"],
    ]);
    assert.equal(headerNames.has("x-amz-security-token"), includeToken);
    assert.equal(urls.length, 3);
    assert.equal(urls.filter((url) => url.includes("/security-credentials/closed-role")).length, 1);
    assert.doesNotMatch(JSON.stringify({ shapes, observed, headerNames: [...headerNames] }),
      /synthetic-session|synthetic|AWS4-HMAC/);
  }
});

test("downstream invalid_grant and success retain both earlier token-boundary observations", async () => {
  const run = async (fail: boolean) => {
    const telemetry = new AcquisitionWorkerStartupTelemetry();
    telemetry.enter("GOOGLE_AUTH_INIT");
    let metadataRequests = 0; let credentialCalls = 0; let stsRequests = 0;
    const observer = {
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {},
      googleAuthStage: (stage: GoogleAuthStage) => telemetry.enterGoogleAuth(stage),
      googleAuthEvidence: (key: GoogleAuthEvidenceKey) => telemetry.proveGoogleAuth(key),
      sessionTokenBoundaryEvidence: (key: AwsSessionTokenBoundaryKey, value: StartupEvidence) =>
        telemetry.observeSessionTokenBoundary(key, value),
      imdsv2PayloadShape: (value: "PLAIN_OBJECT" | "JSON_STRING" | "OTHER" | "UNKNOWN") =>
        telemetry.observeImdsv2PayloadShape(value),
    };
    const metadata = new Gaxios();
    metadata.request = (async (options) => {
      metadataRequests += 1;
      return { data: { AccessKeyId: "SYNTHETIC", SecretAccessKey: "synthetic-only", Token: "must-not-retain" },
        status: 200, statusText: "OK", headers: new Headers(), config: options };
    }) as typeof metadata.request;
    await createGoogleAuthTelemetryTransporter(observer, metadata).request({
      url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role",
    });

    const client = new AwsClient({
      audience: "//iam.googleapis.com/projects/0/locations/global/workloadIdentityPools/closed/providers/closed",
      subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
      token_url: "https://sts.googleapis.com/v1/token",
      aws_security_credentials_supplier: {
        getAwsRegion: async () => "ap-northeast-1",
        getAwsSecurityCredentials: async () => {
          credentialCalls += 1;
          return { accessKeyId: "SYNTHETIC", secretAccessKey: "synthetic-only", token: "must-not-retain" };
        },
      },
    });
    const sts = Reflect.get(Reflect.get(client, "stsCredential"), "transporter") as Gaxios;
    sts.request = (async (options) => {
      stsRequests += 1;
      if (fail) throw { response: { status: 400, data: { error: "invalid_grant" } } };
      return { data: { access_token: "memory-only", issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        token_type: "Bearer", expires_in: 300 }, status: 200, statusText: "OK", headers: new Headers(), config: options };
    }) as typeof sts.request;
    assert.equal(installStsTransporterTelemetryBridge(client, observer), true);
    if (fail) {
      await assert.rejects(client.getAccessToken(), (error) => {
        telemetry.failGcpSts(classifyGcpStsFailure(error)); return true;
      });
    } else {
      assert.equal(typeof (await client.getAccessToken()).token, "string");
    }
    const event = fail ? telemetry.failure() : telemetry.ready();
    assert.equal(metadataRequests, 1); assert.equal(credentialCalls, 1); assert.equal(stsRequests, 1);
    assert.equal(event.imdsv2RoleTokenPresent, "YES");
    assert.equal(event.imdsv2RoleCredentialPayloadShape, "PLAIN_OBJECT");
    assert.equal(event.signerInputTokenPresent, "YES");
    assert.doesNotMatch(JSON.stringify(event), /must-not-retain|SYNTHETIC|memory-only|invalid_grant/);
  };
  await run(true);
  await run(false);
});

test("GoogleAuth transporter retains failed boundary without raw error projection", async () => {
  const stages: GoogleAuthStage[] = [];
  const evidence: GoogleAuthEvidenceKey[] = [];
  const base = new Gaxios();
  base.request = (async () => { throw new Error("raw token credential path"); }) as typeof base.request;
  const transporter = createGoogleAuthTelemetryTransporter({
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {},
    googleAuthStage: (stage) => stages.push(stage), googleAuthEvidence: (key) => evidence.push(key),
  }, base);
  await assert.rejects(transporter.request({ url: "https://sts.googleapis.com/v1/token" }));
  assert.deepEqual(stages, ["GCP_STS_EXCHANGE"]);
  assert.deepEqual(evidence, []);
});

test("control-store wrapper forwards closed SigV4 evidence before synthetic STS rejection", async () => {
  const source = readFileSync("lib/server/acquisitionWorker/gcsControlStore.ts", "utf8");
  assert.match(source, /const observedStartup:[\s\S]*sigv4Evidence: \(evidence\) => startup\.sigv4Evidence\?\.\(evidence\)/);

  const audience = "//iam.googleapis.com/projects/0/locations/global/workloadIdentityPools/closed/providers/closed";
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const marker = "must-not-persist";
  const subjectToken = encodeURIComponent(JSON.stringify({
    url: "https://sts.ap-northeast-1.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
    method: "POST",
    headers: [
      { key: "authorization", value: `AWS4-HMAC-SHA256 Credential=${marker}/20260825/ap-northeast-1/sts/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature=${marker}` },
      { key: "host", value: "sts.ap-northeast-1.amazonaws.com" },
      { key: "x-amz-date", value: date },
      { key: "x-amz-security-token", value: marker },
      { key: "x-goog-cloud-target-resource", value: audience },
    ],
  }));
  const order: string[] = [];
  let retained: Record<string, string> | undefined;
  const base = new Gaxios();
  base.request = (async () => {
    order.push("request");
    throw { response: { status: 400, data: { error: "invalid_grant" } } };
  }) as typeof base.request;
  const transporter = createGoogleAuthTelemetryTransporter({
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    sigv4Evidence: (evidence) => { order.push("sigv4"); retained = evidence as unknown as Record<string, string>; },
  }, base);
  let failureReason = "UNKNOWN";
  await assert.rejects(transporter.request({
    url: "https://sts.googleapis.com/v1/token", method: "POST",
    data: new URLSearchParams({ audience, subject_token: subjectToken }).toString(),
  } as GaxiosOptions), (error: unknown) => {
    order.push("failure");
    failureReason = classifyGcpStsFailure(error);
    return true;
  });

  assert.deepEqual(order, ["sigv4", "request", "failure"]);
  assert.equal(failureReason, "SUBJECT_TOKEN_REJECTED");
  assert.ok(retained);
  assert.equal(Object.keys(retained).length, 13);
  assert.equal(Object.values(retained).some((value) => value !== "UNKNOWN"), true);
  assert.equal(JSON.stringify({ retained, failureReason }).includes(marker), false);
  assert.equal(JSON.stringify({ retained, failureReason }).includes(subjectToken), false);
});

test("GCP STS failures use only the closed structured classifier", () => {
  const structured = (status: number, error?: unknown) => ({
    response: { status, data: error === undefined ? {} : { error, error_description: "must-not-project" } },
    message: "must-not-project", stack: "must-not-project", headers: { authorization: "must-not-project" },
  });
  assert.equal(classifyGcpStsFailure(structured(400, "invalid_target")), "INVALID_AUDIENCE");
  assert.equal(classifyGcpStsFailure(structured(400, "invalid_grant")), "SUBJECT_TOKEN_REJECTED");
  assert.equal(classifyGcpStsFailure(structured(400, "access_denied")), "STS_PERMISSION_DENIED");
  assert.equal(classifyGcpStsFailure(structured(403, "arbitrary")), "STS_PERMISSION_DENIED");
  assert.equal(classifyGcpStsFailure(structured(500)), "STS_UNAVAILABLE");
  assert.equal(classifyGcpStsFailure(structured(503, "server_error")), "STS_UNAVAILABLE");
  assert.equal(classifyGcpStsFailure({ code: "ETIMEDOUT", message: "must-not-project" }), "STS_TIMEOUT");
  assert.equal(classifyGcpStsFailure(structured(400, "arbitrary_oauth_code")), "UNKNOWN");
  assert.equal(classifyGcpStsFailure({ response: { status: "403", data: { error: 7 } } }), "UNKNOWN");
  assert.equal(classifyGcpStsFailure({ code: "ECONNRESET" }), "UNKNOWN");
  assert.equal(classifyGcpStsFailure(undefined), "UNKNOWN");
});

test("ADC failure callback observes structured failure while preserving the sanitized auth contract", async () => {
  const observed: unknown[] = [];
  const raw = { response: { status: 403, data: { error: "access_denied", error_description: "private" } } };
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => { throw raw; } }) },
    (error) => observed.push(classifyGcpStsFailure(error)));
  await assert.rejects(supplier.getAccessToken(), (error) => error instanceof AcquisitionControlAuthFailure
    && error.message === "acquisition-control-auth-failed");
  assert.deepEqual(observed, ["STS_PERMISSION_DENIED"]);
  assert.doesNotMatch(JSON.stringify(observed), /private|access_denied|403/);
});

test("successful ADC token acquisition does not emit a failure classification", async () => {
  let failures = 0;
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => ({ token: "memory-only" }) }) },
    () => { failures += 1; });
  assert.equal(await supplier.getAccessToken(), "memory-only");
  assert.equal(failures, 0);
});

test("synthetic AWS SigV4 subject token proceeds through STS and impersonation without real credentials", async () => {
  const reached: string[] = [];
  const server = createServer((request, response) => {
    if (request.url === "/sts") {
      reached.push("STS");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "closed-federated", issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        token_type: "Bearer", expires_in: 300 }));
      return;
    }
    if (request.url?.endsWith(":generateAccessToken")) {
      reached.push("IMPERSONATION");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accessToken: "closed-impersonated", expireTime: "2099-01-01T00:00:00Z" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const client = new AwsClient({
      audience: "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed",
      subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
      token_url: `http://127.0.0.1:${address.port}/sts`,
      service_account_impersonation_url: `http://127.0.0.1:${address.port}/v1/projects/-/serviceAccounts/closed:generateAccessToken`,
      aws_security_credentials_supplier: {
        getAwsRegion: async () => "ap-northeast-1",
        getAwsSecurityCredentials: async () => ({ accessKeyId: "CLOSEDACCESS", secretAccessKey: "closed-signing-material",
          token: "closed-session-material" }),
      },
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const subject = await client.retrieveSubjectToken();
    assert.equal(subject.length > 0, true);
    const result = await client.getAccessToken();
    assert.equal(typeof result.token, "string");
    assert.deepEqual(reached, ["STS", "IMPERSONATION"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("actual StsCredentials transporter receives one telemetry-only bridge", async () => {
  const audience = "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed";
  const client = new AwsClient({
    audience, subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    aws_security_credentials_supplier: {
      getAwsRegion: async () => "ap-northeast-1",
      getAwsSecurityCredentials: async () => ({ accessKeyId: "CLOSEDACCESS", secretAccessKey: "closed-signing-material",
        token: "closed-session-material" }),
    },
  });
  const stsCredential = Reflect.get(client, "stsCredential") as object;
  const stsTransporter = Reflect.get(stsCredential, "transporter") as Gaxios;
  const metadataTransporter = Reflect.get(client, "transporter") as Gaxios;
  assert.notEqual(stsTransporter, metadataTransporter);
  const originalRequest = stsTransporter.request;
  let requests = 0;
  let retained: Record<string, string> | undefined;
  let requestShape: Readonly<{ url: unknown; data: unknown; headers: unknown; retry: unknown; timeout: unknown }> | undefined;
  stsTransporter.request = (async (options: GaxiosOptions) => {
    requests += 1;
    requestShape = { url: options.url, data: options.data instanceof URLSearchParams ? options.data.toString() : options.data,
      headers: options.headers, retry: options.retry, timeout: options.timeout };
    throw { response: { status: 400, data: { error: "invalid_grant" } } };
  }) as typeof stsTransporter.request;
  const observer = {
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    sigv4Evidence: (evidence: Record<string, string>) => { retained = evidence; },
  };
  assert.equal(installStsTransporterTelemetryBridge(client, observer), true);
  assert.equal(installStsTransporterTelemetryBridge(client, observer), true);
  const bridgedRequest = stsTransporter.request;
  assert.notEqual(bridgedRequest, originalRequest);
  await assert.rejects(client.getAccessToken(), (error: unknown) => {
    assert.equal(classifyGcpStsFailure(error), "SUBJECT_TOKEN_REJECTED");
    return true;
  });
  assert.equal(requests, 1);
  assert.ok(retained);
  assert.equal(Object.keys(retained).length, 13);
  assert.equal(Object.values(retained).some((value) => value !== "UNKNOWN"), true);
  assert.equal(stsTransporter.request, bridgedRequest);
  assert.equal(requestShape?.url, "https://sts.googleapis.com/v1/token");
  assert.equal(typeof requestShape?.data, "string");
  assert.equal(requestShape?.retry, true);
  assert.equal(requestShape?.timeout, undefined);
  assert.doesNotMatch(JSON.stringify(retained), /CLOSEDACCESS|closed-signing|closed-session|AWS4-HMAC|subject_token/i);
});

test("unexpected StsCredentials shapes preserve authentication and UNKNOWN telemetry", async () => {
  let observed = 0;
  const observer = {
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    sigv4Evidence: () => { observed += 1; },
  };
  assert.equal(installStsTransporterTelemetryBridge({}, observer), false);
  assert.equal(installStsTransporterTelemetryBridge({ stsCredential: { exchangeToken() {}, transporter: new Gaxios() } }, observer), false);
  const supplier = createAdcAccessTokenSupplier({ getClient: async () => ({ getAccessToken: async () => ({ token: "memory-only" }) }) });
  assert.equal(await supplier.getAccessToken(), "memory-only");
  assert.equal(observed, 0);
});

test("STS telemetry bridge preserves the exact delegated request and successful authentication result", async () => {
  const audience = "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/closed/providers/closed";
  const client = new AwsClient({
    audience, subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    aws_security_credentials_supplier: {
      getAwsRegion: async () => "ap-northeast-1",
      getAwsSecurityCredentials: async () => ({ accessKeyId: "CLOSEDACCESS", secretAccessKey: "closed-signing-material",
        token: "closed-session-material" }),
    },
  });
  const stsCredential = Reflect.get(client, "stsCredential") as object;
  const stsTransporter = Reflect.get(stsCredential, "transporter") as Gaxios;
  let delegated: GaxiosOptions | undefined;
  let evidenceCount = 0;
  stsTransporter.request = (async (options: GaxiosOptions) => {
    delegated = options;
    return { data: { access_token: "closed-result", issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer", expires_in: 300 }, status: 200, statusText: "OK", headers: new Headers(), config: options };
  }) as typeof stsTransporter.request;
  assert.equal(installStsTransporterTelemetryBridge(client, {
    controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
    controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
    sigv4Evidence: () => { evidenceCount += 1; },
  }), true);
  const result = await client.getAccessToken();
  assert.equal(typeof result.token, "string");
  assert.equal(evidenceCount, 1);
  assert.equal(delegated?.url, "https://sts.googleapis.com/v1/token");
  assert.equal(delegated?.method, "POST");
  assert.equal(delegated?.data instanceof URLSearchParams, true);
  const form = delegated?.data as URLSearchParams;
  assert.equal(form.get("audience"), audience);
  assert.equal(form.has("subject_token"), true);
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
  assert.equal(delegated?.retry, true);
  assert.equal(delegated?.timeout, undefined);
  assert.equal(new Headers(delegated?.headers).has("authorization"), false);
});

test("host-portable control-store composition accepts Production and experiment shapes without cloud calls", async () => {
  const auth = { getClient: async () => ({ getAccessToken: async () => ({ token: "memory-only" }) }) };
  const production = await createAcquisitionControlStore({ MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media" }, auth,
    async () => { throw new Error("must-not-contact-cloud"); });
  const experiment = await createAcquisitionControlStore({ ACQUISITION_CONTROL_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_BUCKET: "nexcut-production-acquisition-host-experiment-owner001",
    ACQUISITION_EXPERIMENT_BUCKET: "nexcut-production-acquisition-host-experiment-owner001",
    GOOGLE_APPLICATION_CREDENTIALS: "/authority/external.json" }, auth,
  async () => { throw new Error("must-not-contact-cloud"); }, async () => JSON.stringify({ type: "external_account" }));
  assert.equal(production instanceof GcsAcquisitionControlObjectStore, true);
  assert.equal(experiment instanceof GcsAcquisitionControlObjectStore, true);
});

test("full control-store composition projects closed outer continuation evidence into one startup state", async () => {
  const telemetry = new AcquisitionWorkerStartupTelemetry();
  telemetry.enter("CONTROL_STORE_CONFIG");
  const marker = Object.freeze({});
  const startup = {
    controlAuthorityValidated: () => telemetry.prove("controlAuthorityValidated"),
    googleAuthStage: (stage: GoogleAuthStage) => telemetry.enterGoogleAuth(stage),
    googleAuthEvidence: (key: GoogleAuthEvidenceKey) => telemetry.proveGoogleAuth(key),
    googleAuthBoundaryEvidence: (key: GoogleAuthEvidenceKey, value: StartupEvidence) => {
      if (key === "getAccessTokenReturned" || key === "credentialCacheAssigned") {
        telemetry.observeOuterCorrelation("INNER_PRODUCER", marker);
      }
      telemetry.observeGoogleAuth(key, value);
    },
    sessionTokenBoundaryEvidence: (key: AwsSessionTokenBoundaryKey, value: StartupEvidence) =>
      telemetry.observeSessionTokenBoundary(key, value),
    imdsv2PayloadShape: (value: Parameters<typeof telemetry.observeImdsv2PayloadShape>[0]) =>
      telemetry.observeImdsv2PayloadShape(value),
    outerAccessTokenBoundary: (progress: OuterAccessTokenProgress, shape?: OuterTokenResultShape) =>
      telemetry.observeOuterAccessToken(progress, shape),
    outerContinuationEvidence: (key: Parameters<typeof telemetry.observeOuterContinuation>[0]) =>
      telemetry.observeOuterContinuation(key),
    outerCorrelationEvidence: (boundary: Parameters<typeof telemetry.observeOuterCorrelation>[0]) =>
      telemetry.observeOuterCorrelation(boundary, marker),
    googleAuthStarting: () => telemetry.enter("GOOGLE_AUTH_INIT"),
    googleAuthInitialized: () => telemetry.prove("googleAuthInitialized"),
    controlStoreStarting: () => telemetry.enter("CONTROL_STORE_INIT"),
    controlStoreInitialized: () => telemetry.prove("controlStoreInitialized"),
  };
  const auth = { getClient: async () => ({ getAccessToken: async () => {
    startup.googleAuthBoundaryEvidence("getAccessTokenReturned", "YES");
    return { token: "synthetic" };
  } }) };
  await createAcquisitionControlStore({ ACQUISITION_CONTROL_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_BUCKET: "nexcut-production-acquisition-host-experiment-owner001",
    ACQUISITION_EXPERIMENT_BUCKET: "nexcut-production-acquisition-host-experiment-owner001" }, auth,
  async () => { throw new Error("must-not-contact-cloud"); }, undefined, startup);
  const event = telemetry.failure();
  assert.equal(event.outerGetClientStarted, "YES");
  assert.equal(event.outerClientResolved, "YES");
  assert.equal(event.outerGetAccessTokenInvoked, "YES");
  assert.equal(event.outerContinuationEntered, "YES");
  assert.equal(event.outerAccessTokenProgress, "TOKEN_RETURN");
  assert.equal(event.outerTokenResultShape, "OBJECT");
  assert.equal(event.accessTokenAccepted, "YES");
  assert.equal(event.outerTelemetrySameExecution, "YES");
});
