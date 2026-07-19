import { createDirectorDecision } from "@/lib/directorDecisionEngine";
import { createEmotionGraph } from "@/lib/emotionEngine";
import {
  createMVDecisionProjection,
  createMVScenePlan,
} from "@/lib/mvScenePlanner";
import { createMVScenePlanGate } from "@/lib/mvSceneGate/createMVScenePlanGate";
import {
  REFERENCE_MV_SCENE_PLAN_GATE_POLICY,
  type MVScenePlanGateInput,
} from "@/lib/mvSceneGate/types";

export function createGateFixture(): MVScenePlanGateInput {
  const emotionGraph = createEmotionGraph({
    story: "A traveler leaves a quiet room and walks toward sunrise.",
    theme: "hope after reflection",
    mood: "cinematic and warm",
    lyrics: "I carry yesterday and choose the morning light.",
    directorPreset: "cinematic",
  });
  const decision = createDirectorDecision({ emotionGraph, directorPreset: "cinematic" });
  const projection = createMVDecisionProjection(decision);
  const result = createMVScenePlan({
    contractVersion: "1.0",
    story: {
      schemaVersion: "1.0",
      summary: "A traveler leaves a quiet room and walks toward sunrise.",
      setting: { environment: "room", locationRef: "location-room" },
      endingIntent: "transformative",
    },
    lyrics: {
      schemaVersion: "1.0",
      language: "en",
      sections: [{ section: "outro", summary: "The traveler accepts the morning." }],
    },
    theme: "hope after reflection",
    directorDecision: projection,
    assets: {},
    constraints: {
      durationSeconds: 180,
      aspectRatio: "16:9",
      targetSceneCount: 10,
      maxSceneCount: 12,
      performanceMode: "narrative",
      reviewMode: "optional",
    },
  });
  if (result.status !== "planned") throw new Error("formal planner fixture must be planned");
  return {
    inputVersion: "1.0",
    plan: result.plan,
    projection,
    decision,
    policy: { ...REFERENCE_MV_SCENE_PLAN_GATE_POLICY },
    context: { contextVersion: "1.0", operationRef: "mv-scene-gate-test" },
  };
}

export function cloneFixture(): MVScenePlanGateInput {
  return structuredClone(createGateFixture());
}

export const runGate = (input: MVScenePlanGateInput) => createMVScenePlanGate(input);
