import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionKmsReadinessGateV1,
  GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION,
  projectProductionKmsReadinessHttpResponseV1,
} from "../../lib/server/creatorPublicationIdentity/productionKmsReadiness";
import type { GcpProtectedIdentityProductionStartupResultV1 } from "../../lib/server/creatorPublicationIdentity";

const key = "projects/nexcut-prod-jp-2026/locations/asia1/keyRings/nexcut-prod-identity/cryptoKeys/protected-identity-mac";
const version = `${key}/cryptoKeyVersions/1`;
const ready = Object.freeze({
  resultVersion: "1.0" as const,
  status: "ready" as const,
  readiness: Object.freeze({ readinessVersion: "1.0" as const, status: "ready" as const }),
  composition: Object.freeze({ compositionVersion: "1.0" as const, provider: {} as never, projector: {} as never }),
});
const notReady = (code: "configuration-failure" | "key-version-unavailable" | "provider-unavailable") => Object.freeze({
  resultVersion: "1.0" as const,
  status: "not-ready" as const,
  readiness: Object.freeze({
    readinessVersion: "1.0" as const,
    status: "not-ready" as const,
    failure: Object.freeze({ resultVersion: "1.0" as const, status: "failure" as const, code, safeReason: code }),
  }),
});

test("valid exact Production authority becomes ready and successful readiness is cached", async () => {
  const configurations: unknown[] = [];
  const gate = createProductionKmsReadinessGateV1({
    [GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION]: key,
    PROTECTED_IDENTITY_KMS_ACTIVE_VERSION: version,
  }, async (configuration) => {
    configurations.push(configuration);
    return ready;
  });
  assert.deepEqual(await gate.check(), { resultVersion: "1.0", status: "ready" });
  assert.deepEqual(await gate.check(), { resultVersion: "1.0", status: "ready" });
  assert.deepEqual(configurations, [{ configurationVersion: "1.0", cryptoKeyName: key, activeCryptoKeyVersionName: version }]);
});

test("missing and malformed authority fail closed without fallback or discovery", async (t) => {
  for (const [name, environment] of [
    ["missing active version", { [GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION]: key }],
    ["malformed active version", { [GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION]: key, PROTECTED_IDENTITY_KMS_ACTIVE_VERSION: `${key}/cryptoKeyVersions/latest` }],
  ] as const) await t.test(name, async () => {
    const configurations: Array<Readonly<{ cryptoKeyName: string; activeCryptoKeyVersionName: string }>> = [];
    const gate = createProductionKmsReadinessGateV1(environment, async (configuration) => {
      configurations.push(configuration);
      return notReady("configuration-failure");
    });
    assert.deepEqual(await gate.check(), { resultVersion: "1.0", status: "not-ready", reason: "configuration-failure" });
    assert.equal(configurations.length, 1);
    assert.doesNotMatch(JSON.stringify(configurations), /primary|runtime discovery/);
  });
});

test("provider, disabled, and wrong-algorithm failures retain only safe neutral reasons", async (t) => {
  for (const [name, result, reason] of [
    ["provider unavailable", notReady("provider-unavailable"), "provider-unavailable"],
    ["disabled", notReady("key-version-unavailable"), "key-version-unavailable"],
    ["wrong algorithm", notReady("configuration-failure"), "configuration-failure"],
  ] as const) await t.test(name, async () => {
    const gate = createProductionKmsReadinessGateV1({
      [GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION]: key,
      PROTECTED_IDENTITY_KMS_ACTIVE_VERSION: version,
    }, async () => result as GcpProtectedIdentityProductionStartupResultV1);
    const projected = await gate.check();
    assert.deepEqual(projected, { resultVersion: "1.0", status: "not-ready", reason });
    assert.doesNotMatch(JSON.stringify(projected), /mac|token|stack|private/i);
  });
});

test("unexpected raw provider exceptions are neutralized and failures remain retryable", async () => {
  let calls = 0;
  const gate = createProductionKmsReadinessGateV1({
    [GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION]: key,
    PROTECTED_IDENTITY_KMS_ACTIVE_VERSION: version,
  }, async () => {
    calls += 1;
    throw new Error("raw provider token stack MAC-output");
  });
  const first = await gate.check();
  const second = await gate.check();
  assert.deepEqual(first, { resultVersion: "1.0", status: "not-ready", reason: "provider-unavailable" });
  assert.deepEqual(second, first);
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(first), /token|stack|mac-output/i);
});

test("HTTP projection uses 2xx only for ready and exposes only the safe contract", async () => {
  const success = projectProductionKmsReadinessHttpResponseV1({ resultVersion: "1.0", status: "ready" });
  const failure = projectProductionKmsReadinessHttpResponseV1({
    resultVersion: "1.0",
    status: "not-ready",
    reason: "provider-unavailable",
  });
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { status: "ready" });
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { status: "not-ready", reason: "provider-unavailable" });
  assert.equal(failure.headers.get("cache-control"), "no-store");
});
