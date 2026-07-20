import type {
  ArticulationStyle,
  DynamicsShape,
  VocalDelivery,
  VocalOutroTreatment,
  VocalPeakTreatment,
} from "@/lib/directorDecisionEngine";
import type { SupportedEmotion } from "@/lib/emotionEngine";
import type {
  ReferenceVocalArticulation,
  ReferenceVocalDelivery,
  ReferenceVocalDynamics,
  ReferenceVocalOutroTreatment,
  ReferenceVocalPeakTreatment,
  ReferenceVocalRequest,
} from "@/lib/providerRequests/types";
export type {
  ReferenceVocalArticulation,
  ReferenceVocalDelivery,
  ReferenceVocalDynamics,
  ReferenceVocalOutroTreatment,
  ReferenceVocalPeakTreatment,
  ReferenceVocalRequest,
  ReferenceVocalSectionInstruction,
} from "@/lib/providerRequests/types";
import {
  clamp,
  cloneAndFreezeRecord,
  compareSupportedVersion,
  convertRatiosToTimeline,
  createMappingRecord,
  deduplicateReasonCodes,
  mapScoreToUnitRange,
  isSafeAssetReference,
  normalizeProviderError,
  roundTo,
  resolveAdapterValidationStatus,
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
  NormalizedGenerationResult,
  NormalizedProviderError,
  ProviderAdapter,
  ProviderAdapterInput,
  ProviderErrorCategory,
  VocalDecisionProjection,
  VocalGenerationConstraints,
  VocalProviderCapability,
  VocalWorkflowAssets,
} from "@/lib/providers/types";

export const REFERENCE_VOCAL_ADAPTER_ID = "reference-vocal-v1";
export const REFERENCE_VOCAL_ADAPTER_VERSION = "1.0.0";
export const REFERENCE_VOCAL_PROVIDER_ID = "reference-vocal";
export const REFERENCE_VOCAL_CAPABILITY_VERSION =
  "reference-vocal-capability-v1";
export const REFERENCE_VOCAL_PROVIDER_API_VERSION = "reference-api-v1";
export const REFERENCE_VOCAL_DECISION_SCHEMAS =
  Object.freeze(["1.0"] as const);
export const REFERENCE_VOCAL_REVIEW_CONFIDENCE = 70;

const supportedFormats = Object.freeze(["wav", "mp3"] as const);
const supportedLanguages = Object.freeze(["ja", "en"] as const);
const supportedVoiceModes = Object.freeze(["standard"] as const);
const supportedEmotions: readonly SupportedEmotion[] = Object.freeze([
  "joy",
  "sadness",
  "hope",
  "love",
  "fear",
  "anger",
  "loneliness",
  "excitement",
  "nostalgia",
  "determination",
]);

export const REFERENCE_VOCAL_CAPABILITY: VocalProviderCapability =
  Object.freeze({
    kind: "vocal",
    providerId: REFERENCE_VOCAL_PROVIDER_ID,
    capabilityVersion: REFERENCE_VOCAL_CAPABILITY_VERSION,
    providerApiVersion: REFERENCE_VOCAL_PROVIDER_API_VERSION,
    supportedInputFormats: Object.freeze(["text/plain"]),
    supportedOutputFormats: supportedFormats,
    minDurationSeconds: 10,
    maxDurationSeconds: 600,
    supportsSeed: false,
    supportsSectionControl: true,
    supportsTimelineControl: true,
    supportsStructuredParameters: true,
    supportsTextPrompt: false,
    supportsLyrics: true,
    supportsPhonemeControl: false,
    supportsBreathiness: true,
    supportsVibrato: true,
    supportsArticulation: true,
    supportsDynamics: true,
    supportsSectionDynamics: true,
    supportsReferenceVoice: false,
    supportsGuideMelody: true,
    supportedLanguages,
    supportedVoiceModes,
    supportedAudioFormats: supportedFormats,
  });

export type ReferenceVocalResponse = {
  status: "completed" | "partial" | "failed";
  outputAssetIds: string[];
  warnings?: string[];
  errorCode?: string;
  jobReference?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ReferenceVocalError = {
  code?: string;
  category?: ProviderErrorCategory;
  message?: string;
};

export type ReferenceVocalAdapterInput = ProviderAdapterInput<
  VocalDecisionProjection,
  VocalWorkflowAssets,
  VocalGenerationConstraints,
  VocalProviderCapability
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

function cloneCapability(
  capability: VocalProviderCapability,
): VocalProviderCapability {
  return Object.freeze({
    ...capability,
    supportedInputFormats:
      Object.freeze([...capability.supportedInputFormats]),
    supportedOutputFormats:
      Object.freeze([...capability.supportedOutputFormats]),
    supportedLanguages:
      Object.freeze([...capability.supportedLanguages]),
    supportedVoiceModes:
      Object.freeze([...capability.supportedVoiceModes]),
    supportedAudioFormats:
      Object.freeze([...capability.supportedAudioFormats]),
    extensions: capability.extensions
      ? cloneAndFreezeRecord(capability.extensions)
      : undefined,
  });
}

const safeAuditText = (value: string) => value.slice(0, 80);
export function validateReferenceVocalInput(
  input: ReferenceVocalAdapterInput,
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
      REFERENCE_VOCAL_DECISION_SCHEMAS,
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
      !projection.validation
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Vocal projection shape is invalid.",
      "projection",
    ));
  }
  if (
    projection?.direction &&
    !supportedEmotions.includes(
      projection.direction.emotionalExpression,
    )
  ) {
    errors.push(issue(
      "decision-schema-unsupported",
      "Vocal emotional expression is invalid.",
      "projection.direction.emotionalExpression",
    ));
  }
  if (
    projection &&
    Array.isArray(projection.sectionDirections) &&
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
    capability.kind !== "vocal" ||
    capability.capabilityVersion !==
      REFERENCE_VOCAL_CAPABILITY_VERSION
  ) {
    errors.push(issue(
      "capability-version-unsupported",
      "Vocal capability kind or version is unsupported.",
      "capability.capabilityVersion",
    ));
  }
  if (
    capability &&
    (
      capability.supportedAudioFormats.length === 0 ||
      capability.supportedOutputFormats.length === 0 ||
      (
        capability.minDurationSeconds !== undefined &&
        (!Number.isFinite(capability.minDurationSeconds) ||
          capability.minDurationSeconds <= 0)
      ) ||
      (
        capability.maxDurationSeconds !== undefined &&
        (!Number.isFinite(capability.maxDurationSeconds) ||
          capability.maxDurationSeconds <= 0)
      ) ||
      (capability.minDurationSeconds ?? 0) >
        (capability.maxDurationSeconds ?? Number.MAX_VALUE)
    )
  ) {
    errors.push(issue(
      "capability-version-unsupported",
      "Vocal capability limits are invalid.",
      "capability",
    ));
  }
  if (!assets || typeof assets.lyrics !== "string" || !assets.lyrics.trim()) {
    errors.push(issue(
      "required-asset-missing",
      "Lyrics are required.",
      "assets.lyrics",
    ));
  }
  if (
    !constraints ||
    !Number.isFinite(constraints.durationSeconds) ||
    constraints.durationSeconds <= 0
  ) {
    errors.push(issue(
      "required-asset-missing",
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
  if (
    assets?.referenceVoiceAsset &&
    !isSafeAssetReference(
      assets.referenceVoiceAsset,
      ["voice", "audio"],
      ["audio/"],
    )
  ) {
    errors.push(issue(
      "required-asset-missing",
      "Reference voice asset reference is invalid.",
      "assets.referenceVoiceAsset",
    ));
  }
  if (
    assets?.guideMelodyAsset &&
    !isSafeAssetReference(
      assets.guideMelodyAsset,
      ["melody", "audio"],
      ["audio/"],
    )
  ) {
    errors.push(issue(
      "required-asset-missing",
      "Guide melody asset reference is invalid.",
      "assets.guideMelodyAsset",
    ));
  }

  if (capability?.kind === "vocal" && constraints) {
    if (!capability.supportedLanguages.includes(constraints.language)) {
      errors.push(issue(
        "language-unsupported",
      "Requested language is unsupported.",
      "constraints.language",
      "unsupported",
      ));
    }
    if (assets && assets.language !== constraints.language) {
      errors.push(issue(
        "language-unsupported",
        "Asset and constraint languages do not match.",
        "assets.language",
      ));
    }
    if (
      !capability.supportsLyrics ||
      !capability.supportsBreathiness ||
      !capability.supportsVibrato ||
      !capability.supportsArticulation ||
      !capability.supportsDynamics ||
      !capability.supportsSectionDynamics
    ) {
      errors.push(issue(
        "unsupported-field-omitted",
        "Required structured vocal intent is unsupported.",
        "capability",
        "unsupported",
      ));
    }
    if (!capability.supportsSectionControl) {
      errors.push(issue(
        "section-control-collapsed",
        "Section control is required by the reference contract.",
        "capability.supportsSectionControl",
        "unsupported",
      ));
    }
    if (!capability.supportsTimelineControl) {
      errors.push(issue(
        "timeline-control-unavailable",
        "Timeline control is required by the reference contract.",
        "capability.supportsTimelineControl",
        "unsupported",
      ));
    }
    if (
      Number.isFinite(constraints.durationSeconds) &&
      (
        constraints.durationSeconds <
          (capability.minDurationSeconds ?? 0) ||
        constraints.durationSeconds >
          (capability.maxDurationSeconds ?? Number.MAX_VALUE)
      )
    ) {
      warnings.push(warning(
        "duration-clamped",
        "Duration will be clamped to the capability range.",
        "constraints.durationSeconds",
        "durationSeconds",
      ));
    }
    if (!capability.supportedOutputFormats.includes(
      constraints.outputFormat,
    )) {
      warnings.push(warning(
        "format-substituted",
        "Output format will use the first supported format.",
        "constraints.outputFormat",
        "outputFormat",
      ));
    }
    if (constraints.seed !== undefined && !capability.supportsSeed) {
      warnings.push(warning(
        "seed-omitted",
        "Seed is unsupported and will be omitted.",
        "constraints.seed",
      ));
    }
    if (assets?.referenceVoiceAsset && !capability.supportsReferenceVoice) {
      warnings.push(warning(
        "unsupported-field-omitted",
        "Reference voice is unsupported and will be omitted.",
        "assets.referenceVoiceAsset",
      ));
    }
    if (assets?.guideMelodyAsset && !capability.supportsGuideMelody) {
      warnings.push(warning(
        "unsupported-field-omitted",
        "Guide melody is unsupported and will be omitted.",
        "assets.guideMelodyAsset",
      ));
    }
    if (
      assets?.pronunciationHints?.length &&
      !capability.supportsPhonemeControl
    ) {
      warnings.push(warning(
        "unsupported-field-omitted",
        "Pronunciation hints are unsupported and will be omitted.",
        "assets.pronunciationHints",
      ));
    }
  }

  if (projection?.validation?.status === "normalized") {
    warnings.push(warning(
      "capability-fallback",
      "Normalized Director Decision requires review.",
      "projection.validation",
    ));
  } else if (projection?.validation?.status === "fallback") {
    warnings.push(warning(
      "decision-fallback-review-required",
      "Fallback Director Decision requires review.",
      "projection.validation",
    ));
  }
  if (
    projection &&
    (
      !Number.isFinite(projection.confidence) ||
      projection.confidence < REFERENCE_VOCAL_REVIEW_CONFIDENCE
    )
  ) {
    warnings.push(warning(
      "capability-fallback",
      "Input quality confidence is below the review threshold.",
      "projection.confidence",
    ));
  }

  const uniqueErrors = deduplicateReasonCodes(errors);
  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const status = resolveAdapterValidationStatus(
    uniqueErrors,
    uniqueWarnings,
  );
  return {
    status,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    reviewRequired:
      status === "degraded" ||
      projection?.validation?.status === "fallback" ||
      (projection?.confidence ?? 0) <
        REFERENCE_VOCAL_REVIEW_CONFIDENCE,
  };
}

function mapLabel<TSource extends string, TTarget extends string>(
  source: TSource,
  supported: readonly TTarget[],
  approximate: Readonly<Partial<Record<TSource, TTarget>>>,
  fallback: TTarget,
): LabelMappingResult<TTarget> {
  if ((supported as readonly string[]).includes(source)) {
    return { value: source as unknown as TTarget, mapping: "exact" };
  }
  const approximation = approximate[source];
  if (approximation) {
    return {
      value: approximation,
      mapping: "approximate",
      reasonCode: "unsupported-label-approximated",
    };
  }
  return {
    value: fallback,
    mapping: "fallback",
    reasonCode: "unsupported-label-approximated",
  };
}

const deliveryLabels = ["intimate", "controlled", "open"] as const;
const dynamicsLabels =
  ["narrow", "gradual", "wide", "late-expansion"] as const;
const articulationLabels = ["soft", "natural", "clear"] as const;
const peakLabels = ["lift", "sustain", "vulnerable-focus"] as const;
const outroLabels = ["release", "sustained", "resolved"] as const;

function mapDelivery(
  value: VocalDelivery,
): LabelMappingResult<ReferenceVocalDelivery> {
  return mapLabel(value, deliveryLabels, {
    urgent: "open",
    resolute: "controlled",
  }, "controlled");
}

function mapDynamics(
  value: DynamicsShape,
): LabelMappingResult<ReferenceVocalDynamics> {
  return mapLabel(value, dynamicsLabels, {}, "gradual");
}

function mapArticulation(
  value: ArticulationStyle,
): LabelMappingResult<ReferenceVocalArticulation> {
  return mapLabel(value, articulationLabels, {
    accented: "clear",
  }, "natural");
}

function mapPeak(
  value: VocalPeakTreatment,
): LabelMappingResult<ReferenceVocalPeakTreatment> {
  return mapLabel(value, peakLabels, {
    breakthrough: "lift",
  }, "lift");
}

function mapOutro(
  value: VocalOutroTreatment,
): LabelMappingResult<ReferenceVocalOutroTreatment> {
  return mapLabel(value, outroLabels, {}, "release");
}

function appendLabelMapping<T extends string>(
  mappings: AdapterMappingRecord[],
  warnings: AdapterWarning[],
  approximatedFields: string[],
  sourceField: string,
  sourceValue: string,
  targetField: string,
  result: LabelMappingResult<T>,
): T {
  mappings.push(createMappingRecord({
    sourceField,
    sourceValue: safeAuditText(sourceValue),
    targetField,
    targetValue: result.value,
    mapping: result.mapping,
    reasonCode: result.reasonCode,
  }));
  if (result.mapping !== "exact") {
    approximatedFields.push(sourceField);
    warnings.push(warning(
      result.reasonCode ?? "unsupported-label-approximated",
      "Vocal label was mapped to the nearest safe reference label.",
      sourceField,
      targetField,
    ));
  }
  return result.value as T;
}

function appendScoreMapping(
  mappings: AdapterMappingRecord[],
  warnings: AdapterWarning[],
  sourceField: string,
  sourceValue: number,
  targetField: string,
): number {
  const targetValue = mapScoreToUnitRange(sourceValue);
  const wasClamped =
    !Number.isFinite(sourceValue) ||
    sourceValue < 0 ||
    sourceValue > 100;
  mappings.push(createMappingRecord({
    sourceField,
    sourceValue: Number.isFinite(sourceValue)
      ? sourceValue
      : undefined,
    targetField,
    targetValue,
    mapping: wasClamped ? "clamped" : "normalized",
    reasonCode: wasClamped ? "score-range-clamped" : undefined,
  }));
  if (wasClamped) {
    warnings.push(warning(
      "score-range-clamped",
      "Score was clamped to the Director Decision range.",
      sourceField,
      targetField,
    ));
  }
  return targetValue;
}

export function buildReferenceVocalRequest(
  input: ReferenceVocalAdapterInput,
): AdapterBuildResult<
  ReferenceVocalRequest,
  VocalProviderCapability
> {
  const validation = validateReferenceVocalInput(input);
  const capabilitySnapshot = cloneCapability(
    input?.capability?.kind === "vocal" &&
      Array.isArray(input.capability.supportedInputFormats) &&
      Array.isArray(input.capability.supportedOutputFormats) &&
      Array.isArray(input.capability.supportedLanguages) &&
      Array.isArray(input.capability.supportedVoiceModes) &&
      Array.isArray(input.capability.supportedAudioFormats)
      ? input.capability
      : REFERENCE_VOCAL_CAPABILITY,
  );
  if (
    validation.status === "invalid" ||
    validation.status === "unsupported"
  ) {
    return {
      contractVersion: "1.0",
      status: validation.status,
      warnings: validation.warnings.map((item) => ({ ...item })),
      errors: validation.errors.map((item) => ({ ...item })),
      mappings: [],
      fallbackUsed: false,
      omittedFields: [],
      approximatedFields: [],
      capabilitySnapshot,
      adapterId: REFERENCE_VOCAL_ADAPTER_ID,
      adapterVersion: REFERENCE_VOCAL_ADAPTER_VERSION,
      reviewRequired: validation.reviewRequired,
    };
  }

  const warnings = validation.warnings.map((item) => ({ ...item }));
  const errors = validation.errors.map((item) => ({ ...item }));
  const mappings: AdapterMappingRecord[] = [];
  const omittedFields: string[] = [];
  const approximatedFields: string[] = [];
  const capability = input.capability;
  const constraints = input.constraints;
  const projection = input.projection;

  mappings.push(createMappingRecord({
    sourceField: "assets.lyrics",
    targetField: "lyrics",
    mapping: "exact",
  }));
  mappings.push(createMappingRecord({
    sourceField: "constraints.language",
    sourceValue: safeAuditText(constraints.language),
    targetField: "language",
    targetValue: safeAuditText(constraints.language),
    mapping: "exact",
  }));

  const durationSeconds = roundTo(clamp(
    constraints.durationSeconds,
    capability.minDurationSeconds ?? constraints.durationSeconds,
    capability.maxDurationSeconds ?? constraints.durationSeconds,
  ), 6);
  const durationClamped =
    durationSeconds !== constraints.durationSeconds;
  mappings.push(createMappingRecord({
    sourceField: "constraints.durationSeconds",
    sourceValue: constraints.durationSeconds,
    targetField: "durationSeconds",
    targetValue: durationSeconds,
    mapping: durationClamped ? "clamped" : "exact",
    reasonCode: durationClamped ? "duration-clamped" : undefined,
  }));

  const requestedFormat = constraints.outputFormat;
  const outputFormat = (
    capability.supportedOutputFormats.includes(requestedFormat)
      ? requestedFormat
      : capability.supportedOutputFormats[0]
  ) as "wav" | "mp3";
  const formatSubstituted = outputFormat !== requestedFormat;
  mappings.push(createMappingRecord({
    sourceField: "constraints.outputFormat",
    sourceValue: safeAuditText(requestedFormat),
    targetField: "outputFormat",
    targetValue: outputFormat,
    mapping: formatSubstituted ? "fallback" : "exact",
    reasonCode: formatSubstituted
      ? "format-substituted"
      : undefined,
  }));
  if (formatSubstituted) {
    approximatedFields.push("constraints.outputFormat");
  }

  if (constraints.seed !== undefined && !capability.supportsSeed) {
    omittedFields.push("constraints.seed");
    mappings.push(createMappingRecord({
      sourceField: "constraints.seed",
      sourceValue: Number.isFinite(constraints.seed)
        ? constraints.seed
        : undefined,
      mapping: "omitted",
      reasonCode: "seed-omitted",
    }));
  }
  if (
    input.assets.referenceVoiceAsset &&
    !capability.supportsReferenceVoice
  ) {
    omittedFields.push("assets.referenceVoiceAsset");
    mappings.push(createMappingRecord({
      sourceField: "assets.referenceVoiceAsset",
      mapping: "omitted",
      reasonCode: "unsupported-field-omitted",
    }));
  } else if (input.assets.referenceVoiceAsset) {
    mappings.push(createMappingRecord({
      sourceField: "assets.referenceVoiceAsset",
      targetField: "referenceVoiceAssetId",
      mapping: "exact",
    }));
  }
  if (
    input.assets.pronunciationHints?.length &&
    !capability.supportsPhonemeControl
  ) {
    omittedFields.push("assets.pronunciationHints");
    mappings.push(createMappingRecord({
      sourceField: "assets.pronunciationHints",
      mapping: "omitted",
      reasonCode: "unsupported-field-omitted",
    }));
  }
  if (
    input.assets.guideMelodyAsset &&
    !capability.supportsGuideMelody
  ) {
    omittedFields.push("assets.guideMelodyAsset");
    mappings.push(createMappingRecord({
      sourceField: "assets.guideMelodyAsset",
      mapping: "omitted",
      reasonCode: "unsupported-field-omitted",
    }));
  } else if (input.assets.guideMelodyAsset) {
    mappings.push(createMappingRecord({
      sourceField: "assets.guideMelodyAsset",
      targetField: "guideMelodyAssetId",
      mapping: "exact",
    }));
  }

  const delivery = appendLabelMapping(
    mappings,
    warnings,
    approximatedFields,
    "projection.direction.delivery",
    projection.direction.delivery,
    "performance.delivery",
    mapDelivery(projection.direction.delivery),
  );
  const dynamics = appendLabelMapping(
    mappings,
    warnings,
    approximatedFields,
    "projection.direction.dynamics",
    projection.direction.dynamics,
    "performance.dynamics",
    mapDynamics(projection.direction.dynamics),
  );
  const articulation = appendLabelMapping(
    mappings,
    warnings,
    approximatedFields,
    "projection.direction.articulation",
    projection.direction.articulation,
    "performance.articulation",
    mapArticulation(projection.direction.articulation),
  );
  const peakTreatment = appendLabelMapping(
    mappings,
    warnings,
    approximatedFields,
    "projection.direction.mainPeakTreatment",
    projection.direction.mainPeakTreatment,
    "peakTreatment",
    mapPeak(projection.direction.mainPeakTreatment),
  );
  const outroTreatment = appendLabelMapping(
    mappings,
    warnings,
    approximatedFields,
    "projection.direction.outroTreatment",
    projection.direction.outroTreatment,
    "outroTreatment",
    mapOutro(projection.direction.outroTreatment),
  );

  const breathiness = appendScoreMapping(
    mappings,
    warnings,
    "projection.direction.breathiness",
    projection.direction.breathiness,
    "performance.breathiness",
  );
  const vibrato = appendScoreMapping(
    mappings,
    warnings,
    "projection.direction.vibrato",
    projection.direction.vibrato,
    "performance.vibrato",
  );

  const timelineResult = convertRatiosToTimeline(
    projection.sectionDirections,
    durationSeconds,
    capability.supportsSectionControl,
    capability.supportsTimelineControl,
  );
  const timeline = timelineResult.timeline.map((item, index) => {
    const section = projection.sectionDirections[index];
    return {
      ...item,
      vocalIntensity: appendScoreMapping(
        mappings,
        warnings,
        "projection.sectionDirections." + index + ".vocalIntensity",
        section.vocalIntensity,
        "timeline." + index + ".vocalIntensity",
      ),
      tension: appendScoreMapping(
        mappings,
        warnings,
        "projection.sectionDirections." + index + ".tension",
        section.tension,
        "timeline." + index + ".tension",
      ),
      release: appendScoreMapping(
        mappings,
        warnings,
        "projection.sectionDirections." + index + ".release",
        section.release,
        "timeline." + index + ".release",
      ),
    };
  });

  const request: ReferenceVocalRequest = {
    requestSchemaVersion: "1.0",
    language: constraints.language,
    lyrics: input.assets.lyrics,
    durationSeconds,
    outputFormat,
    performance: {
      delivery,
      dynamics,
      breathiness,
      vibrato,
      articulation,
      emotionalExpression:
        projection.direction.emotionalExpression,
    },
    timeline,
    peakTreatment,
    outroTreatment,
    referenceVoiceAssetId:
      input.assets.referenceVoiceAsset &&
      capability.supportsReferenceVoice
        ? input.assets.referenceVoiceAsset.assetId
        : undefined,
    guideMelodyAssetId:
      input.assets.guideMelodyAsset &&
      capability.supportsGuideMelody
        ? input.assets.guideMelodyAsset.assetId
        : undefined,
  };

  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const degraded =
    uniqueWarnings.length > 0 ||
    approximatedFields.length > 0 ||
    omittedFields.length > 0 ||
    projection.validation.status !== "valid";
  return {
    contractVersion: "1.0",
    status: degraded ? "degraded" : "ready",
    request,
    warnings: uniqueWarnings,
    errors,
    mappings,
    fallbackUsed:
      mappings.some((item) =>
        ["clamped", "approximate", "fallback", "omitted", "collapsed"]
          .includes(item.mapping)
      ),
    omittedFields: [...omittedFields],
    approximatedFields: [...approximatedFields],
    capabilitySnapshot,
    adapterId: REFERENCE_VOCAL_ADAPTER_ID,
    adapterVersion: REFERENCE_VOCAL_ADAPTER_VERSION,
    reviewRequired: degraded || validation.reviewRequired,
  };
}

export function normalizeReferenceVocalError(
  error: unknown,
): NormalizedProviderError {
  return normalizeProviderError(error);
}

export function normalizeReferenceVocalResponse(
  response: ReferenceVocalResponse,
): NormalizedGenerationResult {
  const source = response && typeof response === "object"
    ? response as Partial<ReferenceVocalResponse>
    : {};
  const warnings: AdapterWarning[] = (
    Array.isArray(source.warnings) ? source.warnings : []
  ).map(
    () => warning(
      "capability-fallback",
      "Reference response included a generation warning.",
    ),
  );
  const assetIds = Array.isArray(source.outputAssetIds)
    ? [...new Set(source.outputAssetIds.filter((assetId) =>
        typeof assetId === "string" &&
        assetId.length > 0 &&
        assetId.length <= 256 &&
        !assetId.includes("://")
      ))]
    : [];
  const outputs = assetIds.map(
    (assetId, index) => ({
      assetId,
      kind: "voice" as const,
      role: index === 0 ? "primary" as const : "alternate" as const,
    }),
  );
  const declaredStatus = source.status;
  const status =
    declaredStatus === "completed" && outputs.length > 0
      ? "completed"
      : outputs.length > 0 ? "partial" : "failed";
  if (declaredStatus === "failed" && outputs.length > 0) {
    warnings.push(warning(
      "capability-fallback",
      "Failed response contained usable outputs and was normalized to partial.",
    ));
  }
  const failed = status === "failed";
  return {
    resultSchemaVersion: "1.0",
    status,
    providerId: REFERENCE_VOCAL_PROVIDER_ID,
    adapterId: REFERENCE_VOCAL_ADAPTER_ID,
    adapterVersion: REFERENCE_VOCAL_ADAPTER_VERSION,
    outputs,
    warnings: deduplicateReasonCodes(warnings),
    error: failed
      ? normalizeReferenceVocalError({
          code: source.errorCode ?? "generation-failed",
        })
      : undefined,
    providerJobReference:
      typeof source.jobReference === "string" &&
      source.jobReference.length > 0 &&
      !source.jobReference.includes("://")
        ? source.jobReference.slice(0, 128)
        : undefined,
    safeProviderMetadata: sanitizeSafeMetadata(
      source.metadata,
      ["durationSeconds", "format", "sampleRate"],
    ),
  };
}

export const referenceVocalAdapter: ProviderAdapter<
  VocalDecisionProjection,
  VocalWorkflowAssets,
  VocalGenerationConstraints,
  VocalProviderCapability,
  ReferenceVocalRequest,
  ReferenceVocalResponse,
  NormalizedGenerationResult
> = Object.freeze({
  contractVersion: "1.0",
  adapterId: REFERENCE_VOCAL_ADAPTER_ID,
  adapterVersion: REFERENCE_VOCAL_ADAPTER_VERSION,
  providerId: REFERENCE_VOCAL_PROVIDER_ID,
  providerApiVersion: REFERENCE_VOCAL_PROVIDER_API_VERSION,
  supportedDecisionSchemaVersions:
    REFERENCE_VOCAL_DECISION_SCHEMAS,
  validateInput: validateReferenceVocalInput,
  buildRequest: buildReferenceVocalRequest,
  normalizeResponse: normalizeReferenceVocalResponse,
  normalizeError: normalizeReferenceVocalError,
});
