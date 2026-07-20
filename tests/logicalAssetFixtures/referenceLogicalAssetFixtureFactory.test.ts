import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceLogicalAssetFixture, type ReferenceLogicalAssetFixtureInput } from "@/lib/workflowFixtures/referenceLogicalAssetFixtureFactory";
import { getReferenceLogicalAssetFixture, listReferenceLogicalAssetFixtures } from "@/lib/workflowFixtures/referenceLogicalAssetFixtureRegistry";

export const inputs: readonly ReferenceLogicalAssetFixtureInput[] = [
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-vocal", slot: "reference-voice", usage: "guide-vocal", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-music", slot: "reference-audio", usage: "audio-conditioning", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-mv", slot: "audio", usage: "audio-conditioning", requirement: "required" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-image-fixture-v1", operation: "generate-mv", slot: "reference-image", usage: "reference-image", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-video-fixture-v1", operation: "generate-mv", slot: "reference-video", usage: "reference-video", requirement: "optional" },
];

test("factory constructs all allowlisted operation-slot combinations", () => {
  for (const input of inputs) {
    const before = structuredClone(input), result = createReferenceLogicalAssetFixture(input);
    assert.equal(result.status, "ready");
    assert.deepEqual(input, before);
    if (result.status !== "ready") continue;
    assert.equal(result.operation, input.operation);
    assert.equal(result.slot, input.slot);
    assert.equal(result.usage, input.usage);
    assert.equal(result.requirement, input.requirement);
    assert.equal(result.asset.assetId.includes("fixture-audio"), false);
    assert.equal(result.asset.assetId.includes("fixture-image"), false);
    assert.equal(result.asset.assetId.includes("fixture-video"), false);
  }
});

test("factory rejects unsafe structures and unsupported combinations without raw values", () => {
  const valid = inputs[0];
  for (const invalid of [null, [], { ...valid, extra: true }, { ...valid, operation: "generate-mv" }, Object.create(valid), { ...valid, [Symbol("hidden")]: true }, { fixtureVersion: "1.0", fixtureId: "unknown" }]) {
    const result = createReferenceLogicalAssetFixture(invalid);
    assert.notEqual(result.status, "ready");
    if (result.status === "ready") continue;
    const encoded = JSON.stringify(result);
    for (const forbidden of ["fixture-audio", "fixture-image", "fixture-video", "sha256:", "assetId", "checksum", "http"]) assert.equal(encoded.includes(forbidden), false);
  }
  const accessor = { ...valid };
  Object.defineProperty(accessor, "slot", { get: () => "reference-voice", enumerable: true });
  assert.equal(createReferenceLogicalAssetFixture(accessor).status, "invalid");
});

test("registry is safe, copy-owned, and internally isolated", () => {
  const first = listReferenceLogicalAssetFixtures(), second = listReferenceLogicalAssetFixtures();
  assert.equal(first.length, 3); assert.deepEqual(first, second); assert.notEqual(first, second);
  for (const descriptor of first) {
    assert.deepEqual(getReferenceLogicalAssetFixture(descriptor.fixtureId), descriptor);
    const encoded = JSON.stringify(descriptor);
    for (const forbidden of ["fixture-audio", "fixture-image", "fixture-video", "assetId", "checksum", "durationSeconds", "width", "height", "source", "handle"]) assert.equal(encoded.includes(forbidden), false);
  }
});

test("operation, slot, usage, requirement, and catalog binding remain deterministic across 300000 checks", () => {
  for (let round = 0; round < 60_000; round += 1) for (const input of inputs) {
    const result = createReferenceLogicalAssetFixture({ requirement: input.requirement, usage: input.usage, slot: input.slot, operation: input.operation, fixtureId: input.fixtureId, fixtureVersion: input.fixtureVersion });
    assert.equal(result.status === "ready" && result.operation === input.operation && result.slot === input.slot && result.usage === input.usage && result.requirement === input.requirement, true);
  }
});
