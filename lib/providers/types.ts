import type {
  DecisionValidation,
  DirectorDecision,
  MusicDirection,
  OverallDirection,
  SectionDirection,
  VocalDirection,
} from "@/lib/directorDecisionEngine";
import type { DirectorPreset } from "@/lib/emotionEngine";
import type { MusicLyricsMode } from "@/lib/providerRequests/types";
export type { MusicLyricsMode } from "@/lib/providerRequests/types";
import type {
  AssetKind,
  AssetReference,
  AspectRatio,
  CharacterAssetReference,
  LocationAssetReference,
} from "@/lib/mvContracts";
export type { AssetKind, AssetReference } from "@/lib/mvContracts";

export type AdapterValidationStatus =
  | "valid" | "degraded" | "unsupported" | "invalid";
export type AdapterBuildStatus =
  | "ready" | "degraded" | "unsupported" | "invalid";
export type AdapterIssueClassification = "invalid" | "unsupported";

export type AdapterReasonCode =
  | "unsupported-label-approximated"
  | "unsupported-label-omitted"
  | "unsupported-field-omitted"
  | "score-range-clamped"
  | "timeline-control-unavailable"
  | "section-control-collapsed"
  | "duration-clamped"
  | "format-substituted"
  | "language-unsupported"
  | "required-asset-missing"
  | "decision-schema-unsupported"
  | "decision-fallback-review-required"
  | "capability-version-unsupported"
  | "capability-fallback"
  | "provider-limit-applied"
  | "seed-omitted"
  | "prompt-rendering-used"
  | "scene-plan-gate-denied"
  | "scene-plan-schema-unsupported"
  | "scene-plan-invalid"
  | "scene-plan-normalized"
  | "scene-plan-fallback"
  | "scene-timeline-invalid"
  | "scene-main-peak-invalid"
  | "scene-afterglow-invalid"
  | "scene-asset-missing"
  | "audio-duration-mismatch"
  | "aspect-ratio-mismatch"
  | "aspect-ratio-unsupported"
  | "resolution-substituted"
  | "frame-rate-substituted"
  | "multi-scene-unsupported"
  | "scene-control-unavailable"
  | "character-consistency-unavailable"
  | "reference-image-omitted"
  | "reference-video-omitted"
  | "required-performer-asset-missing";

export type AdapterWarning = {
  code: AdapterReasonCode;
  sourceField?: string;
  targetField?: string;
  summary: string;
};

export type AdapterIssue = {
  code: AdapterReasonCode;
  classification: AdapterIssueClassification;
  sourceField?: string;
  summary: string;
};

export type AdapterMappingKind =
  | "exact"
  | "normalized"
  | "clamped"
  | "approximate"
  | "fallback"
  | "omitted"
  | "collapsed";

export type AdapterMappingRecord = {
  sourceField: string;
  sourceValue?: string | number | boolean;
  targetField?: string;
  targetValue?: string | number | boolean;
  mapping: AdapterMappingKind;
  reasonCode?: AdapterReasonCode;
};

export type LabelMappingResult<T> = {
  value?: T;
  mapping: "exact" | "approximate" | "fallback" | "omitted";
  reasonCode?: AdapterReasonCode;
};

export type AdapterValidation = {
  status: AdapterValidationStatus;
  errors: AdapterIssue[];
  warnings: AdapterWarning[];
  reviewRequired: boolean;
};

export type ProviderCapabilityBase = {
  providerId: string;
  capabilityVersion: string;
  providerApiVersion?: string;
  supportedInputFormats: readonly string[];
  supportedOutputFormats: readonly string[];
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  supportsSeed: boolean;
  supportsSectionControl: boolean;
  supportsTimelineControl: boolean;
  supportsStructuredParameters: boolean;
  supportsTextPrompt: boolean;
  extensions?: Readonly<Record<string, unknown>>;
};

export type VocalProviderCapability = ProviderCapabilityBase & {
  kind: "vocal";
  supportsLyrics: boolean;
  supportsPhonemeControl: boolean;
  supportsBreathiness: boolean;
  supportsVibrato: boolean;
  supportsArticulation: boolean;
  supportsDynamics: boolean;
  supportsSectionDynamics: boolean;
  supportsReferenceVoice: boolean;
  supportsGuideMelody: boolean;
  supportedLanguages: readonly string[];
  supportedVoiceModes: readonly string[];
  supportedAudioFormats: readonly string[];
};

export type MusicProviderCapability = ProviderCapabilityBase & {
  kind: "music";
  supportsTempoRange: boolean;
  supportsExactBpm: boolean;
  minBpm: number;
  maxBpm: number;
  supportsSectionEnergy: boolean;
  supportsInstrumentationControl: boolean;
  supportsRhythmIntensity: boolean;
  supportsHarmonicTension: boolean;
  supportsDynamicRange: boolean;
  supportsStemOutput: boolean;
  supportsLyrics: boolean;
  supportsReferenceAudio: boolean;
  supportsGuideVocal: boolean;
  supportsDurationControl: boolean;
  supportedAudioFormats: readonly string[];
};

export type MVResolution = "720p" | "1080p" | "2160p";
export type MVFrameRate = 24 | 30 | 60;
export type MVOutputFormat = "mp4" | "webm";
export type MVProviderCapability = ProviderCapabilityBase & {
  kind: "mv";
  scene: Readonly<{
    supportsMultiScene: boolean;
    supportsSceneControl: boolean;
    supportsShotList: boolean;
  }>;
  visual: Readonly<{
    supportsCameraEnergy: boolean;
    supportsMovementControl: boolean;
    supportsLightingControl: boolean;
    supportsColorControl: boolean;
    supportsTransitionControl: boolean;
    supportsSubjectControl: boolean;
    supportsEnvironmentControl: boolean;
  }>;
  continuity: Readonly<{
    supportsCharacterConsistency: boolean;
    supportsReferenceImage: boolean;
    supportsReferenceVideo: boolean;
    supportsFirstFrame: boolean;
    supportsLastFrame: boolean;
  }>;
  media: Readonly<{ supportsAudioConditioning: boolean }>;
  output: Readonly<{
    supportedAspectRatios: readonly AspectRatio[];
    supportedResolutions: readonly MVResolution[];
    supportedFrameRates: readonly MVFrameRate[];
    supportedFormats: readonly MVOutputFormat[];
  }>;
  maxReferenceImages: number;
};

export type GenerationQuality = "draft" | "standard" | "high";
export type VocalWorkflowAssets = {
  lyrics: string;
  language: string;
  pronunciationHints?: readonly string[];
  referenceVoiceAsset?: AssetReference;
  guideMelodyAsset?: AssetReference;
};

export type VocalGenerationConstraints = {
  durationSeconds: number;
  outputFormat: string;
  quality?: GenerationQuality;
  seed?: number;
  language: string;
  voiceMode?: string;
};

export type MusicWorkflowAssets = {
  lyrics?: string;
  theme?: string;
  referenceAudioAsset?: AssetReference;
  guideVocalAsset?: AssetReference;
};

export type MusicGenerationConstraints = {
  durationSeconds: number;
  outputFormat: string;
  quality?: GenerationQuality;
  seed?: number;
  lyricsMode?: MusicLyricsMode;
  outputMode?: MusicOutputMode;
};

export type MusicOutputMode = "mix" | "stems";

export type MVWorkflowAssets = {
  audioAsset: AssetReference;
  referenceImages?: readonly AssetReference[];
  referenceVideo?: AssetReference;
  characterAssets?: readonly CharacterAssetReference[];
  locationAssets?: readonly LocationAssetReference[];
  brandAssets?: readonly AssetReference[];
  performerAsset?: CharacterAssetReference;
};
export type MVGenerationConstraints = {
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: MVResolution;
  frameRate?: MVFrameRate;
  outputFormat: MVOutputFormat;
  quality?: GenerationQuality;
  seed?: number;
};

export type DecisionProjectionBase = {
  decisionSchemaVersion: string;
  engineVersion: string;
  normalizedPreset: DirectorPreset;
  overallDirection: OverallDirection;
  sectionDirections: SectionDirection[];
  validation: DecisionValidation;
  confidence: number;
};

export type VocalDecisionProjection = DecisionProjectionBase & {
  direction: VocalDirection;
};

export type MusicDecisionProjection = DecisionProjectionBase & {
  direction: MusicDirection;
};

export type ProviderAdapterInput<
  TProjection,
  TAssets,
  TConstraints,
  TCapability extends ProviderCapabilityBase,
> = {
  contractVersion: "1.0";
  projection: TProjection;
  assets: TAssets;
  constraints: TConstraints;
  capability: TCapability;
};

export type AdapterBuildResult<
  TRequest,
  TCapability extends ProviderCapabilityBase = ProviderCapabilityBase,
> = {
  contractVersion: "1.0";
  status: AdapterBuildStatus;
  // Contains generation material and must not be persisted as a normal audit log.
  request?: TRequest;
  warnings: AdapterWarning[];
  errors: AdapterIssue[];
  mappings: AdapterMappingRecord[];
  fallbackUsed: boolean;
  omittedFields: string[];
  approximatedFields: string[];
  capabilitySnapshot: TCapability;
  adapterId: string;
  adapterVersion: string;
  reviewRequired: boolean;
};

export type ProviderErrorCategory =
  | "authentication"
  | "rate-limit"
  | "invalid-request"
  | "unsupported"
  | "content-policy"
  | "timeout"
  | "provider-unavailable"
  | "generation-failed"
  | "cancelled"
  | "unknown";

export type NormalizedProviderError = {
  category: ProviderErrorCategory;
  code?: string;
  message: string;
  retryable: boolean;
  safeDetails?: SafeProviderMetadata;
};

export type SafeProviderMetadata = Readonly<
  Record<string, string | number | boolean>
>;

export type GeneratedAssetReference = AssetReference & {
  role: "primary" | "alternate" | "stem" | "preview";
};

export type NormalizedGenerationResult = {
  resultSchemaVersion: "1.0";
  status: "completed" | "partial" | "failed";
  providerId: string;
  adapterId: string;
  adapterVersion: string;
  outputs: GeneratedAssetReference[];
  warnings: AdapterWarning[];
  error?: NormalizedProviderError;
  providerJobReference?: string;
  safeProviderMetadata?: SafeProviderMetadata;
};

export type ProviderAdapter<
  TProjection,
  TAssets,
  TConstraints,
  TCapability extends ProviderCapabilityBase,
  TRequest,
  TResponse,
  TResult,
> = {
  contractVersion: "1.0";
  adapterId: string;
  adapterVersion: string;
  providerId: string;
  providerApiVersion?: string;
  supportedDecisionSchemaVersions: readonly string[];
  validateInput(
    input: ProviderAdapterInput<
      TProjection,
      TAssets,
      TConstraints,
      TCapability
    >,
  ): AdapterValidation;
  buildRequest(
    input: ProviderAdapterInput<
      TProjection,
      TAssets,
      TConstraints,
      TCapability
    >,
  ): AdapterBuildResult<TRequest, TCapability>;
  normalizeResponse(response: TResponse): TResult;
  normalizeError(error: unknown): NormalizedProviderError;
};

export function createVocalDecisionProjection(
  decision: DirectorDecision,
): VocalDecisionProjection {
  return {
    decisionSchemaVersion: decision.schemaVersion,
    engineVersion: decision.engineVersion,
    normalizedPreset: decision.normalizedPreset,
    overallDirection: {
      ...decision.overallDirection,
      afterglow: { ...decision.overallDirection.afterglow },
    },
    sectionDirections: decision.sectionDirections.map((section) => ({
      ...section,
    })),
    validation: {
      status: decision.validation.status,
      issueCodes: [...decision.validation.issueCodes],
    },
    confidence: decision.overallDirection.confidence,
    direction: { ...decision.vocalDirection },
  };
}

export function createMusicDecisionProjection(
  decision: DirectorDecision,
): MusicDecisionProjection {
  return {
    decisionSchemaVersion: decision.schemaVersion,
    engineVersion: decision.engineVersion,
    normalizedPreset: decision.normalizedPreset,
    overallDirection: {
      ...decision.overallDirection,
      afterglow: { ...decision.overallDirection.afterglow },
    },
    sectionDirections: decision.sectionDirections.map((section) => ({
      ...section,
    })),
    validation: {
      status: decision.validation.status,
      issueCodes: [...decision.validation.issueCodes],
    },
    confidence: decision.overallDirection.confidence,
    direction: {
      ...decision.musicDirection,
      tempoRange: { ...decision.musicDirection.tempoRange },
      sectionMovement: decision.musicDirection.sectionMovement.map(
        (movement) => ({ ...movement }),
      ),
    },
  };
}
