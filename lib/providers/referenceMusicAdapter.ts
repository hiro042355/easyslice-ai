import type {
  DensityChange,
  IntensityCurve,
  MusicAfterglowTreatment,
  MusicPeakTreatment,
  TransitionStyle,
} from "@/lib/directorDecisionEngine";
import type {
  ReferenceMusicRequest,
} from "@/lib/providerRequests/types";
export type {
  ReferenceMusicAfterglowTreatment,
  ReferenceMusicDensityChange,
  ReferenceMusicDynamicRange,
  ReferenceMusicEnergyCurve,
  ReferenceMusicPeakTreatment,
  ReferenceMusicRequest,
  ReferenceMusicSectionInstruction,
  ReferenceMusicTransition,
} from "@/lib/providerRequests/types";
import {
  clamp,
  cloneAndFreezeRecord,
  compareSupportedVersion,
  convertRatiosToTimeline,
  createMappingRecord,
  deduplicateReasonCodes,
  isSafeAssetReference,
  mapScoreToUnitRange,
  normalizeProviderError,
  resolveAdapterValidationStatus,
  roundTo,
  sanitizeSafeMetadata,
} from "@/lib/providers/adapterUtils";
import type {
  AdapterBuildResult,
  AdapterIssue,
  AdapterMappingRecord,
  AdapterReasonCode,
  AdapterValidation,
  AdapterWarning,
  LabelMappingResult,
  MusicDecisionProjection,
  MusicGenerationConstraints,
  MusicProviderCapability,
  MusicWorkflowAssets,
  NormalizedGenerationResult,
  NormalizedProviderError,
  ProviderAdapter,
  ProviderAdapterInput,
  ProviderErrorCategory,
} from "@/lib/providers/types";

export const REFERENCE_MUSIC_ADAPTER_ID = "reference-music-v1";
export const REFERENCE_MUSIC_ADAPTER_VERSION = "1.0.0";
export const REFERENCE_MUSIC_PROVIDER_ID = "reference-music";
export const REFERENCE_MUSIC_CAPABILITY_VERSION =
  "reference-music-capability-v1";
export const REFERENCE_MUSIC_PROVIDER_API_VERSION = "reference-api-v1";
export const REFERENCE_MUSIC_DECISION_SCHEMAS =
  Object.freeze(["1.0"] as const);
export const REFERENCE_MUSIC_REVIEW_CONFIDENCE = 70;

const supportedFormats = Object.freeze(["wav", "mp3"] as const);
export const REFERENCE_MUSIC_CAPABILITY: MusicProviderCapability =
  Object.freeze({
    kind: "music",
    providerId: REFERENCE_MUSIC_PROVIDER_ID,
    capabilityVersion: REFERENCE_MUSIC_CAPABILITY_VERSION,
    providerApiVersion: REFERENCE_MUSIC_PROVIDER_API_VERSION,
    supportedInputFormats: Object.freeze(["text/plain", "audio/wav"]),
    supportedOutputFormats: supportedFormats,
    minDurationSeconds: 15,
    maxDurationSeconds: 600,
    supportsSeed: false,
    supportsSectionControl: true,
    supportsTimelineControl: true,
    supportsStructuredParameters: true,
    supportsTextPrompt: false,
    supportsTempoRange: true,
    supportsExactBpm: true,
    minBpm: 40,
    maxBpm: 200,
    supportsSectionEnergy: true,
    supportsInstrumentationControl: true,
    supportsRhythmIntensity: true,
    supportsHarmonicTension: true,
    supportsDynamicRange: true,
    supportsStemOutput: false,
    supportsLyrics: true,
    supportsReferenceAudio: true,
    supportsGuideVocal: false,
    supportsDurationControl: true,
    supportedAudioFormats: supportedFormats,
  });

export type ReferenceMusicResponse = {
  status: "completed" | "partial" | "failed";
  outputAssetIds: string[];
  stemAssetIds?: string[];
  warnings?: string[];
  errorCode?: string;
  jobReference?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ReferenceMusicError = {
  code?: string;
  category?: ProviderErrorCategory;
  message?: string;
};

export type ReferenceMusicAdapterInput = ProviderAdapterInput<
  MusicDecisionProjection,
  MusicWorkflowAssets,
  MusicGenerationConstraints,
  MusicProviderCapability
>;

const issue = (
  code: AdapterReasonCode,
  summary: string,
  sourceField?: string,
  classification: AdapterIssue["classification"] = "invalid",
): AdapterIssue => ({ code, classification, summary, sourceField });
const warning = (
  code: AdapterReasonCode,
  summary: string,
  sourceField?: string,
  targetField?: string,
): AdapterWarning => ({ code, summary, sourceField, targetField });
const safeAuditText = (value: string) => value.slice(0, 80);
function cloneCapability(
  capability: MusicProviderCapability,
): MusicProviderCapability {
  return Object.freeze({
    ...capability,
    supportedInputFormats:
      Object.freeze([...capability.supportedInputFormats]),
    supportedOutputFormats:
      Object.freeze([...capability.supportedOutputFormats]),
    supportedAudioFormats:
      Object.freeze([...capability.supportedAudioFormats]),
    extensions: capability.extensions
      ? cloneAndFreezeRecord(capability.extensions)
      : undefined,
  });
}

export function validateReferenceMusicInput(
  input: ReferenceMusicAdapterInput,
): AdapterValidation {
  const errors: AdapterIssue[] = [];
  const warnings: AdapterWarning[] = [];
  const projection = input?.projection;
  const assets = input?.assets;
  const constraints = input?.constraints;
  const capability = input?.capability;

  if (input?.contractVersion !== "1.0") {
    errors.push(issue(
      "decision-schema-unsupported",
      "Adapter contract version is unsupported.",
      "contractVersion",
    ));
  }
  if (
    !projection ||
    !compareSupportedVersion(
      projection.decisionSchemaVersion,
      REFERENCE_MUSIC_DECISION_SCHEMAS,
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Decision schema version is unsupported.",
      "projection.decisionSchemaVersion",
    ));
  }
  if (
    projection &&
    (
      !projection.overallDirection ||
      !Array.isArray(projection.sectionDirections) ||
      projection.sectionDirections.length !== 5 ||
      !projection.direction ||
      !projection.validation ||
      !Array.isArray(projection.direction.sectionMovement) ||
      projection.direction.sectionMovement.length !== 5 ||
      projection.direction.sectionMovement.some(
        (movement, index) =>
          movement?.section !== projection.sectionDirections[index]?.section,
      )
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Music projection shape is invalid.",
      "projection",
    ));
  }
  if (
    projection?.direction &&
    !(["narrow", "moderate", "wide"] as const).includes(
      projection.direction.dynamicRange,
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Music dynamic range is invalid.",
      "projection.direction.dynamicRange",
    ));
  }
  if (
    projection?.sectionDirections?.some(
      ({ purpose }) =>
        !([
          "establish", "build", "release", "turn", "climax", "resolve",
        ] as const).includes(purpose),
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Music section purpose is invalid.",
      "projection.sectionDirections",
    ));
  }
  if (
    projection &&
    constraints &&
    Number.isFinite(constraints.durationSeconds) &&
    constraints.durationSeconds > 0 &&
    convertRatiosToTimeline(
      projection.sectionDirections,
      constraints.durationSeconds,
      true,
      true,
    ).status === "invalid"
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Section timeline shape is invalid.",
      "projection.sectionDirections",
    ));
  }
  if (
    !capability ||
    capability.kind !== "music" ||
    capability.capabilityVersion !==
      REFERENCE_MUSIC_CAPABILITY_VERSION
  ) {
    errors.push(issue(
      "capability-version-unsupported",
      "Music capability kind or version is unsupported.",
      "capability.capabilityVersion",
    ));
  }
  if (
    capability &&
    (
      !Number.isFinite(capability.minBpm) ||
      !Number.isFinite(capability.maxBpm) ||
      capability.minBpm <= 0 ||
      capability.minBpm > capability.maxBpm ||
      capability.supportedAudioFormats.length === 0
    )
  ) {
    errors.push(issue(
      "capability-version-unsupported",
      "Music capability limits are invalid.",
      "capability",
    ));
  }
  if (
    !constraints ||
    !Number.isFinite(constraints.durationSeconds) ||
    constraints.durationSeconds <= 0
  ) {
    errors.push(issue(
      "provider-limit-applied",
      "A positive duration is required.",
      "constraints.durationSeconds",
    ));
  }
  if (
    constraints?.seed !== undefined &&
    !Number.isFinite(constraints.seed)
  ) {
    errors.push(issue(
      "provider-limit-applied",
      "Seed must be finite.",
      "constraints.seed",
    ));
  }
  const tempo = projection?.direction?.tempoRange;
  if (
    !tempo ||
    !Number.isFinite(tempo.minBpm) ||
    !Number.isFinite(tempo.maxBpm) ||
    tempo.minBpm <= 0 ||
    tempo.maxBpm <= 0 ||
    tempo.minBpm > tempo.maxBpm
  ) {
    errors.push(issue(
      "provider-limit-applied",
      "Tempo range is invalid.",
      "projection.direction.tempoRange",
    ));
  }
  if (
    constraints?.lyricsMode === "use-lyrics" &&
    (
      !assets ||
      typeof assets.lyrics !== "string" ||
      !assets.lyrics.trim()
    )
  ) {
    errors.push(issue(
      "required-asset-missing",
      "Lyrics are required by lyrics mode.",
      "assets.lyrics",
    ));
  }
  if (
    assets?.referenceAudioAsset &&
    !isSafeAssetReference(
      assets.referenceAudioAsset,
      ["audio"],
      ["audio/"],
    )
  ) {
    errors.push(issue(
      "required-asset-missing",
      "Reference audio asset reference is invalid.",
      "assets.referenceAudioAsset",
    ));
  }
  if (
    assets?.guideVocalAsset &&
    !isSafeAssetReference(
      assets.guideVocalAsset,
      ["voice", "audio"],
      ["audio/"],
    )
  ) {
    errors.push(issue(
      "required-asset-missing",
      "Guide vocal asset reference is invalid.",
      "assets.guideVocalAsset",
    ));
  }

  if (constraints?.outputMode === "stems") {
    errors.push(issue(
      "unsupported-field-omitted",
      "Stem output is unsupported by this provider.",
      "constraints.outputMode",
      "unsupported",
    ));
  }
  if (capability) {
    if (!capability.supportsSectionControl ||
        !capability.supportsTimelineControl ||
        !capability.supportsSectionEnergy) {
      errors.push(issue(
        "timeline-control-unavailable",
        "Required structured music timeline control is unavailable.",
        "capability",
        "unsupported",
      ));
    }
    if (!capability.supportsTempoRange || !capability.supportsExactBpm) {
      errors.push(issue(
        "unsupported-field-omitted",
        "Required tempo control is unavailable.",
        "capability.supportsTempoRange",
        "unsupported",
      ));
    }
    if (
      !capability.supportsInstrumentationControl ||
      !capability.supportsRhythmIntensity ||
      !capability.supportsHarmonicTension ||
      !capability.supportsDynamicRange
    ) {
      errors.push(issue(
        "unsupported-field-omitted",
        "Required structured music intent is unsupported.",
        "capability",
        "unsupported",
      ));
    }
    if (constraints && Number.isFinite(constraints.durationSeconds) &&
        (constraints.durationSeconds < (capability.minDurationSeconds ?? -Infinity) ||
         constraints.durationSeconds > (capability.maxDurationSeconds ?? Infinity))) {
      warnings.push(warning("duration-clamped", "Duration will be clamped to provider limits.", "constraints.durationSeconds", "durationSeconds"));
    }
    if (constraints && !capability.supportedAudioFormats.includes(constraints.outputFormat)) {
      warnings.push(warning("format-substituted", "Output format will be substituted.", "constraints.outputFormat", "outputFormat"));
    }
    if (constraints?.seed !== undefined && !capability.supportsSeed) {
      warnings.push(warning("seed-omitted", "Seed is unsupported and will be omitted.", "constraints.seed"));
    }
    if (assets?.theme) {
      warnings.push(warning("unsupported-field-omitted", "Theme text is not rendered into a provider prompt and will be omitted.", "assets.theme"));
    }
    if (assets?.referenceAudioAsset && !capability.supportsReferenceAudio) {
      warnings.push(warning("unsupported-field-omitted", "Reference audio is unsupported and will be omitted.", "assets.referenceAudioAsset"));
    }
    if (assets?.guideVocalAsset && !capability.supportsGuideVocal) {
      warnings.push(warning("unsupported-field-omitted", "Guide vocal is unsupported and will be omitted.", "assets.guideVocalAsset"));
    }
    if (constraints?.lyricsMode === "use-lyrics" && !capability.supportsLyrics) {
      errors.push(issue("unsupported-field-omitted", "Lyrics are unsupported by this provider.", "constraints.lyricsMode", "unsupported"));
    }
  }
  if (projection?.validation?.status === "normalized") {
    warnings.push(warning("capability-fallback", "Normalized Director Decision requires review.", "projection.validation"));
  } else if (projection?.validation?.status === "fallback") {
    warnings.push(warning("decision-fallback-review-required", "Fallback Director Decision requires review.", "projection.validation"));
  }
  if (projection && (!Number.isFinite(projection.confidence) || projection.confidence < REFERENCE_MUSIC_REVIEW_CONFIDENCE)) {
    warnings.push(warning("capability-fallback", "Input quality confidence is below the review threshold.", "projection.confidence"));
  }

  const uniqueErrors = deduplicateReasonCodes(errors);
  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const status = resolveAdapterValidationStatus(uniqueErrors, uniqueWarnings);
  return {
    status,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    reviewRequired: status === "degraded" || projection?.validation?.status === "fallback" || (projection?.confidence ?? 0) < REFERENCE_MUSIC_REVIEW_CONFIDENCE,
  };
}

function mapLabel<TSource extends string, TTarget extends string>(source: TSource, supported: readonly TTarget[], approximate: Readonly<Partial<Record<TSource, TTarget>>>, fallback: TTarget): LabelMappingResult<TTarget> {
  if ((supported as readonly string[]).includes(source)) return { value: source as unknown as TTarget, mapping: "exact" };
  const value = approximate[source];
  return value
    ? { value, mapping: "approximate", reasonCode: "unsupported-label-approximated" }
    : { value: fallback, mapping: "fallback", reasonCode: "unsupported-label-approximated" };
}

const mapEnergy = (value: IntensityCurve) => mapLabel(value, ["steady-rise", "rise-and-release", "quiet-resolution"] as const, { "late-peak": "rise-and-release", "bridge-turn": "quiet-resolution" }, "steady-rise");
const mapPeak = (value: MusicPeakTreatment) => mapLabel(value, ["full-arrangement", "harmonic-release", "intentional-space"] as const, { "rhythmic-impact": "full-arrangement" }, "full-arrangement");
const mapAfterglow = (value: MusicAfterglowTreatment) => mapLabel(value, ["thin-texture", "long-decay", "gentle-pulse"] as const, { "clean-stop": "thin-texture" }, "thin-texture");
const mapDensity = (value: DensityChange) => mapLabel(value, ["reduce", "hold", "add"] as const, { expand: "add" }, "hold");
const mapTransition = (value: TransitionStyle) => mapLabel(value, ["hold", "gentle", "build"] as const, { impact: "build", dissolve: "gentle" }, "hold");

function appendLabelMapping<T extends string>(mappings: AdapterMappingRecord[], warnings: AdapterWarning[], approximatedFields: string[], sourceField: string, sourceValue: string, targetField: string, result: LabelMappingResult<T>): T {
  mappings.push(createMappingRecord({ sourceField, sourceValue: safeAuditText(sourceValue), targetField, targetValue: result.value, mapping: result.mapping, reasonCode: result.reasonCode }));
  if (result.mapping !== "exact") {
    approximatedFields.push(sourceField);
    warnings.push(warning(result.reasonCode ?? "unsupported-label-approximated", "Music label was mapped to the nearest safe reference label.", sourceField, targetField));
  }
  return result.value as T;
}

function appendScoreMapping(mappings: AdapterMappingRecord[], warnings: AdapterWarning[], sourceField: string, sourceValue: number, targetField: string): number {
  const targetValue = mapScoreToUnitRange(sourceValue);
  const wasClamped = !Number.isFinite(sourceValue) || sourceValue < 0 || sourceValue > 100;
  mappings.push(createMappingRecord({ sourceField, sourceValue: Number.isFinite(sourceValue) ? sourceValue : undefined, targetField, targetValue, mapping: wasClamped ? "clamped" : "normalized", reasonCode: wasClamped ? "score-range-clamped" : undefined }));
  if (wasClamped) warnings.push(warning("score-range-clamped", "Score was clamped to the Director Decision range.", sourceField, targetField));
  return targetValue;
}

export function buildReferenceMusicRequest(input: ReferenceMusicAdapterInput): AdapterBuildResult<ReferenceMusicRequest, MusicProviderCapability> {
  const validation = validateReferenceMusicInput(input);
  const capabilitySnapshot = cloneCapability(
    input?.capability?.kind === "music" &&
      Array.isArray(input.capability.supportedInputFormats) &&
      Array.isArray(input.capability.supportedOutputFormats) &&
      Array.isArray(input.capability.supportedAudioFormats)
      ? input.capability
      : REFERENCE_MUSIC_CAPABILITY,
  );
  if (validation.status === "invalid" || validation.status === "unsupported") {
    return { contractVersion: "1.0", status: validation.status, warnings: validation.warnings.map((x) => ({ ...x })), errors: validation.errors.map((x) => ({ ...x })), mappings: [], fallbackUsed: false, omittedFields: [], approximatedFields: [], capabilitySnapshot, adapterId: REFERENCE_MUSIC_ADAPTER_ID, adapterVersion: REFERENCE_MUSIC_ADAPTER_VERSION, reviewRequired: validation.reviewRequired };
  }
  const { capability, constraints, projection, assets } = input;
  const warnings = validation.warnings.map((x) => ({ ...x }));
  const mappings: AdapterMappingRecord[] = [];
  const omittedFields: string[] = [];
  const approximatedFields: string[] = [];
  const durationSeconds = roundTo(clamp(constraints.durationSeconds, capability.minDurationSeconds ?? constraints.durationSeconds, capability.maxDurationSeconds ?? constraints.durationSeconds), 6);
  mappings.push(createMappingRecord({ sourceField: "constraints.durationSeconds", sourceValue: constraints.durationSeconds, targetField: "durationSeconds", targetValue: durationSeconds, mapping: durationSeconds === constraints.durationSeconds ? "exact" : "clamped", reasonCode: durationSeconds === constraints.durationSeconds ? undefined : "duration-clamped" }));
  const outputFormat = (capability.supportedAudioFormats.includes(constraints.outputFormat) ? constraints.outputFormat : capability.supportedAudioFormats[0]) as "wav" | "mp3";
  mappings.push(createMappingRecord({ sourceField: "constraints.outputFormat", sourceValue: safeAuditText(constraints.outputFormat), targetField: "outputFormat", targetValue: outputFormat, mapping: outputFormat === constraints.outputFormat ? "exact" : "fallback", reasonCode: outputFormat === constraints.outputFormat ? undefined : "format-substituted" }));
  if (outputFormat !== constraints.outputFormat) approximatedFields.push("constraints.outputFormat");
  const tempoMin = Math.round(clamp(projection.direction.tempoRange.minBpm, capability.minBpm, capability.maxBpm));
  const tempoMax = Math.round(clamp(projection.direction.tempoRange.maxBpm, tempoMin, capability.maxBpm));
  const targetBpm = Math.round((tempoMin + tempoMax) / 2);
  for (const [key, source, target] of [["minBpm", projection.direction.tempoRange.minBpm, tempoMin], ["maxBpm", projection.direction.tempoRange.maxBpm, tempoMax]] as const) {
    const changed = source !== target;
    mappings.push(createMappingRecord({ sourceField: `projection.direction.tempoRange.${key}`, sourceValue: source, targetField: `tempo.${key}`, targetValue: target, mapping: changed ? "clamped" : "exact", reasonCode: changed ? "provider-limit-applied" : undefined }));
    if (changed) warnings.push(warning("provider-limit-applied", "Tempo was clamped to provider limits.", `projection.direction.tempoRange.${key}`, `tempo.${key}`));
  }
  mappings.push(createMappingRecord({ sourceField: "projection.direction.tempoRange", targetField: "tempo.targetBpm", targetValue: targetBpm, mapping: "normalized" }));
  for (const field of ["constraints.seed", "assets.theme", "assets.guideVocalAsset"] as const) {
    const present = field === "constraints.seed" ? constraints.seed !== undefined : field === "assets.theme" ? Boolean(assets.theme) : Boolean(assets.guideVocalAsset);
    if (present) { omittedFields.push(field); mappings.push(createMappingRecord({ sourceField: field, mapping: "omitted", reasonCode: field === "constraints.seed" ? "seed-omitted" : "unsupported-field-omitted" })); }
  }
  const lyrics = constraints.lyricsMode === "use-lyrics" ? assets.lyrics!.trim() : undefined;
  if (lyrics) mappings.push(createMappingRecord({ sourceField: "assets.lyrics", targetField: "lyrics", mapping: "exact" }));
  const referenceAudioAssetId = assets.referenceAudioAsset && capability.supportsReferenceAudio ? assets.referenceAudioAsset.assetId : undefined;
  if (referenceAudioAssetId) mappings.push(createMappingRecord({ sourceField: "assets.referenceAudioAsset", targetField: "referenceAudioAssetId", mapping: "exact" }));
  else if (assets.referenceAudioAsset) { omittedFields.push("assets.referenceAudioAsset"); mappings.push(createMappingRecord({ sourceField: "assets.referenceAudioAsset", mapping: "omitted", reasonCode: "unsupported-field-omitted" })); }
  const energyCurve = appendLabelMapping(mappings, warnings, approximatedFields, "projection.direction.energyCurve", projection.direction.energyCurve, "performance.energyCurve", mapEnergy(projection.direction.energyCurve));
  const peakTreatment = appendLabelMapping(mappings, warnings, approximatedFields, "projection.direction.mainPeakTreatment", projection.direction.mainPeakTreatment, "peakTreatment", mapPeak(projection.direction.mainPeakTreatment));
  const afterglowTreatment = appendLabelMapping(mappings, warnings, approximatedFields, "projection.direction.afterglowTreatment", projection.direction.afterglowTreatment, "afterglowTreatment", mapAfterglow(projection.direction.afterglowTreatment));
  const dynamicRange = projection.direction.dynamicRange;
  mappings.push(createMappingRecord({ sourceField: "projection.direction.dynamicRange", sourceValue: dynamicRange, targetField: "performance.dynamicRange", targetValue: dynamicRange, mapping: "exact" }));
  const movementBySection = new Map(projection.direction.sectionMovement.map((x) => [x.section, x]));
  const timelineBase = convertRatiosToTimeline(projection.sectionDirections, durationSeconds, capability.supportsSectionControl, capability.supportsTimelineControl).timeline;
  const timeline = timelineBase.map((item, index) => {
    const section = projection.sectionDirections[index];
    const movement = movementBySection.get(section.section)!;
    return { ...item,
      musicIntensity: appendScoreMapping(mappings, warnings, `projection.sectionDirections.${index}.musicIntensity`, section.musicIntensity, `timeline.${index}.musicIntensity`),
      tension: appendScoreMapping(mappings, warnings, `projection.sectionDirections.${index}.tension`, section.tension, `timeline.${index}.tension`),
      release: appendScoreMapping(mappings, warnings, `projection.sectionDirections.${index}.release`, section.release, `timeline.${index}.release`),
      densityChange: appendLabelMapping(mappings, warnings, approximatedFields, `projection.direction.sectionMovement.${index}.densityChange`, movement.densityChange, `timeline.${index}.densityChange`, mapDensity(movement.densityChange)),
      transitionStyle: appendLabelMapping(mappings, warnings, approximatedFields, `projection.sectionDirections.${index}.transitionStyle`, section.transitionStyle, `timeline.${index}.transitionStyle`, mapTransition(section.transitionStyle)),
      purpose: section.purpose,
    };
  });
  const request: ReferenceMusicRequest = { requestSchemaVersion: "1.0", durationSeconds, outputFormat, outputMode: "mix", lyricsMode: constraints.lyricsMode ?? "none", tempo: { minBpm: tempoMin, maxBpm: tempoMax, targetBpm }, performance: { energyCurve, instrumentationDensity: appendScoreMapping(mappings, warnings, "projection.direction.instrumentationDensity", projection.direction.instrumentationDensity, "performance.instrumentationDensity"), rhythmIntensity: appendScoreMapping(mappings, warnings, "projection.direction.rhythmIntensity", projection.direction.rhythmIntensity, "performance.rhythmIntensity"), harmonicTension: appendScoreMapping(mappings, warnings, "projection.direction.harmonicTension", projection.direction.harmonicTension, "performance.harmonicTension"), dynamicRange }, timeline, peakTreatment, afterglowTreatment, lyrics, referenceAudioAssetId };
  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const degraded = uniqueWarnings.length > 0 || omittedFields.length > 0 || approximatedFields.length > 0 || projection.validation.status !== "valid";
  return { contractVersion: "1.0", status: degraded ? "degraded" : "ready", request, warnings: uniqueWarnings, errors: [], mappings, fallbackUsed: mappings.some((x) => ["clamped", "approximate", "fallback", "omitted", "collapsed"].includes(x.mapping)), omittedFields, approximatedFields, capabilitySnapshot, adapterId: REFERENCE_MUSIC_ADAPTER_ID, adapterVersion: REFERENCE_MUSIC_ADAPTER_VERSION, reviewRequired: degraded || validation.reviewRequired };
}

export const normalizeReferenceMusicError = (error: unknown): NormalizedProviderError => normalizeProviderError(error);

export function normalizeReferenceMusicResponse(response: ReferenceMusicResponse): NormalizedGenerationResult {
  const source = response && typeof response === "object" ? response as Partial<ReferenceMusicResponse> : {};
  const warnings: AdapterWarning[] = (Array.isArray(source.warnings) ? source.warnings : []).map(() => warning("capability-fallback", "Reference response included a generation warning."));
  const safeIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 256 && !id.includes("://")))] : [];
  const mixIds = safeIds(source.outputAssetIds);
  const stemIds = safeIds(source.stemAssetIds).filter((id) => !mixIds.includes(id));
  const outputs = [
    ...mixIds.map((assetId, index) => ({ assetId, kind: "audio" as const, role: index === 0 ? "primary" as const : "alternate" as const })),
    ...stemIds.map((assetId) => ({ assetId, kind: "audio" as const, role: "stem" as const })),
  ];
  const status = source.status === "completed" && outputs.length > 0 ? "completed" : outputs.length > 0 ? "partial" : "failed";
  if (source.status === "failed" && outputs.length > 0) warnings.push(warning("capability-fallback", "Failed response contained usable outputs and was normalized to partial."));
  return { resultSchemaVersion: "1.0", status, providerId: REFERENCE_MUSIC_PROVIDER_ID, adapterId: REFERENCE_MUSIC_ADAPTER_ID, adapterVersion: REFERENCE_MUSIC_ADAPTER_VERSION, outputs, warnings: deduplicateReasonCodes(warnings), error: status === "failed" ? normalizeReferenceMusicError({ code: source.errorCode ?? "generation-failed" }) : undefined, providerJobReference: typeof source.jobReference === "string" && source.jobReference.length > 0 && !source.jobReference.includes("://") ? source.jobReference.slice(0, 128) : undefined, safeProviderMetadata: sanitizeSafeMetadata(source.metadata, ["durationSeconds", "format", "sampleRate", "bpm"]) };
}

export const referenceMusicAdapter: ProviderAdapter<MusicDecisionProjection, MusicWorkflowAssets, MusicGenerationConstraints, MusicProviderCapability, ReferenceMusicRequest, ReferenceMusicResponse, NormalizedGenerationResult> = Object.freeze({ contractVersion: "1.0", adapterId: REFERENCE_MUSIC_ADAPTER_ID, adapterVersion: REFERENCE_MUSIC_ADAPTER_VERSION, providerId: REFERENCE_MUSIC_PROVIDER_ID, providerApiVersion: REFERENCE_MUSIC_PROVIDER_API_VERSION, supportedDecisionSchemaVersions: REFERENCE_MUSIC_DECISION_SCHEMAS, validateInput: validateReferenceMusicInput, buildRequest: buildReferenceMusicRequest, normalizeResponse: normalizeReferenceMusicResponse, normalizeError: normalizeReferenceMusicError });
