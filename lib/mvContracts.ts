import type {
  DecisionValidation, MVDirection, OverallDirection, SectionDirection,
} from "@/lib/directorDecisionEngine";
import type {
  DirectorPreset, EmotionSectionName, SupportedEmotion,
} from "@/lib/emotionEngine";

export type AssetKind =
  | "audio" | "voice" | "image" | "video"
  | "character" | "brand" | "melody";
export type AssetReference = {
  assetId: string;
  kind: AssetKind;
  mimeType?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  checksum?: string;
};
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type PerformanceMode = "narrative" | "performance" | "hybrid";
export type VisualContinuityMode = "light" | "balanced" | "strict";
export type NarrativeArc =
  | "linear" | "memory-fragment" | "parallel" | "circular"
  | "transformation" | "symbolic" | "performance-driven";
export type PointOfView = "first-person" | "third-person" | "observational";
export type EndingIntent = "resolved" | "open" | "circular" | "transformative";
export type StoryCharacterRole =
  | "protagonist" | "supporting" | "antagonistic-force" | "performer";
export type StoryEventKind =
  | "establish" | "change" | "conflict" | "reveal" | "choice" | "resolution";
export type EnvironmentType =
  | "home" | "room" | "street" | "city" | "nature" | "shore"
  | "stage" | "studio" | "transit" | "abstract-space" | "unspecified";
export type StoryCharacter = {
  characterId: string; role: StoryCharacterRole; safeLabel: string;
};
export type StorySetting = { environment: EnvironmentType; locationRef?: string };
export type StoryEvent = {
  eventId: string; order: number; kind: StoryEventKind; summary: string;
  characterRefs?: string[];
};
export type StoryInput = {
  schemaVersion: "1.0"; summary: string; characters?: StoryCharacter[];
  setting?: StorySetting; events?: StoryEvent[]; pointOfView?: PointOfView;
  endingIntent?: EndingIntent;
};
export type LyricsSection = {
  section: EmotionSectionName; summary: string; keywords?: string[];
  characterRefs?: string[]; endingTag?: EndingIntent;
};
export type LyricsInput = {
  schemaVersion: "1.0"; fullText?: string; language?: string;
  sections?: LyricsSection[];
};
export type MVDecisionProjection = {
  decisionSchemaVersion: string;
  engineVersion: string;
  normalizedPreset: DirectorPreset;
  overallDirection: OverallDirection;
  sectionDirections: SectionDirection[];
  validation: DecisionValidation;
  confidence: number;
  direction: MVDirection;
};
export type CharacterContinuityRole =
  | "identity-primary" | "identity-alternate" | "appearance" | "costume";
export type CharacterAssetReference = {
  characterRef: string; asset: AssetReference;
  continuityRole: CharacterContinuityRole;
};
export type LocationAssetReference = {
  locationRef: string; asset: AssetReference;
};
export type MVScenePlannerAssets = {
  referenceImages?: readonly AssetReference[]; referenceVideo?: AssetReference;
  characterAssets?: readonly CharacterAssetReference[];
  locationAssets?: readonly LocationAssetReference[];
  brandAssets?: readonly AssetReference[];
  performerAsset?: CharacterAssetReference; audioAsset?: AssetReference;
};
export type MVScenePlannerConstraints = {
  durationSeconds: number; aspectRatio: AspectRatio;
  targetSceneCount?: number; maxSceneCount?: number;
  maxCharacterCount?: number; maxLocationCount?: number;
  visualContinuityMode?: VisualContinuityMode;
  visualComplexity?: "simple" | "balanced" | "layered";
  performanceMode?: PerformanceMode; brandSafety?: "standard" | "strict";
  sensitiveContentMode?: "block" | "review";
  sensitiveContentDetected?: boolean; reviewMode?: "required" | "optional";
};
export type MVScenePlannerInput = {
  contractVersion: "1.0"; story: StoryInput; lyrics?: LyricsInput;
  theme?: string; directorDecision: MVDecisionProjection;
  assets: MVScenePlannerAssets; constraints: MVScenePlannerConstraints;
};

export type BuiltInVisualMotif =
  | "light" | "rain" | "mirror" | "road" | "flower" | "sky"
  | "water" | "fire" | "shadow" | "door" | "photograph" | "empty-room";
export type VisualMotif =
  | { kind: BuiltInVisualMotif }
  | { kind: "custom"; motifId: string; safeLabel: string };
export type SceneNarrativePurpose =
  | "establish" | "introduce-subject" | "develop" | "contrast"
  | "reveal" | "turn" | "climax" | "release" | "resolve"
  | "afterglow" | "perform";
export type SceneSubject =
  | { type: "character"; characterRef: string }
  | { type: "object"; objectKind: string; safeDescription?: string }
  | { type: "environment"; environment: EnvironmentType }
  | { type: "abstract"; motif: VisualMotif }
  | { type: "performance"; performerRef?: string }
  | { type: "none" };
export type SceneSetting = {
  environment: EnvironmentType; locationRef?: string;
  timeOfDay?: "dawn" | "day" | "dusk" | "night" | "timeless";
  weather?: "clear" | "clouded" | "rain" | "snow" | "mist" | "none";
  spaceType?: "interior" | "exterior" | "mixed" | "abstract";
};
export type SceneActionType =
  | "observe" | "move" | "search" | "remember" | "choose"
  | "connect" | "separate" | "reveal" | "transform" | "perform"
  | "pause" | "depart" | "arrive";
export type SceneAction = {
  actionType: SceneActionType; safeDescription?: string;
  direction?: "toward" | "away" | "across" | "still";
  interaction?: "none" | "environment" | "object" | "character" | "audience";
};
export type TemporalMode =
  | "present" | "flashback" | "dream" | "memory"
  | "parallel" | "time-jump" | "loop";
export type ContinuityReference = {
  kind: "character" | "location" | "motif" | "temporal"; ref: string;
  relation: "preserve" | "return" | "progress" | "contrast";
};
export type SceneAssetReference = {
  assetId: string;
  role: "subject" | "identity" | "location" | "motif" | "style-reference";
};
export type MVScenePlannerReasonCode =
  | "story-structure-derived" | "lyrics-section-aligned"
  | "director-section-aligned" | "main-peak-scene-assigned"
  | "afterglow-scene-preserved" | "character-continuity-applied"
  | "environment-continuity-applied" | "asset-reference-assigned"
  | "performance-scene-inserted" | "scene-count-reduced"
  | "scene-count-expanded" | "missing-story-fallback"
  | "unknown-character-fallback" | "continuity-fallback"
  | "main-peak-scene-fallback" | "afterglow-scene-fallback";
export type SceneReviewNote = { code: MVScenePlannerReasonCode; summary: string };
export type MVScene = {
  sceneId: string; order: number; section: EmotionSectionName;
  startRatio: number; endRatio: number; startSeconds: number; endSeconds: number;
  narrativePurpose: SceneNarrativePurpose; subject: SceneSubject;
  setting: SceneSetting; action: SceneAction; emotionalIntent: SupportedEmotion;
  temporalMode: TemporalMode; visualMotif?: VisualMotif;
  continuityRefs: ContinuityReference[]; assetRefs: SceneAssetReference[];
  isMainPeak: boolean; isAfterglow: boolean; reviewNotes?: SceneReviewNote[];
};
export type CharacterStateChange = {
  section: EmotionSectionName;
  state: "stable" | "distressed" | "resolute" | "released";
};
export type CharacterContinuity = {
  characterRef: string; identityIntent: "preserve";
  appearanceIntent: "stable" | "story-change";
  costumeIntent: "stable" | "section-change" | "story-change";
  stateProgression: CharacterStateChange[];
};
export type EnvironmentContinuity = {
  primaryLocationRef?: string; repeatedLocationRefs: string[];
  timeProgression: "stable" | "forward" | "nonlinear" | "timeless";
  weatherProgression: "stable" | "change-on-event";
  afterglowLocationRule: "preserve-final" | "return-origin" | "symbolic-space";
};
export type TemporalTransition = {
  fromSceneId: string; toSceneId: string;
  kind: "continue" | "flashback" | "return" | "parallel-cut" | "loop-close";
};
export type TemporalContinuity = {
  defaultMode: TemporalMode; allowedTransitions: TemporalTransition[];
};
export type ContinuityPlan = {
  characters: CharacterContinuity[]; environment: EnvironmentContinuity;
  temporal: TemporalContinuity;
};
export type MVScenePlanValidationStatus =
  | "valid" | "normalized" | "fallback" | "invalid";
export type MVScenePlannerIssueCode =
  | "unsupported-input-version" | "missing-story-and-lyrics"
  | "missing-story-fallback" | "missing-lyrics"
  | "structured-story-lyrics-conflict" | "invalid-duration"
  | "audio-duration-mismatch" | "invalid-aspect-ratio"
  | "invalid-scene-count" | "duplicate-scene-id"
  | "invalid-scene-order" | "invalid-section-order"
  | "invalid-scene-timing" | "non-contiguous-scenes"
  | "invalid-main-peak-scene" | "missing-afterglow-scene"
  | "invalid-character-reference" | "invalid-location-reference"
  | "invalid-asset-reference" | "missing-assigned-asset"
  | "invalid-continuity-reference" | "scene-count-reduced"
  | "performance-asset-missing" | "sensitive-content-review-required"
  | "director-decision-normalized" | "director-decision-fallback";
export type MVScenePlanValidation = {
  status: MVScenePlanValidationStatus; issueCodes: MVScenePlannerIssueCode[];
};
export type MVScenePlanSummary = {
  code: MVScenePlannerReasonCode; scope: "plan" | "section" | "scene";
  section?: EmotionSectionName; sceneId?: string; summary: string;
};
export type MVScenePlanRationale = {
  reasonCodes: MVScenePlannerReasonCode[]; summaries: MVScenePlanSummary[];
};
export type MVScenePlan = {
  schemaVersion: "1.0"; plannerVersion: "rule-v1";
  sourceDecisionSchemaVersion: string; durationSeconds: number;
  aspectRatio: AspectRatio; narrativeArc: NarrativeArc;
  continuity: ContinuityPlan; scenes: MVScene[];
  rationale: MVScenePlanRationale; validation: MVScenePlanValidation;
  confidence: number; reviewRequired: boolean;
};
export type MVScenePlanResult =
  | { status: "planned"; plan: MVScenePlan }
  | { status: "invalid"; validation: MVScenePlanValidation;
      confidence: 0; reviewRequired: false };
export type MVScenePlanGateReasonCode =
  | "scene-plan-invalid" | "scene-plan-review-pending"
  | "scene-plan-rejected" | "scene-plan-normalized-review-required"
  | "scene-plan-fallback-review-required" | "scene-plan-approval-stale"
  | "scene-plan-approved" | "scene-plan-ready";
export type MVScenePlanGateResult = {
  allowed: boolean; reviewRequired: boolean;
  reasonCodes: MVScenePlanGateReasonCode[];
};
