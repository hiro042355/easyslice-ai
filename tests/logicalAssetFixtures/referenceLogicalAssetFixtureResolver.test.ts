import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetResolutionPlan } from "@/lib/assets/assetResolutionPlan";
import { createReferenceAssetResolutionExecutor, createReferenceAssetStore, REFERENCE_ASSET_EXECUTION_CONTEXT } from "@/lib/assets/assetResolver";
import { createReferenceLogicalAssetFixture } from "@/lib/workflowFixtures/referenceLogicalAssetFixtureFactory";
import type { ReferenceLogicalAssetFixtureInput } from "@/lib/workflowFixtures/referenceLogicalAssetFixtureFactory";

const inputs: readonly ReferenceLogicalAssetFixtureInput[] = [
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-vocal", slot: "reference-voice", usage: "guide-vocal", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-music", slot: "reference-audio", usage: "audio-conditioning", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-mv", slot: "audio", usage: "audio-conditioning", requirement: "required" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-image-fixture-v1", operation: "generate-mv", slot: "reference-image", usage: "reference-image", requirement: "optional" },
  { fixtureVersion: "1.0", fixtureId: "reference-logical-video-fixture-v1", operation: "generate-mv", slot: "reference-video", usage: "reference-video", requirement: "optional" },
];

test("factory references resolve through the shared Store catalog", async () => {
  for (const input of inputs) {
    const fixture = createReferenceLogicalAssetFixture(input);
    assert.equal(fixture.status, "ready"); if (fixture.status !== "ready") continue;
    const purpose = input.operation === "generate-vocal" ? "vocal-generation" : input.operation === "generate-music" ? "music-generation" : "mv-generation";
    const requiresDimensions = fixture.asset.kind === "image" || fixture.asset.kind === "video";
    const plan = buildAssetResolutionPlan({ contractVersion: "1.0", items: [{ assetRef: fixture.asset, usage: fixture.usage, requirement: fixture.requirement }], purpose, accessRequirements: { preferredMode: "provider-fetch", allowedModes: ["provider-fetch"], requireChecksum: true, requireDurationMetadata: fixture.asset.kind === "audio" || fixture.asset.kind === "video", requireDimensions: requiresDimensions, requestedTtlSeconds: 600 }, policyContext: REFERENCE_ASSET_EXECUTION_CONTEXT.policyContext });
    assert.equal(plan.status, "planned"); if (plan.status !== "planned") continue;
    const result = await createReferenceAssetResolutionExecutor(createReferenceAssetStore()).execute(plan.plan, REFERENCE_ASSET_EXECUTION_CONTEXT);
    assert.equal(result.status, "resolved"); if (result.status !== "resolved") continue;
    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0].access.mode, "signed-url");
    assert.equal(result.assets[0].assetRef.assetId, fixture.asset.assetId);
    assert.equal(result.assets[0].integrity.checksumVerified, true);
    assert.notEqual(result.assets[0].assetRef, fixture.asset);
  }
});
