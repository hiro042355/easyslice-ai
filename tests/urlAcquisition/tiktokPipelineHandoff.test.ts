import assert from "node:assert/strict";
import test from "node:test";
import { classifyUrl } from "../../lib/urlAcquisition/classifyUrl";
import { createAssetImportFingerprint } from "../../lib/server/assetImport/fingerprint";
import { resolveClipPlatformProfileV1 } from "../../lib/clipPlatform/profiles";
import type { CanonicalAssetImportSource } from "../../lib/assetImport/types";

test("TikTok asset source produces deterministic fingerprint under CanonicalAssetImportSource contract", () => {
  const source: CanonicalAssetImportSource = {
    platform: "tiktok",
    videoId: "7123456789012345678",
    normalizedUrl: "https://www.tiktok.com/@creator/video/7123456789012345678",
    authorUsername: "creator",
  };

  const fingerprint1 = createAssetImportFingerprint(source);
  const fingerprint2 = createAssetImportFingerprint(source);

  assert.equal(fingerprint1.length, 32);
  assert.deepEqual(fingerprint1, fingerprint2);

  const differentSource: CanonicalAssetImportSource = {
    platform: "tiktok",
    videoId: "7999999999999999999",
    normalizedUrl: "https://www.tiktok.com/@creator/video/7999999999999999999",
    authorUsername: "creator",
  };
  const fingerprintDiff = createAssetImportFingerprint(differentSource);
  assert.notDeepEqual(fingerprint1, fingerprintDiff);
});

test("Existing clipping profile engine contains dedicated TikTok profile with 15-55s duration window and vertical crop weighting", () => {
  const profile = resolveClipPlatformProfileV1("tiktok");

  assert.equal(profile.target, "tiktok");
  assert.equal(profile.durationPolicy.minimumSeconds, 15);
  assert.equal(profile.durationPolicy.preferredSeconds, 25);
  assert.equal(profile.durationPolicy.maximumSeconds, 55);
  assert.equal(profile.qualityWeights.hookStrength, 0.22);
  assert.ok(profile.reasonCodes.includes("tiktok-hook-priority"));
});

test("TikTok URL classification matches CanonicalAssetImportSource platform discriminator", () => {
  const classification = classifyUrl("https://www.tiktok.com/@dance/video/7123456789012345678");
  assert.equal(classification.kind, "SUPPORTED_TIKTOK");
  if (classification.kind === "SUPPORTED_TIKTOK") {
    const importSource: CanonicalAssetImportSource = {
      platform: classification.platform,
      videoId: classification.videoId,
      normalizedUrl: classification.normalizedUrl,
      authorUsername: classification.authorUsername,
    };

    assert.equal(importSource.platform, "tiktok");
    assert.equal(importSource.videoId, "7123456789012345678");
    assert.equal(importSource.authorUsername, "dance");
  }
});
