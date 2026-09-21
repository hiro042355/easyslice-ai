import { createDirectorDecision } from "@/lib/directorDecisionEngine";
import { createEmotionGraph } from "@/lib/emotionEngine";
import { createMVScenePlanGate } from "@/lib/mvSceneGate/createMVScenePlanGate";
import { REFERENCE_MV_SCENE_PLAN_GATE_POLICY } from "@/lib/mvSceneGate/types";
import { createMVDecisionProjection, createMVScenePlan } from "@/lib/mvScenePlanner";
import {
  REFERENCE_MUSIC_CAPABILITY,
  type ReferenceMusicAdapterInput,
} from "@/lib/providers/referenceMusicAdapter";
import {
  REFERENCE_MV_CAPABILITY,
  type ReferenceMVAdapterInput,
} from "@/lib/providers/referenceMVAdapter";
import {
  REFERENCE_VOCAL_CAPABILITY,
  type ReferenceVocalAdapterInput,
} from "@/lib/providers/referenceVocalAdapter";
import {
  createMusicDecisionProjection,
  createVocalDecisionProjection,
} from "@/lib/providers/types";
import type {
  ReferenceMusicWorkflowInput,
  ReferenceMVWorkflowInput,
  ReferenceVocalWorkflowInput,
} from "@/lib/workflows/referenceWorkflowTypes";

const graph = createEmotionGraph({
  story: "A traveler walks from a quiet room toward the morning.",
  theme: "hope",
  mood: "cinematic",
  lyrics: "I choose the morning light.",
  directorPreset: "cinematic",
});
const decision = createDirectorDecision({ emotionGraph: graph, directorPreset: "cinematic" });
const common = {
  contractVersion: "1.0" as const,
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  durationSeconds: 180,
  context: {
    contextVersion: "1.0" as const,
    operationRef: "sensitive-boundary-fixture",
    baselineTime: "2026-01-01T00:00:00.000Z",
    attempt: 1,
    scenario: "success" as const,
  },
};

export function vocalInput(): ReferenceVocalWorkflowInput {
  const adapterInput: ReferenceVocalAdapterInput = {
    contractVersion: "1.0",
    projection: createVocalDecisionProjection(decision),
    assets: { lyrics: "I choose the morning light.", language: "en" },
    constraints: { durationSeconds: 180, outputFormat: "wav", language: "en", voiceMode: "standard" },
    capability: REFERENCE_VOCAL_CAPABILITY,
  };
  return structuredClone({ ...common, operation: "generate-vocal", adapterInput, assets: [] });
}

export function musicInput(): ReferenceMusicWorkflowInput {
  const adapterInput: ReferenceMusicAdapterInput = {
    contractVersion: "1.0",
    projection: createMusicDecisionProjection(decision),
    assets: { lyrics: "I choose the morning light.", theme: "hope" },
    constraints: { durationSeconds: 180, outputFormat: "wav", lyricsMode: "use-lyrics", outputMode: "mix" },
    capability: REFERENCE_MUSIC_CAPABILITY,
  };
  return structuredClone({ ...common, operation: "generate-music", adapterInput, assets: [] });
}

export function mvInput(): ReferenceMVWorkflowInput {
  const projection = createMVDecisionProjection(decision);
  const planned = createMVScenePlan({
    contractVersion: "1.0",
    story: { schemaVersion: "1.0", summary: "A traveler walks toward morning.", endingIntent: "transformative" },
    lyrics: { schemaVersion: "1.0", language: "en", sections: [{ section: "outro", summary: "Morning arrives." }] },
    theme: "hope",
    directorDecision: projection,
    assets: {},
    constraints: { durationSeconds: 180, aspectRatio: "16:9", targetSceneCount: 10, maxSceneCount: 12 },
  });
  if (planned.status !== "planned") throw new Error("formal MV fixture must plan");
  const gate = createMVScenePlanGate({
    inputVersion: "1.0",
    plan: planned.plan,
    projection,
    decision,
    policy: { ...REFERENCE_MV_SCENE_PLAN_GATE_POLICY },
    context: { contextVersion: "1.0", operationRef: "sensitive-boundary-gate" },
  });
  const audio = { assetId: "audio-canonical", kind: "audio" as const, mimeType: "audio/wav", durationSeconds: 180 };
  const adapterInput: ReferenceMVAdapterInput = {
    contractVersion: "1.0",
    projection,
    scenePlan: planned.plan,
    gate,
    assets: { audioAsset: audio },
    constraints: { durationSeconds: 180, aspectRatio: "16:9", resolution: "1080p", frameRate: 30, outputFormat: "mp4" },
    capability: REFERENCE_MV_CAPABILITY,
  };
  return structuredClone({ ...common, operation: "generate-mv", adapterInput, assets: [audio] });
}
