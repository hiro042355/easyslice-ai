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
  GcsAcquisitionControlObjectStore,
  classifyGcpStsFailure,
  createAdcAccessTokenSupplier,
  createAcquisitionControlStore,
  createGoogleAuthTelemetryTransporter,
  installStsTransporterTelemetryBridge,
  readAcquisitionControlConfiguration,
  validateGoogleCredentialPolicy,
} from "../../lib/server/acquisitionWorker/gcsControlStore";
import { AcquisitionWorkerStartupTelemetry, type AwsSessionTokenBoundaryKey,
  type GoogleAuthEvidenceKey, type GoogleAuthStage, type StartupEvidence } from "../../worker/acquisition/startupTelemetry";

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

test("actual IMDS role response projects only closed session-token presence", async () => {
  for (const [data, expected] of [
    [{ Token: "synthetic-session" }, "YES"], [{}, "NO"], ["malformed", "UNKNOWN"],
  ] as const) {
    const observed: Array<readonly [AwsSessionTokenBoundaryKey, StartupEvidence]> = [];
    const base = new Gaxios();
    base.request = (async (options) => ({ data, status: 200, statusText: "OK", headers: new Headers(), config: options })) as typeof base.request;
    const transporter = createGoogleAuthTelemetryTransporter({
      controlAuthorityValidated() {}, googleAuthStarting() {}, googleAuthInitialized() {},
      controlStoreStarting() {}, controlStoreInitialized() {}, googleAuthStage() {}, googleAuthEvidence() {},
      sessionTokenBoundaryEvidence: (key, value) => observed.push([key, value]),
    }, base);
    await transporter.request({ url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/closed-role" });
    assert.deepEqual(observed, [["imdsv2RoleTokenPresent", expected]]);
    assert.doesNotMatch(JSON.stringify(observed), /synthetic-session|SYNTHETIC|AWS4-HMAC/);
  }
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
    };
    const metadata = new Gaxios();
    metadata.request = (async (options) => {
      metadataRequests += 1;
      return { data: { Token: "must-not-retain" }, status: 200, statusText: "OK", headers: new Headers(), config: options };
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
