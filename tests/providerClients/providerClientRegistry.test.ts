import assert from "node:assert/strict";
import test from "node:test";

import {
  getProviderClientDescriptor,
  providerClientRegistry,
} from "@/lib/providerClients/providerClientRegistry";
import {
  REFERENCE_PROVIDER_API_VERSION,
  REFERENCE_PROVIDER_CLIENT_ID,
  REFERENCE_PROVIDER_CLIENT_VERSION,
  REFERENCE_PROVIDER_ID,
  REFERENCE_PROVIDER_TIMEOUT_POLICY,
} from "@/lib/providerClients/referenceProviderClient";
import type {
  ProviderSubmitInput,
  ReferenceProviderRequestBody,
} from "@/lib/providerClients/types";

function submitInput(keyRef: string, outputFormat = "wav"): ProviderSubmitInput<ReferenceProviderRequestBody> {
  return {
    contractVersion: "1.0",
    request: {
      requestVersion: "1.0",
      providerId: REFERENCE_PROVIDER_ID,
      providerApiVersion: REFERENCE_PROVIDER_API_VERSION,
      operation: "generate-vocal",
      body: { operationPayloadVersion: "1.0", payloadKind: "vocal", inputAssetCount: 0, outputFormat },
      assetAccessCount: 0,
      materialization: { status: "complete", unresolvedAssetCount: 0 },
    } as ProviderSubmitInput<ReferenceProviderRequestBody>["request"],
    credentialHandle: { credentialRef: "credential-valid", providerId: REFERENCE_PROVIDER_ID, credentialVersion: "reference-v1" },
    timeoutPolicy: structuredClone(REFERENCE_PROVIDER_TIMEOUT_POLICY),
    correlation: { operationId: "registry-fixture", attempt: 1 },
    idempotency: { keyRef },
  };
}

test("registry exposes one unique frozen Reference descriptor", () => {
  assert.equal(Array.isArray(providerClientRegistry), true);
  assert.equal(providerClientRegistry.length, 1);
  assert.equal(Object.isFrozen(providerClientRegistry), true);
  const descriptor = providerClientRegistry[0];
  assert.equal(descriptor.contractVersion, "1.0");
  assert.equal(descriptor.capabilityVersion, "reference-provider-client-capability-v1");
  assert.equal(descriptor.providerId, REFERENCE_PROVIDER_ID);
  assert.equal(descriptor.clientId, REFERENCE_PROVIDER_CLIENT_ID);
  assert.equal(descriptor.clientVersion, REFERENCE_PROVIDER_CLIENT_VERSION);
  assert.equal(descriptor.providerApiVersion, REFERENCE_PROVIDER_API_VERSION);
  assert.equal(descriptor.availability, "available", "available means Reference fixture runtime availability only");
  assert.equal(typeof descriptor.createClient, "function");
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.capability), true);
  assert.equal(new Set(providerClientRegistry.map((value) => value.clientId)).size, providerClientRegistry.length);
  assert.equal(new Set(providerClientRegistry.map((value) => `${value.providerId}:${value.clientId}`)).size, providerClientRegistry.length);
});

test("lookup accepts only a known safe client ID and returns independent frozen snapshots", () => {
  const first = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  const second = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.notEqual(first.capability, second.capability);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.capability), true);
  for (const value of ["", "   ", "unknown-client", "https://unsafe.example", "file://unsafe", "unsafe/path", "unsafe\\path", "unsafe\r\nvalue"]) {
    assert.equal(getProviderClientDescriptor(value), undefined);
  }
});

test("caller mutation cannot alter descriptor, nested capability, or catalog membership", () => {
  const descriptor = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  assert.ok(descriptor);
  assert.throws(() => { (descriptor as { availability: string }).availability = "disabled"; }, TypeError);
  assert.throws(() => { (descriptor.capability as { supportsPolling: boolean }).supportsPolling = false; }, TypeError);
  assert.throws(() => { (providerClientRegistry as unknown as Array<unknown>).push({}); }, TypeError);
  assert.throws(() => { (providerClientRegistry as unknown as Array<unknown>).splice(0, 1); }, TypeError);
  const current = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  assert.ok(current);
  assert.equal(current.availability, "available");
  assert.equal(current.capability.supportsPolling, true);
  assert.equal(providerClientRegistry.length, 1);
});

test("factory creates independent clients without storing an instance in the registry", async () => {
  const descriptor = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  assert.ok(descriptor);
  assert.equal("client" in descriptor, false);
  const fixtureConfig = {
    scenario: "async-accepted" as const,
    referenceNowEpochSeconds: 1_893_456_000,
    minimumAssetLifetimeSeconds: 120,
    credentialStates: { "credential-valid": "valid" as const },
  };
  const first = descriptor.createClient(fixtureConfig);
  const second = descriptor.createClient(fixtureConfig);
  assert.notEqual(first, second);
  const firstResult = await first.submit(submitInput("shared-key"));
  assert.equal(firstResult.status, "accepted");
  const conflict = await first.submit(submitInput("shared-key", "mp3"));
  assert.equal(conflict.status, "failed");
  const independent = await second.submit(submitInput("shared-key", "mp3"));
  assert.equal(independent.status, "accepted");
});

test("availability is static metadata, not credential, endpoint, environment, or workflow readiness", () => {
  const descriptor = getProviderClientDescriptor(REFERENCE_PROVIDER_CLIENT_ID);
  assert.ok(descriptor);
  assert.equal(descriptor.availability, "available", "Reference fixture factory is available");
  assert.equal("credential" in descriptor, false, "availability does not assert credential readiness");
  assert.equal("endpoint" in descriptor, false, "opaque endpointConfigRef is not endpoint readiness");
  assert.equal("environment" in descriptor, false, "availability is not environment readiness");
  assert.equal("workflow" in descriptor, false, "availability is not workflow readiness");
});
