import type { Sensitive } from "@/lib/assets/types";
import type {
  SectionDirection,
  SectionPurpose,
} from "@/lib/directorDecisionEngine";
import type { SupportedEmotion } from "@/lib/emotionEngine";
import type {
  MVDecisionProjection,
  MVScene,
  MVScenePlan,
  SceneAction,
  SceneNarrativePurpose,
  SceneSetting,
  SceneSubject,
  TemporalMode,
  VisualMotif,
} from "@/lib/mvContracts";

export type ProviderOperation =
  | "generate-vocal"
  | "generate-music"
  | "generate-mv";

export type MaterializedProviderRequest<TBody> = Sensitive<{
  requestVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  body: TBody;
  assetAccessCount: number;
  earliestAssetExpiry?: string;
  materialization: {
    status: "complete";
    unresolvedAssetCount: 0;
  };
}>;

export type ExecutableProviderRequest<TBody> =
  MaterializedProviderRequest<TBody>;

export type ReferenceVocalDelivery =
  | "intimate"
  | "controlled"
  | "open";
export type ReferenceVocalDynamics =
  | "narrow"
  | "gradual"
  | "wide"
  | "late-expansion";
export type ReferenceVocalArticulation =
  | "soft"
  | "natural"
  | "clear";
export type ReferenceVocalPeakTreatment =
  | "lift"
  | "sustain"
  | "vulnerable-focus";
export type ReferenceVocalOutroTreatment =
  | "release"
  | "sustained"
  | "resolved";

export type ReferenceVocalSectionInstruction = {
  section: SectionDirection["section"];
  startSeconds: number;
  endSeconds: number;
  vocalIntensity: number;
  tension: number;
  release: number;
  isMainPeak: boolean;
};

export type ReferenceVocalRequest = {
  requestSchemaVersion: "1.0";
  language: string;
  lyrics: string;
  durationSeconds: number;
  outputFormat: "wav" | "mp3";
  performance: {
    delivery: ReferenceVocalDelivery;
    dynamics: ReferenceVocalDynamics;
    breathiness: number;
    vibrato: number;
    articulation: ReferenceVocalArticulation;
    emotionalExpression: SupportedEmotion;
  };
  timeline: ReferenceVocalSectionInstruction[];
  peakTreatment: ReferenceVocalPeakTreatment;
  outroTreatment: ReferenceVocalOutroTreatment;
  referenceVoiceAssetId?: string;
  guideMelodyAssetId?: string;
};

export type MusicLyricsMode = "none" | "instrumental" | "use-lyrics";
export type ReferenceMusicEnergyCurve =
  | "steady-rise"
  | "rise-and-release"
  | "quiet-resolution";
export type ReferenceMusicDynamicRange =
  | "narrow"
  | "moderate"
  | "wide";
export type ReferenceMusicPeakTreatment =
  | "full-arrangement"
  | "harmonic-release"
  | "intentional-space";
export type ReferenceMusicAfterglowTreatment =
  | "thin-texture"
  | "long-decay"
  | "gentle-pulse";
export type ReferenceMusicDensityChange = "reduce" | "hold" | "add";
export type ReferenceMusicTransition = "hold" | "gentle" | "build";

export type ReferenceMusicSectionInstruction = {
  section: SectionDirection["section"];
  startSeconds: number;
  endSeconds: number;
  musicIntensity: number;
  tension: number;
  release: number;
  densityChange: ReferenceMusicDensityChange;
  transitionStyle: ReferenceMusicTransition;
  purpose: SectionPurpose;
  isMainPeak: boolean;
};

export type ReferenceMusicRequest = {
  requestSchemaVersion: "1.0";
  durationSeconds: number;
  outputFormat: "wav" | "mp3";
  outputMode: "mix";
  lyricsMode: MusicLyricsMode;
  tempo: {
    minBpm: number;
    maxBpm: number;
    targetBpm: number;
  };
  performance: {
    energyCurve: ReferenceMusicEnergyCurve;
    instrumentationDensity: number;
    rhythmIntensity: number;
    harmonicTension: number;
    dynamicRange: ReferenceMusicDynamicRange;
  };
  timeline: ReferenceMusicSectionInstruction[];
  peakTreatment: ReferenceMusicPeakTreatment;
  afterglowTreatment: ReferenceMusicAfterglowTreatment;
  lyrics?: string;
  referenceAudioAssetId?: string;
};

export type ReferenceMVGlobalDirection = {
  visualMood: MVDecisionProjection["direction"]["visualMood"];
  color: MVDecisionProjection["direction"]["colorDirection"];
  lighting: MVDecisionProjection["direction"]["lightingDirection"];
  cameraEnergy: number;
  movement: MVDecisionProjection["direction"]["movementStyle"];
  shotDensity: number;
  transitionIntensity: number;
  subjectFocus: MVDecisionProjection["direction"]["subjectFocus"];
  environment: MVDecisionProjection["direction"]["environmentDirection"];
};

export type ReferenceMVSceneInstruction = {
  sceneId: string;
  section: MVScene["section"];
  startSeconds: number;
  endSeconds: number;
  narrativePurpose: SceneNarrativePurpose;
  subject: SceneSubject;
  setting: SceneSetting;
  action: SceneAction;
  emotionalIntent: MVScene["emotionalIntent"];
  temporalMode: TemporalMode;
  visualMotif?: VisualMotif;
  visualIntensity: number;
  cameraEnergy: number;
  transitionIntensity: number;
  isMainPeak: boolean;
  isAfterglow: boolean;
  assetIds: string[];
};

export type ReferenceMVRequest = {
  requestSchemaVersion: "1.0";
  durationSeconds: number;
  aspectRatio: MVScenePlan["aspectRatio"];
  resolution: "720p" | "1080p";
  frameRate: 24 | 30;
  outputFormat: "mp4";
  audioAssetId: string;
  globalDirection: ReferenceMVGlobalDirection;
  scenes: ReferenceMVSceneInstruction[];
  peak: {
    sceneId: string;
    treatment: MVDecisionProjection["direction"]["mainPeakTreatment"];
  };
  afterglow: {
    sceneId: string;
    treatment: MVDecisionProjection["direction"]["afterglowTreatment"];
  };
};
