import type {
  MVDecisionProjection, MVScene, MVScenePlan, MVScenePlanGateResult,
  SceneAction, SceneNarrativePurpose, SceneSetting, SceneSubject,
  TemporalMode, VisualMotif,
} from "@/lib/mvContracts";
import {
  clamp, cloneAndFreezeRecord, createMappingRecord, deduplicateReasonCodes,
  mapScoreToUnitRange, normalizeProviderError,
  resolveAdapterValidationStatus, sanitizeSafeMetadata,
} from "@/lib/providers/adapterUtils";
import type {
  AdapterBuildResult, AdapterIssue, AdapterMappingRecord,
  AdapterReasonCode, AdapterValidation, AdapterWarning,
  MVFrameRate, MVGenerationConstraints, MVOutputFormat,
  MVProviderCapability, MVResolution, MVWorkflowAssets,
  GeneratedAssetReference, NormalizedGenerationResult, NormalizedProviderError,
} from "@/lib/providers/types";

export const REFERENCE_MV_ADAPTER_ID = "reference-mv-v1";
export const REFERENCE_MV_ADAPTER_VERSION = "1.0.0";
export const REFERENCE_MV_PROVIDER_ID = "reference-mv";
export const REFERENCE_MV_CAPABILITY_VERSION = "reference-mv-capability-v1";
export const REFERENCE_MV_PROVIDER_API_VERSION = "reference-api-v1";
export const REFERENCE_MV_DECISION_SCHEMAS = Object.freeze(["1.0"] as const);
export const REFERENCE_MV_SCENE_PLAN_SCHEMAS = Object.freeze(["1.0"] as const);
export const REFERENCE_MV_REVIEW_CONFIDENCE = 70;

const aspectRatios = Object.freeze(["16:9", "9:16", "1:1"] as const);
const resolutions = Object.freeze(["720p", "1080p"] as const);
const frameRates = Object.freeze([24, 30] as const);
const formats = Object.freeze(["mp4"] as const);

export const REFERENCE_MV_CAPABILITY: MVProviderCapability = Object.freeze({
  kind: "mv",
  providerId: REFERENCE_MV_PROVIDER_ID,
  capabilityVersion: REFERENCE_MV_CAPABILITY_VERSION,
  providerApiVersion: REFERENCE_MV_PROVIDER_API_VERSION,
  supportedInputFormats: Object.freeze(["application/json", "audio/wav"]),
  supportedOutputFormats: formats,
  minDurationSeconds: 5,
  maxDurationSeconds: 600,
  supportsSeed: false,
  supportsSectionControl: true,
  supportsTimelineControl: true,
  supportsStructuredParameters: true,
  supportsTextPrompt: false,
  scene: Object.freeze({
    supportsMultiScene: true, supportsSceneControl: true,
    supportsShotList: false,
  }),
  visual: Object.freeze({
    supportsCameraEnergy: true, supportsMovementControl: true,
    supportsLightingControl: true, supportsColorControl: true,
    supportsTransitionControl: true, supportsSubjectControl: true,
    supportsEnvironmentControl: true,
  }),
  continuity: Object.freeze({
    supportsCharacterConsistency: true, supportsReferenceImage: true,
    supportsReferenceVideo: false, supportsFirstFrame: true,
    supportsLastFrame: false,
  }),
  media: Object.freeze({ supportsAudioConditioning: true }),
  output: Object.freeze({
    supportedAspectRatios: aspectRatios,
    supportedResolutions: resolutions,
    supportedFrameRates: frameRates,
    supportedFormats: formats,
  }),
  maxReferenceImages: 4,
});

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
  peak: { sceneId: string; treatment: MVDecisionProjection["direction"]["mainPeakTreatment"] };
  afterglow: { sceneId: string; treatment: MVDecisionProjection["direction"]["afterglowTreatment"] };
};
export type ReferenceMVResponse = {
  status: "completed" | "partial" | "failed";
  outputAssetIds: string[];
  previewAssetIds?: string[];
  warnings?: string[];
  jobReference?: string;
  metadata?: Readonly<Record<string, unknown>>;
  errorCode?: string;
};
export type ReferenceMVAdapterInput = {
  contractVersion: "1.0";
  projection: MVDecisionProjection;
  scenePlan: MVScenePlan;
  gate: MVScenePlanGateResult;
  assets: MVWorkflowAssets;
  constraints: MVGenerationConstraints;
  capability: MVProviderCapability;
};

const issue = (
  code: AdapterReasonCode, summary: string, sourceField?: string,
  classification: AdapterIssue["classification"] = "invalid",
): AdapterIssue => ({ code, classification, summary, sourceField });
const warning = (
  code: AdapterReasonCode, summary: string, sourceField?: string,
  targetField?: string,
): AdapterWarning => ({ code, summary, sourceField, targetField });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeId = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 256 &&
  !value.includes("://");
const round6 = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

function cloneCapability(capability: MVProviderCapability): MVProviderCapability {
  return Object.freeze({
    ...capability,
    supportedInputFormats: Object.freeze([...capability.supportedInputFormats]),
    supportedOutputFormats: Object.freeze([...capability.supportedOutputFormats]),
    scene: Object.freeze({ ...capability.scene }),
    visual: Object.freeze({ ...capability.visual }),
    continuity: Object.freeze({ ...capability.continuity }),
    media: Object.freeze({ ...capability.media }),
    output: Object.freeze({
      ...capability.output,
      supportedAspectRatios: Object.freeze([...capability.output.supportedAspectRatios]),
      supportedResolutions: Object.freeze([...capability.output.supportedResolutions]),
      supportedFrameRates: Object.freeze([...capability.output.supportedFrameRates]),
      supportedFormats: Object.freeze([...capability.output.supportedFormats]),
    }),
    extensions: capability.extensions
      ? cloneAndFreezeRecord(capability.extensions) : undefined,
  });
}

function validCapabilityShape(value: unknown): value is MVProviderCapability {
  return isRecord(value) && value.kind === "mv" &&
    isRecord(value.scene) && isRecord(value.visual) &&
    isRecord(value.continuity) && isRecord(value.media) &&
    isRecord(value.output) &&
    Array.isArray(value.supportedInputFormats) &&
    Array.isArray(value.supportedOutputFormats) &&
    Array.isArray(value.output.supportedAspectRatios) &&
    Array.isArray(value.output.supportedResolutions) &&
    Array.isArray(value.output.supportedFrameRates) &&
    Array.isArray(value.output.supportedFormats);
}

function validAsset(value: unknown, kinds: readonly string[], prefixes: readonly string[]) {
  if (!isRecord(value) || !safeId(value.assetId) || !kinds.includes(String(value.kind))) return false;
  return value.mimeType === undefined ||
    (typeof value.mimeType === "string" && prefixes.some((p) => (value.mimeType as string).startsWith(p)));
}

function allWorkflowAssets(assets: MVWorkflowAssets) {
  return [
    assets.audioAsset,
    ...(assets.referenceImages ?? []),
    ...(assets.referenceVideo ? [assets.referenceVideo] : []),
    ...(assets.characterAssets ?? []).map((item) => item.asset),
    ...(assets.locationAssets ?? []).map((item) => item.asset),
    ...(assets.brandAssets ?? []),
    ...(assets.performerAsset ? [assets.performerAsset.asset] : []),
  ];
}

function validateProjection(value: unknown): value is MVDecisionProjection {
  return isRecord(value) && value.decisionSchemaVersion === "1.0" &&
    isRecord(value.overallDirection) && isRecord(value.direction) &&
    isRecord(value.validation) && Array.isArray(value.sectionDirections) &&
    value.sectionDirections.length === 5 && Number.isFinite(value.confidence);
}

function validateTimeline(plan: MVScenePlan) {
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 5) return false;
  return plan.scenes.every((scene, index) => {
    const previous = plan.scenes[index - 1];
    return isRecord(scene) && typeof scene.sceneId === "string" &&
      scene.order === index + 1 && Number.isFinite(scene.startSeconds) &&
      Number.isFinite(scene.endSeconds) && scene.startSeconds < scene.endSeconds &&
      (index === 0 ? scene.startSeconds === 0 : scene.startSeconds === previous.endSeconds);
  }) && plan.scenes.at(-1)?.endSeconds === plan.durationSeconds &&
    new Set(plan.scenes.map((scene) => scene.sceneId)).size === plan.scenes.length;
}

function assignedIds(plan: MVScenePlan) {
  return plan.scenes.flatMap((scene) => scene.assetRefs.map((asset) => asset.assetId));
}

export function validateReferenceMVInput(input: ReferenceMVAdapterInput): AdapterValidation {
  const errors: AdapterIssue[] = [];
  const warnings: AdapterWarning[] = [];
  const projection = input?.projection;
  const plan = input?.scenePlan;
  const gate = input?.gate;
  const assets = input?.assets;
  const constraints = input?.constraints;
  const capability = input?.capability;

  if (input?.contractVersion !== "1.0") errors.push(issue("decision-schema-unsupported", "Adapter contract version is unsupported.", "contractVersion"));
  if (!validateProjection(projection)) errors.push(issue("decision-schema-unsupported", "MV projection shape or schema is invalid.", "projection"));
  if (!isRecord(plan) || plan.schemaVersion !== "1.0") errors.push(issue("scene-plan-schema-unsupported", "Scene plan schema is unsupported.", "scenePlan.schemaVersion"));
  if (isRecord(plan) && plan.validation?.status === "invalid") errors.push(issue("scene-plan-invalid", "Invalid scene plan cannot be adapted.", "scenePlan.validation"));
  if (!isRecord(gate) || gate.allowed !== true) errors.push(issue("scene-plan-gate-denied", "Workflow gate denied adapter execution.", "gate.allowed"));

  if (isRecord(plan) && isRecord(constraints)) {
    const duration = plan.durationSeconds;
    const tolerance = Math.max(0.25, duration * 0.005);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(constraints.durationSeconds) ||
        Math.abs(duration - (constraints.durationSeconds as number)) - tolerance > 1e-9) {
      errors.push(issue("audio-duration-mismatch", "Scene plan and constraint durations do not match.", "constraints.durationSeconds"));
    }
    if (plan.aspectRatio !== constraints.aspectRatio) errors.push(issue("aspect-ratio-mismatch", "Scene plan and constraint aspect ratios do not match.", "constraints.aspectRatio"));
  }
  if (isRecord(plan) && !validateTimeline(plan as MVScenePlan)) errors.push(issue("scene-timeline-invalid", "Scene timeline is invalid.", "scenePlan.scenes"));
  if (isRecord(plan) && validateProjection(projection)) {
    const peaks = (plan as MVScenePlan).scenes?.filter((scene) => scene.isMainPeak) ?? [];
    if (peaks.length !== 1 || peaks[0]?.section !== projection.overallDirection.mainPeakSection) errors.push(issue("scene-main-peak-invalid", "Primary peak does not match the directed section.", "scenePlan.scenes"));
    const afterglows = (plan as MVScenePlan).scenes?.filter((scene) => scene.isAfterglow) ?? [];
    if (afterglows.length !== 1 || afterglows[0] !== (plan as MVScenePlan).scenes.at(-1) || afterglows[0]?.section !== "outro") errors.push(issue("scene-afterglow-invalid", "Afterglow must be the final outro scene.", "scenePlan.scenes"));
  }

  if (!isRecord(assets) || !validAsset(assets.audioAsset, ["audio"], ["audio/"])) {
    errors.push(issue("required-asset-missing", "A valid audio asset is required.", "assets.audioAsset"));
  } else if (isRecord(plan) && Number.isFinite(assets.audioAsset.durationSeconds)) {
    const tolerance = Math.max(0.25, plan.durationSeconds * 0.005);
    if (Math.abs((assets.audioAsset.durationSeconds as number) - plan.durationSeconds) - tolerance > 1e-9) errors.push(issue("audio-duration-mismatch", "Audio duration does not match the scene plan.", "assets.audioAsset.durationSeconds"));
  }
  if (isRecord(assets)) {
    const workflow = allWorkflowAssets(assets as MVWorkflowAssets);
    if (workflow.some((asset) => !safeId(asset?.assetId)) ||
        new Set(workflow.map((asset) => asset.assetId)).size !== workflow.length) {
      errors.push(issue("scene-asset-missing", "Workflow assets contain an invalid or duplicate reference.", "assets"));
    }
    if (isRecord(plan)) {
      const available = new Set(workflow.map((asset) => asset.assetId));
      if (assignedIds(plan as MVScenePlan).some((id) => !available.has(id))) errors.push(issue("scene-asset-missing", "A scene-assigned asset is unavailable.", "scenePlan.scenes"));
      const characterSubjects = new Set(
        (plan as MVScenePlan).scenes
          .filter((scene) => scene.subject.type === "character")
          .map((scene) => (scene.subject as { characterRef: string }).characterRef),
      );
      const primaryCharacters = new Set(
        ((assets as MVWorkflowAssets).characterAssets ?? [])
          .filter((entry) => entry.continuityRole === "identity-primary")
          .map((entry) => entry.characterRef),
      );
      if ([...characterSubjects].some((ref) => !primaryCharacters.has(ref))) {
        errors.push(issue("scene-asset-missing", "A primary character identity asset is unavailable.", "assets.characterAssets"));
      }
      const performerMissing = (plan as MVScenePlan).scenes.some((scene) =>
        scene.subject.type === "performance" && scene.subject.performerRef &&
        (assets as MVWorkflowAssets).performerAsset?.characterRef !== scene.subject.performerRef);
      if (performerMissing) errors.push(issue("required-performer-asset-missing", "A required performer asset is unavailable.", "assets.performerAsset"));
    }
  }

  if (!validCapabilityShape(capability) || capability.capabilityVersion !== REFERENCE_MV_CAPABILITY_VERSION) {
    errors.push(issue("capability-version-unsupported", "MV capability kind or version is unsupported.", "capability.capabilityVersion"));
  } else {
    if (!capability.scene.supportsMultiScene) errors.push(issue("multi-scene-unsupported", "Required multi-scene intent is unsupported.", "capability.scene.supportsMultiScene", "unsupported"));
    if (!capability.supportsTimelineControl) errors.push(issue("timeline-control-unavailable", "Required scene timeline control is unavailable.", "capability.supportsTimelineControl", "unsupported"));
    if (!capability.scene.supportsSceneControl || !capability.supportsSectionControl) errors.push(issue("scene-control-unavailable", "Required scene or section control is unavailable.", "capability.scene", "unsupported"));
    if (isRecord(plan) && (plan as MVScenePlan).scenes.some((scene) => scene.subject.type === "character") && !capability.continuity.supportsCharacterConsistency) errors.push(issue("character-consistency-unavailable", "Primary character consistency is unsupported.", "capability.continuity", "unsupported"));
    if (isRecord(plan) && !capability.output.supportedAspectRatios.includes(plan.aspectRatio)) errors.push(issue("aspect-ratio-unsupported", "Requested aspect ratio is unsupported.", "scenePlan.aspectRatio", "unsupported"));
    if (constraints?.outputFormat !== "mp4") errors.push(issue("unsupported-field-omitted", "Requested output format is unsupported.", "constraints.outputFormat", "unsupported"));
    if (constraints?.resolution === "2160p") warnings.push(warning("resolution-substituted", "Resolution will use the fixed supported substitute.", "constraints.resolution", "resolution"));
    if (constraints?.frameRate === 60) warnings.push(warning("frame-rate-substituted", "Frame rate will use the fixed supported substitute.", "constraints.frameRate", "frameRate"));
    if (constraints?.seed !== undefined) {
      if (!Number.isFinite(constraints.seed)) errors.push(issue("provider-limit-applied", "Seed must be finite.", "constraints.seed"));
      else if (!capability.supportsSeed) warnings.push(warning("seed-omitted", "Seed is unsupported and will be omitted.", "constraints.seed"));
    }
    if (isRecord(plan) && isRecord(assets)) {
      const lookup = new Map(allWorkflowAssets(assets as MVWorkflowAssets).map((asset) => [asset.assetId, asset]));
      const assigned = assignedIds(plan as MVScenePlan).map((id) => lookup.get(id)).filter(Boolean);
      const images = assigned.filter((asset) => asset?.kind === "image");
      const videos = assigned.filter((asset) => asset?.kind === "video");
      if ((!capability.continuity.supportsReferenceImage && images.length) || images.length > capability.maxReferenceImages) warnings.push(warning("reference-image-omitted", "Some optional reference images will be omitted.", "scenePlan.scenes", "scenes.assetIds"));
      if (!capability.continuity.supportsReferenceVideo && videos.length) warnings.push(warning("reference-video-omitted", "Optional reference video will be omitted.", "scenePlan.scenes", "scenes.assetIds"));
    }
  }
  if (plan?.validation?.status === "normalized") warnings.push(warning("scene-plan-normalized", "Normalized scene plan requires review.", "scenePlan.validation"));
  if (plan?.validation?.status === "fallback") warnings.push(warning("scene-plan-fallback", "Fallback scene plan requires review.", "scenePlan.validation"));
  if (projection && (!Number.isFinite(projection.confidence) || projection.confidence < REFERENCE_MV_REVIEW_CONFIDENCE)) warnings.push(warning("capability-fallback", "Director input confidence is below the review threshold.", "projection.confidence"));
  if (plan && (!Number.isFinite(plan.confidence) || plan.confidence < REFERENCE_MV_REVIEW_CONFIDENCE)) warnings.push(warning("capability-fallback", "Planner confidence is below the review threshold.", "scenePlan.confidence"));

  const uniqueErrors = deduplicateReasonCodes(errors);
  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const status = resolveAdapterValidationStatus(uniqueErrors, uniqueWarnings);
  return {
    status, errors: uniqueErrors, warnings: uniqueWarnings,
    reviewRequired: gate?.allowed === false || status === "degraded" ||
      plan?.validation?.status === "normalized" || plan?.validation?.status === "fallback" ||
      (projection?.confidence ?? 0) < REFERENCE_MV_REVIEW_CONFIDENCE ||
      (plan?.confidence ?? 0) < REFERENCE_MV_REVIEW_CONFIDENCE,
  };
}

function scoreMapping(
  mappings: AdapterMappingRecord[], warnings: AdapterWarning[],
  sourceField: string, value: number, targetField: string,
) {
  const target = mapScoreToUnitRange(value);
  const changed = !Number.isFinite(value) || value < 0 || value > 100;
  mappings.push(createMappingRecord({
    sourceField, sourceValue: Number.isFinite(value) ? value : undefined,
    targetField, targetValue: target,
    mapping: changed ? "clamped" : "normalized",
    reasonCode: changed ? "score-range-clamped" : undefined,
  }));
  if (changed) warnings.push(warning("score-range-clamped", "Score was clamped to the Director range.", sourceField, targetField));
  return target;
}

function exactLabel(
  mappings: AdapterMappingRecord[], sourceField: string,
  value: string, targetField: string,
) {
  mappings.push(createMappingRecord({ sourceField, sourceValue: value.slice(0, 80), targetField, targetValue: value.slice(0, 80), mapping: "exact" }));
  return value;
}

export function buildReferenceMVRequest(
  input: ReferenceMVAdapterInput,
): AdapterBuildResult<ReferenceMVRequest, MVProviderCapability> {
  const validation = validateReferenceMVInput(input);
  const snapshot = cloneCapability(
    validCapabilityShape(input?.capability)
      ? input.capability : REFERENCE_MV_CAPABILITY,
  );
  if (validation.status === "invalid" || validation.status === "unsupported") {
    return {
      contractVersion: "1.0", status: validation.status,
      warnings: validation.warnings.map((item) => ({ ...item })),
      errors: validation.errors.map((item) => ({ ...item })), mappings: [],
      fallbackUsed: false, omittedFields: [], approximatedFields: [],
      capabilitySnapshot: snapshot, adapterId: REFERENCE_MV_ADAPTER_ID,
      adapterVersion: REFERENCE_MV_ADAPTER_VERSION,
      reviewRequired: validation.reviewRequired,
    };
  }
  const warnings = validation.warnings.map((item) => ({ ...item }));
  const mappings: AdapterMappingRecord[] = [];
  const omittedFields: string[] = [];
  const approximatedFields: string[] = [];
  const { projection, scenePlan: plan, constraints, capability, assets } = input;
  const resolution: "720p" | "1080p" = constraints.resolution === "2160p" ? "1080p" : constraints.resolution;
  const frameRate: 24 | 30 = constraints.frameRate === 24 ? 24 : 30;
  mappings.push(createMappingRecord({ sourceField: "constraints.resolution", sourceValue: constraints.resolution, targetField: "resolution", targetValue: resolution, mapping: resolution === constraints.resolution ? "exact" : "fallback", reasonCode: resolution === constraints.resolution ? undefined : "resolution-substituted" }));
  mappings.push(createMappingRecord({ sourceField: "constraints.frameRate", sourceValue: constraints.frameRate, targetField: "frameRate", targetValue: frameRate, mapping: constraints.frameRate === undefined ? "normalized" : frameRate === constraints.frameRate ? "exact" : "fallback", reasonCode: constraints.frameRate === 60 ? "frame-rate-substituted" : undefined }));
  if (resolution !== constraints.resolution) approximatedFields.push("constraints.resolution");
  if (constraints.frameRate === 60) approximatedFields.push("constraints.frameRate");
  if (constraints.seed !== undefined && !capability.supportsSeed) {
    omittedFields.push("constraints.seed");
    mappings.push(createMappingRecord({ sourceField: "constraints.seed", sourceValue: constraints.seed, mapping: "omitted", reasonCode: "seed-omitted" }));
  }
  const lookup = new Map(allWorkflowAssets(assets).map((asset) => [asset.assetId, asset]));
  const imageOrder = assignedIds(plan).filter((id) => lookup.get(id)?.kind === "image");
  const selectedImages = new Set(imageOrder.slice(0, capability.maxReferenceImages));
  const direction = projection.direction;
  const cameraEnergy = scoreMapping(mappings, warnings, "projection.direction.cameraEnergy", direction.cameraEnergy, "globalDirection.cameraEnergy");
  const shotDensity = scoreMapping(mappings, warnings, "projection.direction.shotDensity", direction.shotDensity, "globalDirection.shotDensity");
  const transitionIntensity = scoreMapping(mappings, warnings, "projection.direction.transitionIntensity", direction.transitionIntensity, "globalDirection.transitionIntensity");
  const labelEntries = [
    ["visualMood", "visualMood", direction.visualMood],
    ["colorDirection", "color", direction.colorDirection],
    ["lightingDirection", "lighting", direction.lightingDirection],
    ["movementStyle", "movement", direction.movementStyle],
    ["subjectFocus", "subjectFocus", direction.subjectFocus],
    ["environmentDirection", "environment", direction.environmentDirection],
  ] as const;
  for (const [source, target, value] of labelEntries) exactLabel(mappings, `projection.direction.${source}`, value, `globalDirection.${target}`);
  const sections = new Map(projection.sectionDirections.map((section) => [section.section, section]));
  const scenes = plan.scenes.map((scene, index): ReferenceMVSceneInstruction => {
    const prefix = `scenePlan.scenes.${index}`;
    for (const [field, value] of [
      ["narrativePurpose", scene.narrativePurpose], ["subject.type", scene.subject.type],
      ["setting.environment", scene.setting.environment], ["action.actionType", scene.action.actionType],
      ["temporalMode", scene.temporalMode], ["visualMotif.kind", scene.visualMotif?.kind],
    ] as const) if (value) exactLabel(mappings, `${prefix}.${field}`, value, `scenes.${index}.${field}`);
    const assetIds = scene.assetRefs.map((ref) => ref.assetId).filter((id) => {
      const asset = lookup.get(id);
      if (asset?.kind === "video" && !capability.continuity.supportsReferenceVideo) {
        if (!omittedFields.includes(`${prefix}.assetRefs`)) omittedFields.push(`${prefix}.assetRefs`);
        return false;
      }
      if (asset?.kind === "image" &&
          (!capability.continuity.supportsReferenceImage || !selectedImages.has(id))) {
        if (!omittedFields.includes(`${prefix}.assetRefs`)) omittedFields.push(`${prefix}.assetRefs`);
        return false;
      }
      return true;
    });
    const section = sections.get(scene.section)!;
    return {
      sceneId: scene.sceneId, section: scene.section,
      startSeconds: scene.startSeconds, endSeconds: scene.endSeconds,
      narrativePurpose: scene.narrativePurpose,
      subject: structuredClone(scene.subject), setting: structuredClone(scene.setting),
      action: structuredClone(scene.action), emotionalIntent: scene.emotionalIntent,
      temporalMode: scene.temporalMode,
      visualMotif: scene.visualMotif ? structuredClone(scene.visualMotif) : undefined,
      visualIntensity: scoreMapping(mappings, warnings, `projection.sectionDirections.${scene.section}.visualIntensity`, section.visualIntensity, `scenes.${index}.visualIntensity`),
      cameraEnergy, transitionIntensity,
      isMainPeak: scene.isMainPeak, isAfterglow: scene.isAfterglow, assetIds,
    };
  });
  const peak = plan.scenes.find((scene) => scene.isMainPeak)!;
  const afterglow = plan.scenes.find((scene) => scene.isAfterglow)!;
  exactLabel(mappings, "projection.direction.mainPeakTreatment", direction.mainPeakTreatment, "peak.treatment");
  exactLabel(mappings, "projection.direction.afterglowTreatment", direction.afterglowTreatment, "afterglow.treatment");
  const request: ReferenceMVRequest = {
    requestSchemaVersion: "1.0", durationSeconds: plan.durationSeconds,
    aspectRatio: plan.aspectRatio, resolution, frameRate, outputFormat: "mp4",
    audioAssetId: assets.audioAsset.assetId,
    globalDirection: {
      visualMood: direction.visualMood, color: direction.colorDirection,
      lighting: direction.lightingDirection, cameraEnergy,
      movement: direction.movementStyle, shotDensity, transitionIntensity,
      subjectFocus: direction.subjectFocus, environment: direction.environmentDirection,
    },
    scenes,
    peak: { sceneId: peak.sceneId, treatment: direction.mainPeakTreatment },
    afterglow: { sceneId: afterglow.sceneId, treatment: direction.afterglowTreatment },
  };
  const uniqueWarnings = deduplicateReasonCodes(warnings);
  const degraded = uniqueWarnings.length > 0 || omittedFields.length > 0 ||
    approximatedFields.length > 0 || plan.validation.status !== "valid";
  return {
    contractVersion: "1.0", status: degraded ? "degraded" : "ready", request,
    warnings: uniqueWarnings, errors: [], mappings,
    fallbackUsed: mappings.some((item) => ["clamped", "approximate", "fallback", "omitted", "collapsed"].includes(item.mapping)),
    omittedFields, approximatedFields, capabilitySnapshot: snapshot,
    adapterId: REFERENCE_MV_ADAPTER_ID,
    adapterVersion: REFERENCE_MV_ADAPTER_VERSION,
    reviewRequired: degraded || validation.reviewRequired,
  };
}

export const normalizeReferenceMVError = (error: unknown): NormalizedProviderError =>
  normalizeProviderError(error);

export function normalizeReferenceMVResponse(response: ReferenceMVResponse): NormalizedGenerationResult {
  const source = isRecord(response) ? response as Partial<ReferenceMVResponse> : {};
  const warnings: AdapterWarning[] = (Array.isArray(source.warnings) ? source.warnings : [])
    .map(() => warning("capability-fallback", "Reference response included a generation warning."));
  const ids = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.filter(safeId) as string[])] : [];
  const outputs: GeneratedAssetReference[] = ids(source.outputAssetIds).map((assetId, index) => ({
    assetId, kind: "video" as const,
    role: index === 0 ? "primary" as const : "alternate" as const,
  }));
  const existing = new Set(outputs.map((item) => item.assetId));
  outputs.push(...ids(source.previewAssetIds).filter((id) => !existing.has(id)).map((assetId) => ({
    assetId, kind: "video" as const, role: "preview" as const,
  })));
  const status = source.status === "completed" && outputs.length > 0
    ? "completed" : outputs.length > 0 ? "partial" : "failed";
  if (source.status === "failed" && outputs.length > 0) warnings.push(warning("capability-fallback", "Failed response contained usable outputs and was normalized to partial."));
  return {
    resultSchemaVersion: "1.0", status,
    providerId: REFERENCE_MV_PROVIDER_ID, adapterId: REFERENCE_MV_ADAPTER_ID,
    adapterVersion: REFERENCE_MV_ADAPTER_VERSION, outputs,
    warnings: deduplicateReasonCodes(warnings),
    error: status === "failed" ? normalizeReferenceMVError({ code: source.errorCode ?? "generation-failed" }) : undefined,
    providerJobReference: typeof source.jobReference === "string" && safeId(source.jobReference)
      ? source.jobReference.slice(0, 128) : undefined,
    safeProviderMetadata: sanitizeSafeMetadata(source.metadata,
      ["durationSeconds", "width", "height", "frameRate", "format", "sceneCount"]),
  };
}

export const referenceMVAdapter = Object.freeze({
  contractVersion: "1.0" as const,
  adapterId: REFERENCE_MV_ADAPTER_ID,
  adapterVersion: REFERENCE_MV_ADAPTER_VERSION,
  providerId: REFERENCE_MV_PROVIDER_ID,
  providerApiVersion: REFERENCE_MV_PROVIDER_API_VERSION,
  supportedDecisionSchemaVersions: REFERENCE_MV_DECISION_SCHEMAS,
  validateInput: validateReferenceMVInput,
  buildRequest: buildReferenceMVRequest,
  normalizeResponse: normalizeReferenceMVResponse,
  normalizeError: normalizeReferenceMVError,
});
