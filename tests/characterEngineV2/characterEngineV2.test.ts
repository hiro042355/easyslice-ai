import test from "node:test";
import assert from "node:assert/strict";
import { CharacterEngineApiClient } from "../../lib/characterEngineV2/client";
import { CastingManager } from "../../lib/characterEngineV2/castingManager";
import { mapCharacterProjectStateToMVAssets, serializeCharacterProjectState, deserializeCharacterProjectState } from "../../lib/characterEngineV2/mvPipelineIntegration";

test("CharacterEngineApiClient fetches fixture character bible successfully", async () => {
  const client = new CharacterEngineApiClient();
  const res = await client.getCharacterBible("hero_2d");
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.characterId, "hero_2d");
    assert.equal(res.data.defaultDimensionMode, "2D");
    assert.equal(res.data.identityLockEnforced, true);
    assert.equal(res.data.revisions.length, 1);
  }
});

test("CharacterEngineApiClient handles 3D character dimension defaults", async () => {
  const client = new CharacterEngineApiClient();
  const res = await client.getCharacterBible("cyber_3d_hero");
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.defaultDimensionMode, "3D");
  }
});

test("CharacterEngineApiClient processes artwork upload", async () => {
  const client = new CharacterEngineApiClient();
  const uploadRes = await client.uploadArtwork("hero_2d", {
    name: "sketch.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  }, "2D");
  assert.equal(uploadRes.success, true);
  if (uploadRes.success) {
    assert.equal(uploadRes.data.dimensionMode, "2D");
    assert.equal(uploadRes.data.isUserUploaded, true);
  }
});

test("CastingManager manages character castings, revisions, and Identity Lock", () => {
  const manager = new CastingManager();
  manager.addCharacterBible({
    characterId: "char1",
    name: "Character One",
    safeLabel: "char1",
    description: "Test character",
    role: "protagonist",
    defaultDimensionMode: "2D",
    currentRevisionId: "rev1",
    revisions: [
      {
        revisionId: "rev1",
        revisionNumber: 1,
        summary: "v1",
        identityLockState: "locked",
        artworkRefs: [],
        createdAt: new Date().toISOString(),
      },
    ],
    identityLockEnforced: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const casting = manager.castCharacter("char1", "rev1", "3D", true);
  assert.equal(casting.dimensionMode, "3D");
  assert.equal(casting.identityLockEnforced, true);

  manager.toggleIdentityLock("char1", false);
  assert.equal(manager.getCasting("char1")?.identityLockEnforced, false);
});

test("CastingManager assigns multiple characters to scenes", () => {
  const manager = new CastingManager();
  manager.assignCharacterToScene("scene_1", "char1", "primary", "2D");
  manager.assignCharacterToScene("scene_1", "char2", "secondary", "3D");

  const assignments = manager.getSceneAssignments("scene_1");
  assert.equal(assignments.length, 2);
  assert.equal(assignments[0].characterId, "char1");
  assert.equal(assignments[1].characterId, "char2");
});

test("mvPipelineIntegration maps character state to MVScenePlannerAssets correctly", () => {
  const manager = new CastingManager();
  const bible = {
    characterId: "performer_1",
    name: "Singer",
    safeLabel: "performer_1",
    description: "Lead singer",
    role: "performer" as const,
    defaultDimensionMode: "2D" as const,
    currentRevisionId: "rev_singer_1",
    revisions: [
      {
        revisionId: "rev_singer_1",
        revisionNumber: 1,
        summary: "Singer identity",
        identityLockState: "locked" as const,
        identityLockHash: "hash_singer",
        artworkRefs: [{ artworkId: "art_singer", url: "/singer.png", mimeType: "image/png", dimensionMode: "2D" as const, uploadedAt: "" }],
        createdAt: "",
      },
    ],
    identityLockEnforced: true,
    createdAt: "",
    updatedAt: "",
  };
  manager.addCharacterBible(bible);
  manager.castCharacter("performer_1", "rev_singer_1", "2D", true);

  const mvAssets = mapCharacterProjectStateToMVAssets(manager.getState());
  assert.equal(mvAssets.characterAssets?.length, 1);
  assert.equal(mvAssets.performerAsset?.characterRef, "performer_1");
  assert.equal(mvAssets.performerAsset?.asset.checksum, "hash_singer");
});

test("Project persistence serialization and deserialization works seamlessly", () => {
  const manager = new CastingManager();
  manager.assignCharacterToScene("s1", "c1", "primary", "2D");
  const json = serializeCharacterProjectState(manager.getState());
  const restored = deserializeCharacterProjectState(json);
  assert.notEqual(restored, null);
  assert.equal(restored?.version, "2.0");
  assert.equal(restored?.sceneAssignments.length, 1);
});
