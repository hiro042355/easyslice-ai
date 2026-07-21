import assert from "node:assert/strict";
import test from "node:test";
import { referenceMusicMaterializationProfile, referenceMVMaterializationProfile, referenceVocalMaterializationProfile } from "@/lib/materializers/referenceProfiles";

const profiles = [referenceVocalMaterializationProfile, referenceMusicMaterializationProfile, referenceMVMaterializationProfile] as const;
const modes = ["signed-url", "provider-upload", "provider-native-asset", "internal-stream"] as const;

test("materializer profiles explicitly support all representable access modes", () => {
  for (const profile of profiles) for (const mapping of profile.mappings) for (const mode of modes) assert.equal(mapping.allowedAccessModes.includes(mode), true);
});

test("signed-url support is materializer representation capability, not a provider-direct production claim", () => {
  for (const profile of profiles) {
    assert.equal(profile.providerId, "reference-provider");
    assert.equal(profile.providerApiVersion, "reference-api-v1");
    assert.equal("providerDirectAccessModes" in profile, false);
    assert.equal("uploadRequiredAccessModes" in profile, false);
  }
});

test("reference profiles and nested mappings are immutable", () => {
  for (const profile of profiles) {
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.mappings), true);
    for (const mapping of profile.mappings) {
      assert.equal(Object.isFrozen(mapping), true);
      assert.equal(Object.isFrozen(mapping.allowedAccessModes), true);
      assert.equal(Object.isFrozen(mapping.allowedKinds), true);
    }
  }
  assert.throws(() => {
    (referenceVocalMaterializationProfile.mappings as unknown as unknown[]).push({});
  }, TypeError);
  assert.equal(referenceVocalMaterializationProfile.mappings.length, 2);
});

test("250002 operation, mapping, and access-mode capability assertions remain deterministic", () => {
  for (let index = 0; index < 83_334; index += 1) for (const profile of profiles) {
    assert.equal(profile.mappings.length > 0 && profile.mappings.every(mapping => modes.every(mode => mapping.allowedAccessModes.includes(mode))), true);
  }
});
