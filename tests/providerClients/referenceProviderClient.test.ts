import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceProviderClient,
  REFERENCE_PROVIDER_API_VERSION,
  REFERENCE_PROVIDER_CLIENT_CAPABILITY,
  REFERENCE_PROVIDER_CLIENT_CONFIG,
  REFERENCE_PROVIDER_CLIENT_ID,
  REFERENCE_PROVIDER_CLIENT_VERSION,
  REFERENCE_PROVIDER_ID,
  REFERENCE_PROVIDER_POLL_TIMEOUT_POLICY,
  REFERENCE_PROVIDER_TIMEOUT_POLICY,
} from "@/lib/providerClients/referenceProviderClient";
import {
  isSafeOpaqueRef,
  parseIsoEpochSeconds,
} from "@/lib/providerClients/providerClientUtils";
import type {
  ProviderJobReference,
  ProviderSubmitInput,
  ReferenceProviderClientConfig,
  ReferenceProviderRequestBody,
  ReferenceTransportScenario,
} from "@/lib/providerClients/types";

const config = (scenario: ReferenceTransportScenario): ReferenceProviderClientConfig => ({
  scenario,
  referenceNowEpochSeconds: 1_893_456_000,
  minimumAssetLifetimeSeconds: 120,
  credentialStates: {
    "credential-valid": "valid",
    "credential-missing": "missing",
    "credential-expired": "expired",
    "credential-revoked": "revoked",
  },
});

function submitInput(): ProviderSubmitInput<ReferenceProviderRequestBody> {
  return {
    contractVersion: "1.0",
    request: {
      requestVersion: "1.0",
      providerId: REFERENCE_PROVIDER_ID,
      providerApiVersion: REFERENCE_PROVIDER_API_VERSION,
      operation: "generate-vocal",
      body: {
        operationPayloadVersion: "1.0",
        payloadKind: "vocal",
        inputAssetCount: 0,
        outputFormat: "wav",
      },
      assetAccessCount: 0,
      materialization: { status: "complete", unresolvedAssetCount: 0 },
    } as ProviderSubmitInput<ReferenceProviderRequestBody>["request"],
    credentialHandle: {
      credentialRef: "credential-valid",
      providerId: REFERENCE_PROVIDER_ID,
      credentialVersion: "reference-v1",
    },
    timeoutPolicy: structuredClone(REFERENCE_PROVIDER_TIMEOUT_POLICY),
    correlation: { operationId: "operation-one", attempt: 1 },
  };
}

async function acceptedJob(): Promise<ProviderJobReference> {
  const result = await createReferenceProviderClient(config("async-accepted")).submit(submitInput());
  assert.equal(result.status, "accepted");
  return result.job;
}

function pollInput(job: ProviderJobReference) {
  return {
    contractVersion: "1.0" as const,
    job,
    credentialHandle: submitInput().credentialHandle,
    timeoutPolicy: structuredClone(REFERENCE_PROVIDER_POLL_TIMEOUT_POLICY),
    correlation: { operationId: "poll-one", attempt: 1 },
  };
}

test("descriptor constants and instances are immutable and independent", () => {
  const first = createReferenceProviderClient();
  const second = createReferenceProviderClient();
  assert.equal(first.providerId, "reference-provider");
  assert.equal(first.clientId, "reference-provider-client-v1");
  assert.equal(first.clientVersion, "1.0.0");
  assert.equal(first.providerApiVersion, "reference-api-v1");
  assert.equal(REFERENCE_PROVIDER_CLIENT_ID, first.clientId);
  assert.equal(REFERENCE_PROVIDER_CLIENT_VERSION, first.clientVersion);
  assert.equal(Object.isFrozen(REFERENCE_PROVIDER_CLIENT_CAPABILITY), true);
  assert.equal(Object.isFrozen(REFERENCE_PROVIDER_TIMEOUT_POLICY), true);
  assert.equal(Object.isFrozen(REFERENCE_PROVIDER_POLL_TIMEOUT_POLICY), true);
  assert.equal(Object.isFrozen(REFERENCE_PROVIDER_CLIENT_CONFIG), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(typeof first.submit, "function");
  assert.equal(typeof first.poll, "function");
  assert.equal(typeof first.cancel, "function");
  assert.notEqual(first, second);
});

test("submit validates contract, request, credential, timeout, correlation, and idempotency", async () => {
  const client = createReferenceProviderClient();
  const cases: Array<[string, ProviderSubmitInput<ReferenceProviderRequestBody>]> = [];
  const add = (name: string, mutate: (value: ProviderSubmitInput<ReferenceProviderRequestBody>) => void) => {
    const value = submitInput(); mutate(value); cases.push([name, value]);
  };
  add("contract", (x) => { x.contractVersion = "2.0" as "1.0"; });
  add("request-version", (x) => { x.request.requestVersion = "2.0" as "1.0"; });
  add("provider", (x) => { x.request.providerId = "other-provider"; });
  add("operation", (x) => { x.request.operation = "unknown" as "generate-vocal"; });
  add("body-version", (x) => { x.request.body.operationPayloadVersion = "2.0" as "1.0"; });
  add("body-kind", (x) => { x.request.body.payloadKind = "music"; });
  add("body-count", (x) => { x.request.body.inputAssetCount = 1; });
  add("timeout", (x) => { x.timeoutPolicy.connectTimeoutMs = 0; });
  add("correlation", (x) => { x.correlation.operationId = "https://unsafe.example"; });
  add("idempotency", (x) => { x.idempotency = { keyRef: "unsafe/key" }; });
  add("credential-missing", (x) => { x.credentialHandle = undefined as unknown as typeof x.credentialHandle; });
  add("credential-unsafe", (x) => { x.credentialHandle.credentialRef = "https://unsafe.example"; });
  for (const [name, value] of cases) {
    const result = await client.submit(value);
    assert.equal(result.status, "failed", name);
    if (result.status === "failed") {
      assert.equal(result.error.category, "invalid-request", name);
      assert.equal(result.transport.requestAccepted, false, name);
    }
  }

  for (const credentialRef of ["credential-missing", "credential-expired", "credential-revoked"]) {
    const value = submitInput(); value.credentialHandle.credentialRef = credentialRef;
    const result = await client.submit(value);
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.error.category, "authentication");
  }
  const invalidStateInput = submitInput();
  invalidStateInput.credentialHandle.credentialRef = "credential-invalid-state";
  const invalidStateClient = createReferenceProviderClient({
    ...config("sync-completed"),
    credentialStates: { "credential-invalid-state": "unknown" as "valid" },
  });
  const invalidState = await invalidStateClient.submit(invalidStateInput);
  assert.equal(invalidState.status, "failed");
  if (invalidState.status === "failed") assert.equal(invalidState.error.category, "authentication");
});

test("submit scenarios produce safe normalized outcomes", async () => {
  const scenarios: Array<[ReferenceTransportScenario, string, string | undefined, boolean]> = [
    ["sync-completed", "completed", undefined, false],
    ["async-accepted", "accepted", undefined, false],
    ["provider-failed", "failed", "generation-failed", false],
    ["rate-limited", "failed", "rate-limit", true],
    ["provider-unavailable", "failed", "provider-unavailable", true],
    ["request-timeout", "failed", "timeout", true],
    ["malformed-json", "failed", "malformed-response", false],
  ];
  for (const [scenario, status, category, retryable] of scenarios) {
    const input = submitInput(); const before = structuredClone(input);
    const result = await createReferenceProviderClient(config(scenario)).submit(input);
    assert.equal(result.status, status, scenario);
    assert.deepEqual(input, before, scenario);
    if (result.status === "failed") {
      assert.equal(result.error.category, category, scenario);
      assert.equal(result.retryAdvice.retryable, retryable, scenario);
      assert.equal("message" in result.error, false);
    }
    if (result.status === "completed") {
      assert.deepEqual(Object.keys(result.data.safeMetadata), ["outputCount"]);
      assert.equal(result.data.providerOutputReferences.every((value) => isSafeOpaqueRef(value, 256)), true);
    }
    if (result.status === "accepted") assert.equal(isSafeOpaqueRef(result.job.jobReference, 256), true);
  }
  const unsupported = await createReferenceProviderClient(config("not-a-scenario" as ReferenceTransportScenario)).submit(submitInput());
  assert.equal(unsupported.status, "failed");
  if (unsupported.status === "failed") assert.equal(unsupported.error.category, "invalid-request");
});

test("idempotency is isolated by key, returned value, input, and client instance", async () => {
  const client = createReferenceProviderClient(config("async-accepted"));
  const input = submitInput(); input.idempotency = { keyRef: "key-one" };
  const inputBefore = structuredClone(input);
  const first = await client.submit(input);
  assert.equal(first.status, "accepted");
  if (first.status !== "accepted") return;
  const originalReference = first.job.jobReference;
  first.job.jobReference = "caller-mutated";
  const replay = await client.submit(input);
  assert.equal(replay.status, "accepted");
  if (replay.status === "accepted") assert.equal(replay.job.jobReference, originalReference);
  assert.deepEqual(input, inputBefore);

  const conflictInput = structuredClone(input);
  conflictInput.request.body.outputFormat = "mp3";
  const conflict = await client.submit(conflictInput);
  assert.equal(conflict.status, "failed");
  if (conflict.status === "failed") assert.equal(conflict.error.safeCode, "idempotency-conflict");

  const otherKey = structuredClone(conflictInput); otherKey.idempotency = { keyRef: "key-two" };
  assert.equal((await client.submit(otherKey)).status, "accepted");
  const noKey = submitInput();
  assert.deepEqual(await client.submit(noKey), await client.submit(structuredClone(noKey)));
  const independent = createReferenceProviderClient(config("async-accepted"));
  assert.equal((await independent.submit(conflictInput)).status, "accepted");
});

test("poll normalizes progress, completion, failure, and malformed references", async () => {
  const job = await acceptedJob();
  for (const [progressFixture, expected] of [[-10, 0], [42.4, 42], [120, 100]] as const) {
    const result = await createReferenceProviderClient({ ...config("async-pending"), progressFixture }).poll(pollInput(job));
    assert.equal(result.status, "pending");
    if (result.status === "pending") assert.equal(result.progress, expected);
  }
  const completed = await createReferenceProviderClient(config("async-completed")).poll(pollInput(job));
  assert.equal(completed.status, "completed");
  if (completed.status === "completed") assert.deepEqual(Object.keys(completed.data.safeMetadata), ["outputCount"]);
  const failed = await createReferenceProviderClient(config("provider-failed")).poll(pollInput(job));
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") assert.equal("message" in failed.error, false);
  const malformed = await createReferenceProviderClient(config("malformed-json")).poll(pollInput(job));
  assert.equal(malformed.status, "failed");
  if (malformed.status === "failed") assert.equal(malformed.error.category, "malformed-response");

  for (const reference of ["https://unsafe.example", "file://unsafe", "unsafe/path", "unsafe\\path", "unsafe\r\nvalue"]) {
    const input = pollInput({ ...job, jobReference: reference });
    const result = await createReferenceProviderClient().poll(input);
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.error.category, "invalid-request");
  }
});

test("cancel classifications are deterministic and reject unsafe job references", async () => {
  const base = await acceptedJob();
  const client = createReferenceProviderClient();
  const result = await client.cancel(pollInput(base));
  assert.equal(result.status, "cancelled");
  assert.equal((await client.cancel(pollInput({ ...base, jobReference: "opaque-completed" }))).status, "already-completed");
  assert.equal((await client.cancel(pollInput({ ...base, jobReference: "opaque-failed" }))).status, "failed");
  assert.equal((await client.cancel(pollInput({ ...base, jobReference: "opaque-unsupported" }))).status, "not-supported");
  assert.equal((await client.cancel(pollInput({ ...base, jobReference: "https://unsafe.example" }))).status, "failed");
  assert.deepEqual(await client.cancel(pollInput(base)), await client.cancel(pollInput(structuredClone(base))));
});

test("deterministic helpers reject unsafe references and parse time without a clock", () => {
  for (const unsafe of [" https-safe", "https://unsafe", "file://unsafe", "C:\\unsafe", "unsafe/path", "unsafe\\path", "unsafe\r\nvalue"]) {
    assert.equal(isSafeOpaqueRef(unsafe), false);
  }
  assert.equal(isSafeOpaqueRef("[opaque-job-reference]"), true);
  assert.equal(parseIsoEpochSeconds("1970-01-01T00:00:00.000Z"), 0);
  assert.equal(parseIsoEpochSeconds("2000-02-29T12:34:56.000Z"), 951_827_696);
  assert.equal(parseIsoEpochSeconds("2100-02-29T00:00:00.000Z"), undefined);
});

test("injected epoch and copied config control asset lifetime deterministically", async () => {
  const mutableConfig = config("sync-completed");
  const client = createReferenceProviderClient(mutableConfig);
  mutableConfig.scenario = "provider-failed";
  const valid = submitInput();
  valid.request.assetAccessCount = 1;
  valid.request.body.inputAssetCount = 1;
  valid.request.earliestAssetExpiry = "2030-01-01T00:02:00.000Z";
  assert.equal((await client.submit(valid)).status, "completed");

  const expired = structuredClone(valid);
  expired.request.earliestAssetExpiry = "2030-01-01T00:01:59.000Z";
  const result = await client.submit(expired);
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.error.category, "asset-access-expired");
    assert.equal(result.transport.requestAccepted, false);
  }
});
