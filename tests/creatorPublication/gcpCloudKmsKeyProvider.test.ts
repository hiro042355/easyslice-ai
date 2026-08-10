import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createGcpCloudKmsKeyProviderV1,
  GCP_CLOUD_KMS_PROVIDER_ID,
  initializeGcpProtectedIdentityProductionCompositionV1,
  type GcpCloudKmsClientV1,
  type ProtectedIdentityKeyReferenceV1,
} from "../../lib/server/creatorPublicationIdentity";

const keyName = "projects/nexcut-production/locations/asia1/keyRings/protected-identity/cryptoKeys/creator-publication";
const versionName = (version: string) => `${keyName}/cryptoKeyVersions/${version}`;
const reference = (version: string): ProtectedIdentityKeyReferenceV1 => Object.freeze({
  referenceVersion: "1.0",
  provider: GCP_CLOUD_KMS_PROVIDER_ID,
  keyId: keyName,
  keyVersion: versionName(version),
  algorithmVersion: 1,
});
const input = (keyReference?: ProtectedIdentityKeyReferenceV1) => Object.freeze({
  inputVersion: "1.0" as const,
  domain: "principal/v1" as const,
  encodingVersion: "1.0" as const,
  algorithmVersion: 1 as const,
  canonicalBytes: new TextEncoder().encode("canonical-principal"),
  ...(keyReference === undefined ? {} : { keyReference }),
});

type FakeOverrides = Readonly<{
  versionName?: string | null;
  state?: number | string | null;
  algorithm?: number | string | null;
  macName?: string | null;
  mac?: Uint8Array | string | null;
  getVersionError?: unknown;
  macError?: unknown;
}>;

const fakeClient = (overrides: FakeOverrides = Object.freeze({})) => {
  const calls: Array<Readonly<{ operation: string; name: string; data?: Uint8Array }>> = [];
  const client: GcpCloudKmsClientV1 = Object.freeze({
    async getCryptoKeyVersion(name) {
      calls.push({ operation: "get-version", name });
      if (overrides.getVersionError !== undefined) throw overrides.getVersionError;
      return {
        name: overrides.versionName === null ? null : overrides.versionName ?? name,
        state: overrides.state ?? "ENABLED",
        algorithm: overrides.algorithm ?? "HMAC_SHA256",
      };
    },
    async macSign(name, data) {
      calls.push({ operation: "mac-sign", name, data: new Uint8Array(data) });
      if (overrides.macError !== undefined) throw overrides.macError;
      return {
        name: overrides.macName === null ? null : overrides.macName ?? name,
        mac: overrides.mac === null ? null : overrides.mac ?? new Uint8Array(createHmac("sha256", new Uint8Array(32).fill(41)).update(data).digest()),
      };
    },
  });
  return { client, calls };
};

const provider = (
  client: GcpCloudKmsClientV1,
  cryptoKeyName = keyName,
  activeCryptoKeyVersionName = versionName("8"),
) => createGcpCloudKmsKeyProviderV1(
  Object.freeze({ configurationVersion: "1.0", cryptoKeyName, activeCryptoKeyVersionName }),
  client,
);

test("active authority resolves the configured exact numeric version and projects with it", async () => {
  const fake = fakeClient();
  const resolved = await provider(fake.client).resolveActiveKeyReference();
  assert.deepEqual(resolved, reference("8"));
  const result = await provider(fake.client).project(input());
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.identity.keyReference, reference("8"));
  assert.deepEqual(fake.calls.map(({ operation, name }) => ({ operation, name })), [
    { operation: "get-version", name: versionName("8") },
    { operation: "get-version", name: versionName("8") },
    { operation: "mac-sign", name: versionName("8") },
  ]);
});

test("active resolution validates exact metadata and fails closed", async (t) => {
  const cases: ReadonlyArray<readonly [string, FakeOverrides, string]> = [
    ["missing", { getVersionError: { code: 5 } }, "key-not-found"],
    ["wrong algorithm", { algorithm: "HMAC_SHA512" }, "configuration-failure"],
    ["disabled", { state: "DISABLED" }, "key-version-unavailable"],
    ["destroy scheduled", { state: "DESTROY_SCHEDULED" }, "key-version-unavailable"],
    ["destroyed", { state: "DESTROYED" }, "key-version-unavailable"],
    ["mismatched metadata", { versionName: "projects/other/invalid" }, "configuration-failure"],
  ];
  for (const [name, overrides, expected] of cases) await t.test(name, async () => {
    const result = await provider(fakeClient(overrides).client).resolveActiveKeyReference();
    assert.equal("status" in result && result.status, "failure");
    if ("status" in result) assert.equal(result.code, expected);
  });
});

test("active configuration rejects missing, aliases, malformed, and cross-key versions before provider invocation", async (t) => {
  const otherKey = `${keyName}-other`;
  const invalidVersions = [
    "",
    `${keyName}/cryptoKeyVersions/latest`,
    `${keyName}/cryptoKeyVersions/primary`,
    `${keyName}/cryptoKeyVersions/active`,
    `${keyName}/cryptoKeyVersions/current`,
    `${keyName}/cryptoKeyVersions/not-numeric`,
    `${keyName}/cryptoKeyVersions/`,
    `${otherKey}/cryptoKeyVersions/8`,
    `${keyName}/cryptoKeyVersions/8/extra`,
  ] as const;
  for (const activeVersion of invalidVersions) await t.test(activeVersion || "missing", async () => {
    const fake = fakeClient();
    const result = await provider(fake.client, keyName, activeVersion).resolveActiveKeyReference();
    assert.equal("status" in result && result.status, "failure");
    if ("status" in result) assert.equal(result.code, "configuration-failure");
    assert.deepEqual(fake.calls, []);
  });
});

test("historical lookup uses only the requested exact version without active or latest lookup", async () => {
  const fake = fakeClient();
  const result = await provider(fake.client).project(input(reference("2")));
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.identity.keyReference.keyVersion, versionName("2"));
  assert.deepEqual(fake.calls.map(({ operation, name }) => ({ operation, name })), [
    { operation: "get-version", name: versionName("2") },
    { operation: "mac-sign", name: versionName("2") },
  ]);
});

test("historical lookup accepts fully qualified numeric version identities", async (t) => {
  for (const version of ["1", "42", "9001"]) await t.test(version, async () => {
    const fake = fakeClient();
    const result = await provider(fake.client).project(input(reference(version)));
    assert.equal(result.status, "success");
    assert.deepEqual(fake.calls.map(({ operation, name }) => ({ operation, name })), [
      { operation: "get-version", name: versionName(version) },
      { operation: "mac-sign", name: versionName(version) },
    ]);
  });
});

test("historical lookup rejects aliases and malformed version resources before provider invocation", async (t) => {
  const invalidVersions = [
    `${keyName}/cryptoKeyVersions/latest`,
    `${keyName}/cryptoKeyVersions/primary`,
    `${keyName}/cryptoKeyVersions/active`,
    `${keyName}/cryptoKeyVersions/current`,
    `${keyName}/cryptoKeyVersions/not-numeric`,
    `${keyName}/cryptoKeyVersions/`,
    keyName,
    `${keyName}/cryptoKeyVersions/2/extra`,
    `${keyName}/cryptoKeyVersions/2?alias=latest`,
    `${keyName}/cryptoKeyVersions/2#latest`,
    ` ${keyName}/cryptoKeyVersions/2`,
    `${keyName}/cryptoKeyVersions/2 `,
  ] as const;
  for (const keyVersion of invalidVersions) await t.test(keyVersion, async () => {
    const fake = fakeClient();
    const result = await provider(fake.client).project(input(Object.freeze({ ...reference("2"), keyVersion })));
    assert.equal(result.status, "failure");
    if (result.status === "failure") assert.equal(result.code, "invalid-key-reference");
    assert.deepEqual(fake.calls, []);
  });
});

test("missing, disabled, destroyed, and cross-key historical versions fail without fallback", async (t) => {
  const cases: ReadonlyArray<readonly [string, GcpCloudKmsClientV1, ProtectedIdentityKeyReferenceV1, string]> = [
    ["missing", fakeClient({ getVersionError: { code: 5, message: "private" } }).client, reference("404"), "key-version-unavailable"],
    ["disabled", fakeClient({ state: "DISABLED" }).client, reference("2"), "key-version-unavailable"],
    ["destroyed", fakeClient({ state: "DESTROYED" }).client, reference("2"), "key-version-unavailable"],
    ["other key", fakeClient().client, Object.freeze({ ...reference("2"), keyId: `${keyName}-other` }), "invalid-key-reference"],
  ];
  for (const [name, client, requested, expected] of cases) await t.test(name, async () => {
    const result = await provider(client).project(input(requested));
    assert.equal(result.status, "failure");
    if (result.status === "failure") assert.equal(result.code, expected);
  });
});

test("MAC signing receives exact version and domain-separated bytes without requesting key material", async () => {
  const fake = fakeClient();
  const result = await provider(fake.client).project(input(reference("3")));
  assert.equal(result.status, "success");
  const macCall = fake.calls.find(({ operation }) => operation === "mac-sign");
  assert.equal(macCall?.name, versionName("3"));
  assert.deepEqual(macCall?.data, new Uint8Array([
    ...new TextEncoder().encode("principal/v1"),
    0,
    ...new TextEncoder().encode("canonical-principal"),
  ]));
  assert.deepEqual(Object.keys(fake.client).sort(), ["getCryptoKeyVersion", "macSign"]);
});

test("invalid MAC response and operation failure map to safe neutral crypto failure", async (t) => {
  for (const [name, overrides] of [
    ["wrong response version", { macName: versionName("9") }],
    ["missing MAC", { mac: null }],
    ["operation exception", { macError: { code: 2, message: "raw provider detail" } }],
  ] as const) await t.test(name, async () => {
    const result = await provider(fakeClient(overrides).client).project(input(reference("2")));
    assert.equal(result.status, "failure");
    if (result.status === "failure") {
      assert.equal(result.code, "crypto-failure");
      assert.doesNotMatch(JSON.stringify(result), /raw provider detail/);
    }
  });
});

test("authentication, permission, availability, and invalid configuration use the fixed neutral union", async (t) => {
  const cases: ReadonlyArray<readonly [string, unknown, string]> = [
    ["unauthenticated", { code: 16 }, "configuration-failure"],
    ["permission denied", { code: 7 }, "configuration-failure"],
    ["unavailable", { code: 14 }, "provider-unavailable"],
  ];
  for (const [name, error, expected] of cases) await t.test(name, async () => {
    const result = await provider(fakeClient({ getVersionError: error }).client).project(input());
    assert.equal(result.status, "failure");
    if (result.status === "failure") assert.equal(result.code, expected);
  });
  const malformed = await provider(fakeClient().client, "not-a-resource").project(input());
  assert.equal(malformed.status, "failure");
  if (malformed.status === "failure") assert.equal(malformed.code, "configuration-failure");
});

test("Production composition selects GCP provider and becomes ready only after authority validation", async () => {
  const fake = fakeClient();
  const result = await initializeGcpProtectedIdentityProductionCompositionV1(
    Object.freeze({ configurationVersion: "1.0", cryptoKeyName: keyName, activeCryptoKeyVersionName: versionName("8") }),
    Object.freeze({ client: fake.client }),
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(result.readiness, { readinessVersion: "1.0", status: "ready" });
  if (result.status === "ready") {
    assert.equal(result.composition.provider.providerVersion, "1.0");
    assert.equal(result.composition.projector.projectorVersion, "1.0");
  }
  assert.equal(fake.calls.at(-1)?.operation, "mac-sign");
  assert.equal(fake.calls.at(-1)?.name, versionName("8"));
});

test("Production composition fails closed for missing config and provider or active-version failure", async (t) => {
  const cases: ReadonlyArray<readonly [string, string, string, FakeOverrides, string]> = [
    ["missing key config", "", versionName("8"), {}, "configuration-failure"],
    ["missing active config", keyName, "", {}, "configuration-failure"],
    ["provider failure", keyName, versionName("8"), { getVersionError: { code: 14 } }, "provider-unavailable"],
    ["active unavailable", keyName, versionName("8"), { state: "DISABLED" }, "key-version-unavailable"],
    ["MAC authority unavailable", keyName, versionName("8"), { macError: { code: 14 } }, "provider-unavailable"],
  ];
  for (const [name, configuredKey, activeVersion, overrides, expected] of cases) await t.test(name, async () => {
    const result = await initializeGcpProtectedIdentityProductionCompositionV1(
      Object.freeze({ configurationVersion: "1.0", cryptoKeyName: configuredKey, activeCryptoKeyVersionName: activeVersion }),
      Object.freeze({ client: fakeClient(overrides).client }),
    );
    assert.equal(result.status, "not-ready");
    if (result.status === "not-ready") assert.equal(result.readiness.failure.code, expected);
    assert.equal("composition" in result, false);
  });
});

test("Production source uses ADC client and contains no secret, static credential, or test-provider fallback", async () => {
  const adapterSource = await readFile(new URL("../../lib/server/creatorPublicationIdentity/gcpCloudKmsKeyProvider.ts", import.meta.url), "utf8");
  const compositionSource = await readFile(new URL("../../lib/server/creatorPublicationIdentity/gcpCloudKmsProductionComposition.ts", import.meta.url), "utf8");
  assert.match(compositionSource, /new KeyManagementServiceClient\(\)/);
  assert.doesNotMatch(`${adapterSource}\n${compositionSource}`, /getCryptoKey\(|\.primary\??\.?name|listCryptoKeyVersions/);
  assert.doesNotMatch(`${adapterSource}\n${compositionSource}`, /process\.env|keyFilename|credentials\s*:|service-account.*json|createHmac|createDeterministicTestKeyProvider|secret fallback|latest enabled/i);
  assert.doesNotMatch(adapterSource, /\.getSecret|accessSecretVersion|keyBytes|rawKey/i);
});
