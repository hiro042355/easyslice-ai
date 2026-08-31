import { createDirectorDecision } from "@/lib/directorDecisionEngine";
import { createEmotionGraph } from "@/lib/emotionEngine";
import { createMVScenePlanGate } from "@/lib/mvSceneGate/createMVScenePlanGate";
import { REFERENCE_MV_SCENE_PLAN_GATE_POLICY } from "@/lib/mvSceneGate/types";
import { createMVDecisionProjection, createMVScenePlan } from "@/lib/mvScenePlanner";
import { REFERENCE_MUSIC_CAPABILITY, type ReferenceMusicAdapterInput, validateReferenceMusicInput } from "@/lib/providers/referenceMusicAdapter";
import { REFERENCE_MV_CAPABILITY, type ReferenceMVAdapterInput, validateReferenceMVInput } from "@/lib/providers/referenceMVAdapter";
import { REFERENCE_VOCAL_CAPABILITY, type ReferenceVocalAdapterInput, validateReferenceVocalInput } from "@/lib/providers/referenceVocalAdapter";
import { createMusicDecisionProjection, createVocalDecisionProjection } from "@/lib/providers/types";
import {
  createSensitiveCanonicalMusicWorkflowInput,
  createSensitiveCanonicalMVWorkflowInput,
  createSensitiveCanonicalVocalWorkflowInput,
} from "@/lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput";
import type {
  CanonicalWorkflowFixtureMetadata,
  CanonicalWorkflowFixtureResult,
  CanonicalWorkflowFixtureSeed,
} from "@/lib/workflowFixtures/types";
import type { ReferenceMusicWorkflowInput, ReferenceMVWorkflowInput, ReferenceVocalWorkflowInput } from "@/lib/workflows/types";

export const CANONICAL_WORKFLOW_FIXTURE_SEED: Readonly<CanonicalWorkflowFixtureSeed> = Object.freeze({
  fixtureVersion: "1.0", story: "A traveler leaves a quiet room and walks toward sunrise.",
  theme: "hope after reflection", mood: "cinematic and warm",
  lyrics: "I carry yesterday and choose the morning light.", language: "en",
  durationSeconds: 180, directorPreset: "cinematic",
});
const invalid = (): CanonicalWorkflowFixtureResult => ({ status: "invalid", issues: [{ reasonCode: "canonical-fixture-invalid" }] });
const metadata = (fixtureId: CanonicalWorkflowFixtureMetadata["fixtureId"]): CanonicalWorkflowFixtureMetadata => ({
  fixtureId, fixtureVersion: "1.0", directorPreset: "cinematic", durationClass: "standard",
});
const common = () => ({
  contractVersion: "1.0" as const, providerId: "reference-provider", providerApiVersion: "reference-api-v1",
  durationSeconds: CANONICAL_WORKFLOW_FIXTURE_SEED.durationSeconds,
  context: { contextVersion: "1.0" as const, operationRef: "canonical-workflow-fixture",
    baselineTime: "2026-01-01T00:00:00.000Z", attempt: 1, scenario: "success" as const },
});
export function createCanonicalDirectorFixture() {
  const seed = structuredClone(CANONICAL_WORKFLOW_FIXTURE_SEED);
  const emotionGraph = createEmotionGraph(seed);
  const decision = createDirectorDecision({ emotionGraph, directorPreset: seed.directorPreset });
  return { seed, emotionGraph, decision };
}
export function createCanonicalVocalWorkflowFixture(): CanonicalWorkflowFixtureResult {
  const { seed, decision } = createCanonicalDirectorFixture();
  const adapterInput: ReferenceVocalAdapterInput = { contractVersion: "1.0", projection: createVocalDecisionProjection(decision),
    assets: { lyrics: seed.lyrics, language: seed.language }, constraints: { durationSeconds: seed.durationSeconds, outputFormat: "wav", language: seed.language, voiceMode: "standard" }, capability: REFERENCE_VOCAL_CAPABILITY };
  if (validateReferenceVocalInput(adapterInput).status === "invalid") return invalid();
  const workflowInput: ReferenceVocalWorkflowInput = { ...common(), operation: "generate-vocal", adapterInput, assets: [] };
  const sensitive = createSensitiveCanonicalVocalWorkflowInput(workflowInput);
  return sensitive.status === "created" ? { status: "ready", operation: "generate-vocal", input: sensitive.value, metadata: metadata("canonical-vocal-success-v1") } : invalid();
}
export function createCanonicalMusicWorkflowFixture(): CanonicalWorkflowFixtureResult {
  const { seed, decision } = createCanonicalDirectorFixture();
  const adapterInput: ReferenceMusicAdapterInput = { contractVersion: "1.0", projection: createMusicDecisionProjection(decision),
    assets: { lyrics: seed.lyrics, theme: seed.theme }, constraints: { durationSeconds: seed.durationSeconds, outputFormat: "wav", lyricsMode: "use-lyrics", outputMode: "mix" }, capability: REFERENCE_MUSIC_CAPABILITY };
  if (validateReferenceMusicInput(adapterInput).status === "invalid") return invalid();
  const workflowInput: ReferenceMusicWorkflowInput = { ...common(), operation: "generate-music", adapterInput, assets: [] };
  const sensitive = createSensitiveCanonicalMusicWorkflowInput(workflowInput);
  return sensitive.status === "created" ? { status: "ready", operation: "generate-music", input: sensitive.value, metadata: metadata("canonical-music-success-v1") } : invalid();
}
export function createCanonicalMVWorkflowFixture(): CanonicalWorkflowFixtureResult {
  const { seed, decision } = createCanonicalDirectorFixture(); const projection = createMVDecisionProjection(decision);
  const planned = createMVScenePlan({ contractVersion: "1.0", story: { schemaVersion: "1.0", summary: seed.story, endingIntent: "transformative" },
    lyrics: { schemaVersion: "1.0", language: seed.language, sections: [{ section: "outro", summary: "Morning arrives." }] }, theme: seed.theme,
    directorDecision: projection, assets: {}, constraints: { durationSeconds: seed.durationSeconds, aspectRatio: "16:9", targetSceneCount: 10, maxSceneCount: 12 } });
  if (planned.status !== "planned") return invalid();
  const gate = createMVScenePlanGate({ inputVersion: "1.0", plan: planned.plan, projection, decision,
    policy: { ...REFERENCE_MV_SCENE_PLAN_GATE_POLICY }, context: { contextVersion: "1.0", operationRef: "canonical-mv-gate" } });
  if (!gate.allowed) return invalid();
  const audio = { assetId: "audio-canonical", kind: "audio" as const, mimeType: "audio/wav", durationSeconds: seed.durationSeconds };
  const adapterInput: ReferenceMVAdapterInput = { contractVersion: "1.0", projection, scenePlan: planned.plan, gate,
    assets: { audioAsset: audio }, constraints: { durationSeconds: seed.durationSeconds, aspectRatio: "16:9", resolution: "1080p", frameRate: 30, outputFormat: "mp4" }, capability: REFERENCE_MV_CAPABILITY };
  if (validateReferenceMVInput(adapterInput).status === "invalid") return invalid();
  const workflowInput: ReferenceMVWorkflowInput = { ...common(), operation: "generate-mv", adapterInput, assets: [audio] };
  const sensitive = createSensitiveCanonicalMVWorkflowInput(workflowInput);
  return sensitive.status === "created" ? { status: "ready", operation: "generate-mv", input: sensitive.value, metadata: metadata("canonical-mv-success-v1") } : invalid();
}
