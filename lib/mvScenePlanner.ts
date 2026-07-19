import type {
  DirectorDecision,
  MVDirection,
  NarrativeDirection,
  OverallDirection,
  SectionDirection,
} from "@/lib/directorDecisionEngine";
import type {
  EmotionSectionName,
} from "@/lib/emotionEngine";

// Canonical shared MV contracts live outside the provider and planner layers.
export type * from "@/lib/mvContracts";

export const MV_SCENE_PLANNER_CONTRACT_VERSION = "1.0" as const;
export const MV_SCENE_PLAN_SCHEMA_VERSION = "1.0" as const;
export const MV_SCENE_PLANNER_VERSION = "rule-v1" as const;
export const MV_SCENE_PLANNER_REVIEW_CONFIDENCE = 70;

const SECTION_ORDER = Object.freeze([
  "verse", "pre-chorus", "chorus", "bridge", "outro",
] as const);
const ASPECT_RATIOS = Object.freeze(["16:9", "9:16", "1:1", "4:5"] as const);
const PERFORMANCE_MODES = Object.freeze(["narrative", "performance", "hybrid"] as const);
const BUILT_IN_MOTIFS = Object.freeze([
  "light", "rain", "mirror", "road", "flower", "sky",
  "water", "fire", "shadow", "door", "photograph", "empty-room",
] as const);
const CHARACTER_REF_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

import type {
  AssetReference,
  AspectRatio,
  BuiltInVisualMotif,
  CharacterAssetReference,
  CharacterContinuity,
  CharacterStateChange,
  ContinuityPlan,
  EnvironmentType,
  LyricsInput,
  MVDecisionProjection,
  MVScene,
  MVScenePlan,
  MVScenePlannerAssets,
  MVScenePlannerConstraints,
  MVScenePlannerInput,
  MVScenePlannerIssueCode,
  MVScenePlannerReasonCode,
  MVScenePlanRationale,
  MVScenePlanResult,
  MVScenePlanValidationStatus,
  NarrativeArc,
  PerformanceMode,
  SceneAction,
  SceneActionType,
  SceneAssetReference,
  SceneNarrativePurpose,
  SceneSetting,
  SceneSubject,
  StoryInput,
  TemporalMode,
  TemporalTransition,
  VisualMotif,
} from "@/lib/mvContracts";

type PreparedInput = {
  input: MVScenePlannerInput;
  issues: MVScenePlannerIssueCode[];
  storyPresent: boolean;
  lyricsPresent: boolean;
  structuredConflict: boolean;
  performanceMode: PerformanceMode;
  sceneCount: number;
  sceneCountReduced: boolean;
  charactersMissingAssets: boolean;
};

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeText = (value: unknown, max = 80) =>
  typeof value === "string" && value.length <= max &&
  !value.includes("://") && !/[\r\n]/.test(value);
const unique = <T>(values: readonly T[]) => [...new Set(values)];
const isSection = (value: unknown): value is EmotionSectionName =>
  SECTION_ORDER.includes(value as EmotionSectionName);
const isSafeRef = (value: unknown) =>
  typeof value === "string" && CHARACTER_REF_PATTERN.test(value);
const isSafeAssetId = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 256 &&
  !value.includes("://");

function cloneOverall(value: OverallDirection): OverallDirection {
  return { ...value, afterglow: { ...value.afterglow } };
}

export function createMVDecisionProjection(
  decision: DirectorDecision,
): MVDecisionProjection {
  return {
    decisionSchemaVersion: decision.schemaVersion,
    engineVersion: decision.engineVersion,
    normalizedPreset: decision.normalizedPreset,
    overallDirection: cloneOverall(decision.overallDirection),
    sectionDirections: decision.sectionDirections.map((section) => ({ ...section })),
    validation: {
      status: decision.validation.status,
      issueCodes: [...decision.validation.issueCodes],
    },
    confidence: decision.overallDirection.confidence,
    direction: { ...decision.mvDirection },
  };
}

function addIssue(
  issues: MVScenePlannerIssueCode[],
  code: MVScenePlannerIssueCode,
) {
  if (!issues.includes(code)) issues.push(code);
}

function validProjection(value: unknown): value is MVDecisionProjection {
  if (!isRecord(value) || value.decisionSchemaVersion !== "1.0" ||
      !isRecord(value.overallDirection) || !isRecord(value.direction) ||
      !isRecord(value.validation) || !Array.isArray(value.sectionDirections) ||
      value.sectionDirections.length !== 5 || !Number.isFinite(value.confidence)) return false;
  const sections = value.sectionDirections as unknown as SectionDirection[];
  return sections.every((section, index) => {
    const previous = sections[index - 1];
    return isRecord(section) && section.section === SECTION_ORDER[index] &&
      Number.isFinite(section.startRatio) && Number.isFinite(section.endRatio) &&
      section.startRatio >= 0 && section.endRatio <= 1 &&
      section.startRatio < section.endRatio &&
      (index === 0 ? section.startRatio === 0 : section.startRatio === previous.endRatio);
  }) && sections.at(-1)?.endRatio === 1 &&
    sections.filter((section) => section.isMainPeak).length === 1 &&
    sections.find((section) => section.isMainPeak)?.section ===
      value.overallDirection.mainPeakSection &&
    isSection(value.overallDirection.mainPeakSection) &&
    isRecord(value.overallDirection.afterglow);
}

function validAsset(
  value: unknown,
  kinds: readonly AssetReference["kind"][],
  mimePrefixes: readonly string[],
): value is AssetReference {
  if (!isRecord(value) || !isSafeAssetId(value.assetId) ||
      !kinds.includes(value.kind as AssetReference["kind"])) return false;
  const mimeType = value.mimeType;
  return mimeType === undefined ||
    (typeof mimeType === "string" &&
      mimePrefixes.some((prefix) => mimeType.startsWith(prefix)));
}

function hasInputText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCharacters(story: unknown, issues: MVScenePlannerIssueCode[]) {
  if (!isRecord(story) || story.characters === undefined) return;
  if (!Array.isArray(story.characters)) {
    addIssue(issues, "invalid-character-reference");
    return;
  }
  const ids = new Set<string>();
  for (const item of story.characters) {
    if (!isRecord(item) || !isSafeRef(item.characterId) ||
        !safeText(item.safeLabel) || ids.has(item.characterId as string)) {
      addIssue(issues, "invalid-character-reference");
      continue;
    }
    ids.add(item.characterId as string);
  }
}

function validateEvents(story: unknown, issues: MVScenePlannerIssueCode[]) {
  if (!isRecord(story) || story.events === undefined) return;
  if (!Array.isArray(story.events)) {
    addIssue(issues, "invalid-character-reference");
    return;
  }
  const characters = new Set(
    Array.isArray(story.characters)
      ? story.characters.filter(isRecord).map((item) => item.characterId)
      : [],
  );
  const eventIds = new Set<string>();
  for (const event of story.events) {
    if (!isRecord(event) || !isSafeRef(event.eventId) ||
        !Number.isInteger(event.order) || (event.order as number) < 1 ||
        !safeText(event.summary, 120) || eventIds.has(event.eventId as string)) {
      addIssue(issues, "invalid-character-reference");
      continue;
    }
    eventIds.add(event.eventId as string);
    if (Array.isArray(event.characterRefs) &&
        event.characterRefs.some((ref) => !characters.has(ref))) {
      addIssue(issues, "invalid-character-reference");
    }
  }
}

function validateAssets(
  assets: unknown,
  story: unknown,
  issues: MVScenePlannerIssueCode[],
): { charactersMissingAssets: boolean } {
  if (!isRecord(assets)) {
    addIssue(issues, "invalid-asset-reference");
    return { charactersMissingAssets: false };
  }
  const storyCharacterIds = new Set<string>(
    isRecord(story) && Array.isArray(story.characters)
      ? story.characters.filter(isRecord).map((item) => String(item.characterId))
      : [],
  );
  const storyLocation = isRecord(story) && isRecord(story.setting) &&
    typeof story.setting.locationRef === "string"
      ? story.setting.locationRef : undefined;
  const seenAssetIds = new Set<string>();
  const register = (asset: unknown, kinds: readonly AssetReference["kind"][], prefixes: readonly string[]) => {
    if (!validAsset(asset, kinds, prefixes)) {
      addIssue(issues, "invalid-asset-reference");
      return;
    }
    if (seenAssetIds.has(asset.assetId)) addIssue(issues, "invalid-asset-reference");
    seenAssetIds.add(asset.assetId);
  };
  if (assets.referenceImages !== undefined) {
    if (!Array.isArray(assets.referenceImages)) addIssue(issues, "invalid-asset-reference");
    else assets.referenceImages.forEach((asset) => register(asset, ["image"], ["image/"]));
  }
  if (assets.referenceVideo !== undefined) register(assets.referenceVideo, ["video"], ["video/"]);
  if (assets.audioAsset !== undefined) register(assets.audioAsset, ["audio"], ["audio/"]);
  if (assets.brandAssets !== undefined) {
    if (!Array.isArray(assets.brandAssets)) addIssue(issues, "invalid-asset-reference");
    else assets.brandAssets.forEach((asset) => register(asset, ["brand", "image"], ["image/"]));
  }
  const primaryByCharacter = new Set<string>();
  const characterAssets = [
    ...(Array.isArray(assets.characterAssets) ? assets.characterAssets : []),
    ...(assets.performerAsset === undefined ? [] : [assets.performerAsset]),
  ];
  if (assets.characterAssets !== undefined && !Array.isArray(assets.characterAssets)) {
    addIssue(issues, "invalid-asset-reference");
  }
  for (const entry of characterAssets) {
    if (!isRecord(entry) || !isSafeRef(entry.characterRef) ||
        !storyCharacterIds.has(entry.characterRef as string) ||
        !["identity-primary", "identity-alternate", "appearance", "costume"]
          .includes(String(entry.continuityRole))) {
      addIssue(issues, "invalid-character-reference");
      continue;
    }
    if (entry.continuityRole === "identity-primary") {
      if (primaryByCharacter.has(entry.characterRef as string)) {
        addIssue(issues, "invalid-asset-reference");
      }
      primaryByCharacter.add(entry.characterRef as string);
    }
    register(entry.asset, ["character", "image", "video"], ["image/", "video/"]);
  }
  if (assets.locationAssets !== undefined) {
    if (!Array.isArray(assets.locationAssets)) addIssue(issues, "invalid-asset-reference");
    else for (const entry of assets.locationAssets) {
      if (!isRecord(entry) || !isSafeRef(entry.locationRef) ||
          (storyLocation !== undefined && entry.locationRef !== storyLocation)) {
        addIssue(issues, "invalid-location-reference");
        continue;
      }
      register(entry.asset, ["image", "video"], ["image/", "video/"]);
    }
  }
  return {
    charactersMissingAssets: storyCharacterIds.size > 0 &&
      [...storyCharacterIds].some((id) => !primaryByCharacter.has(id)),
  };
}

function computeSceneCount(
  duration: number,
  constraints: MVScenePlannerConstraints,
  direction: MVDirection,
  sections: readonly SectionDirection[],
): { sceneCount: number; reduced: boolean } {
  const max = Math.max(5, Math.min(14,
    Number.isInteger(constraints.maxSceneCount) ? constraints.maxSceneCount! : 14));
  let requested = Math.round(duration / 20);
  requested = clamp(requested, 5, 12);
  if (direction.movementStyle === "dynamic" || direction.shotDensity >= 67) requested += 1;
  else if (direction.movementStyle === "still" || direction.shotDensity <= 32) requested -= 1;
  if ((constraints.performanceMode ?? "narrative") === "hybrid") requested += 2;
  if (Number.isInteger(constraints.targetSceneCount)) requested = constraints.targetSceneCount!;
  requested = Math.round(clamp(requested, 5, max));
  const durationLimit = Math.floor(duration / 6);
  const sectionLimit = sections.reduce(
    (sum, section) => sum + Math.max(
      1,
      Math.floor((section.endRatio - section.startRatio) * duration / 6),
    ),
    0,
  );
  const sceneCount = Math.min(requested, durationLimit, sectionLimit, max);
  return { sceneCount, reduced: requested > 0 && sceneCount / requested < 0.75 };
}

function detectStructuredConflict(story: StoryInput, lyrics?: LyricsInput) {
  if (!lyrics?.sections?.length) return false;
  const characterIds = new Set((story.characters ?? []).map((item) => item.characterId));
  return lyrics.sections.some((section) =>
    section.characterRefs?.some((ref) => !characterIds.has(ref)) ||
    (section.section === "outro" && section.endingTag !== undefined &&
      story.endingIntent !== undefined && section.endingTag !== story.endingIntent)
  );
}

function prepareInput(input: MVScenePlannerInput): PreparedInput | MVScenePlanResult {
  const issues: MVScenePlannerIssueCode[] = [];
  const source = input as unknown;
  const root = isRecord(source) ? source : {};
  if (root.contractVersion !== MV_SCENE_PLANNER_CONTRACT_VERSION) addIssue(issues, "unsupported-input-version");
  const story = root.story;
  if (!isRecord(story) || story.schemaVersion !== "1.0" || typeof story.summary !== "string") {
    addIssue(issues, "unsupported-input-version");
  }
  const lyrics = root.lyrics;
  if (lyrics !== undefined && (!isRecord(lyrics) || lyrics.schemaVersion !== "1.0")) {
    addIssue(issues, "unsupported-input-version");
  }
  const projection = root.directorDecision;
  if (!isRecord(projection) || projection.decisionSchemaVersion !== "1.0") {
    addIssue(issues, "unsupported-input-version");
  }
  if (!validProjection(projection)) addIssue(issues, "invalid-section-order");
  const constraints = root.constraints;
  const duration = isRecord(constraints) ? constraints.durationSeconds : undefined;
  if (!Number.isFinite(duration) || (duration as number) <= 0 || (duration as number) < 30) {
    addIssue(issues, "invalid-duration");
  }
  if (!isRecord(constraints) || !ASPECT_RATIOS.includes(constraints.aspectRatio as AspectRatio)) {
    addIssue(issues, "invalid-aspect-ratio");
  }
  const storyPresent = isRecord(story) && hasInputText(story.summary);
  const lyricsPresent = isRecord(lyrics) &&
    (hasInputText(lyrics.fullText) ||
      (Array.isArray(lyrics.sections) && lyrics.sections.some((section) =>
        isRecord(section) && hasInputText(section.summary))));
  if (!storyPresent && !lyricsPresent) addIssue(issues, "missing-story-and-lyrics");
  validateCharacters(story, issues);
  validateEvents(story, issues);
  const assetResult = validateAssets(root.assets, story, issues);
  if (isRecord(root.assets) && isRecord(root.assets.audioAsset) &&
      Number.isFinite(root.assets.audioAsset.durationSeconds) && Number.isFinite(duration)) {
    const tolerance = Math.max(0.25, (duration as number) * 0.005);
    if (
      Math.abs(
        (root.assets.audioAsset.durationSeconds as number) - (duration as number),
      ) - tolerance > 1e-9
    ) {
      addIssue(issues, "audio-duration-mismatch");
    }
  }
  if (isRecord(constraints)) {
    for (const field of ["targetSceneCount", "maxSceneCount", "maxCharacterCount", "maxLocationCount"] as const) {
      const value = constraints[field];
      if (value !== undefined && (!Number.isInteger(value) || (value as number) <= 0)) {
        addIssue(issues, "invalid-scene-count");
      }
    }
    if (constraints.maxSceneCount !== undefined && (constraints.maxSceneCount as number) < 5) {
      addIssue(issues, "invalid-scene-count");
    }
    if (constraints.performanceMode !== undefined &&
        !PERFORMANCE_MODES.includes(constraints.performanceMode as PerformanceMode)) {
      addIssue(issues, "invalid-scene-count");
    }
  }
  if (validProjection(projection)) {
    if (projection.validation.status === "normalized") addIssue(issues, "director-decision-normalized");
    if (projection.validation.status === "fallback") addIssue(issues, "director-decision-fallback");
    if (!Number.isFinite(projection.confidence) || projection.confidence < 0 || projection.confidence > 100) {
      addIssue(issues, "invalid-scene-count");
    }
  }

  const fatal = issues.some((code) => [
    "unsupported-input-version", "missing-story-and-lyrics", "invalid-duration",
    "audio-duration-mismatch", "invalid-aspect-ratio", "invalid-scene-count",
    "invalid-section-order", "invalid-character-reference",
    "invalid-location-reference", "invalid-asset-reference",
  ].includes(code));
  if (fatal || !validProjection(projection) || !isRecord(constraints) || !isRecord(story)) {
    return {
      status: "invalid",
      validation: { status: "invalid", issueCodes: issues },
      confidence: 0,
      reviewRequired: false,
    };
  }
  if (!storyPresent) addIssue(issues, "missing-story-fallback");
  const structuredConflict = storyPresent && lyricsPresent &&
    detectStructuredConflict(story as StoryInput, lyrics as LyricsInput | undefined);
  if (structuredConflict) addIssue(issues, "structured-story-lyrics-conflict");
  const count = computeSceneCount(
    duration as number,
    constraints as MVScenePlannerConstraints,
    projection.direction,
    projection.sectionDirections,
  );
  if (count.sceneCount < 5) {
    return {
      status: "invalid",
      validation: { status: "invalid", issueCodes: [...issues, "invalid-scene-count"] },
      confidence: 0,
      reviewRequired: false,
    };
  }
  if (count.reduced) addIssue(issues, "scene-count-reduced");
  const mode = (constraints.performanceMode ?? "narrative") as PerformanceMode;
  if ((mode === "performance" || mode === "hybrid") &&
      !isRecord((root.assets as Record<string, unknown>).performerAsset)) {
    addIssue(issues, "performance-asset-missing");
  }
  if (constraints.sensitiveContentDetected === true) {
    addIssue(issues, "sensitive-content-review-required");
    if (constraints.sensitiveContentMode === "block") {
      return {
        status: "invalid",
        validation: { status: "invalid", issueCodes: issues },
        confidence: 0,
        reviewRequired: false,
      };
    }
  }
  return {
    input: input as MVScenePlannerInput,
    issues,
    storyPresent,
    lyricsPresent,
    structuredConflict,
    performanceMode: mode,
    sceneCount: count.sceneCount,
    sceneCountReduced: count.reduced,
    charactersMissingAssets: assetResult.charactersMissingAssets,
  };
}

function allocateCounts(
  sceneCount: number,
  peak: EmotionSectionName,
  duration: number,
  sections: readonly SectionDirection[],
) {
  const counts = new Map<EmotionSectionName, number>(SECTION_ORDER.map((section) => [section, 1]));
  const priority = unique<EmotionSectionName>([peak, "pre-chorus", "bridge", "verse", "outro"]);
  const capacities = new Map(sections.map((section) => [
    section.section,
    Math.max(1, Math.floor(
      (section.endRatio - section.startRatio) * duration / 6,
    )),
  ]));
  let remaining = sceneCount - 5;
  while (remaining > 0) {
    let allocated = false;
    for (const section of priority) {
      const current = counts.get(section) ?? 1;
      if (current < (capacities.get(section) ?? 1)) {
        counts.set(section, current + 1);
        remaining -= 1;
        allocated = true;
        if (remaining === 0) break;
      }
    }
    if (!allocated) break;
  }
  return counts;
}

function selectNarrativeArc(
  story: StoryInput,
  storyPresent: boolean,
  mode: PerformanceMode,
  narrativeDirection: NarrativeDirection,
): NarrativeArc {
  if (mode === "performance") return "performance-driven";
  if (!storyPresent) return "symbolic";
  if (story.endingIntent === "circular") return "circular";
  if (story.events?.some((event) => /memory|flashback|記憶|回想/i.test(event.summary))) return "memory-fragment";
  if ((story.characters?.length ?? 0) > 1 && narrativeDirection === "sustained-emotion") return "parallel";
  if (story.endingIntent === "transformative" ||
      story.events?.some((event) => event.kind === "change" || event.kind === "choice")) return "transformation";
  if (narrativeDirection === "intimate-afterglow" && !story.events?.length) return "symbolic";
  return "linear";
}

function selectMotif(input: MVScenePlannerInput, storyPresent: boolean): VisualMotif {
  const source = [input.theme ?? "", ...(input.lyrics?.sections?.flatMap((section) => section.keywords ?? []) ?? [])]
    .join(" ").toLowerCase();
  const rules: Array<[BuiltInVisualMotif, RegExp]> = [
    ["rain", /rain|雨/], ["mirror", /mirror|鏡/], ["road", /road|道|旅/],
    ["flower", /flower|花/], ["sky", /sky|空/], ["water", /water|水|海/],
    ["fire", /fire|炎|火/], ["shadow", /shadow|影/], ["door", /door|扉|ドア/],
    ["photograph", /photo|写真|記憶/], ["empty-room", /empty room|空室|誰もいない部屋/],
  ];
  return { kind: rules.find(([, pattern]) => pattern.test(source))?.[0] ?? (storyPresent ? "road" : "light") };
}

function purposeFor(
  section: SectionDirection,
  localIndex: number,
  count: number,
  isPeak: boolean,
  isAfterglow: boolean,
  performance: boolean,
): SceneNarrativePurpose {
  if (isAfterglow) return "afterglow";
  if (performance) return "perform";
  if (isPeak) return section.purpose === "release" ? "release" : "climax";
  const first = localIndex === 0;
  const last = localIndex === count - 1;
  const mapping: Record<SectionDirection["purpose"], SceneNarrativePurpose> = {
    establish: first ? "introduce-subject" : "establish",
    build: last ? "contrast" : "develop",
    release: last ? "release" : "reveal",
    turn: last ? "turn" : "contrast",
    climax: "climax",
    resolve: last ? "resolve" : "release",
  };
  return mapping[section.purpose];
}

function isPerformanceScene(
  mode: PerformanceMode,
  section: EmotionSectionName,
  localIndex: number,
  count: number,
  peak: EmotionSectionName,
) {
  if (mode === "performance") return true;
  if (mode !== "hybrid") return false;
  return localIndex === count - 1 && (section === peak || section === "pre-chorus");
}

function subjectFor(
  prepared: PreparedInput,
  performance: boolean,
  motif: VisualMotif,
): SceneSubject {
  if (performance) {
    const performer = prepared.input.assets.performerAsset?.characterRef;
    return performer ? { type: "performance", performerRef: performer } : { type: "performance" };
  }
  if (!prepared.storyPresent) return { type: "abstract", motif: { ...motif } };
  const characters = prepared.input.story.characters ?? [];
  const protagonist = characters.find((item) => item.role === "protagonist") ?? characters[0];
  if (protagonist) return { type: "character", characterRef: protagonist.characterId };
  const environment = prepared.input.story.setting?.environment;
  return environment
    ? { type: "environment", environment }
    : { type: "environment", environment: "unspecified" };
}

function baseSetting(prepared: PreparedInput): SceneSetting {
  if (!prepared.storyPresent) {
    return { environment: "abstract-space", timeOfDay: "timeless", weather: "none", spaceType: "abstract" };
  }
  const storySetting = prepared.input.story.setting;
  return {
    environment: storySetting?.environment ?? "unspecified",
    locationRef: storySetting?.locationRef,
    timeOfDay: prepared.input.story.endingIntent === "transformative" ? "dawn" : "timeless",
    weather: "none",
    spaceType: storySetting?.environment === "room" || storySetting?.environment === "home" ||
        storySetting?.environment === "studio"
      ? "interior" : storySetting?.environment === "abstract-space" ? "abstract" : "exterior",
  };
}

function actionFor(
  purpose: SceneNarrativePurpose,
  section: EmotionSectionName,
  isPeak: boolean,
  storyPresent: boolean,
): SceneAction {
  if (!storyPresent) {
    const actionType: SceneActionType = purpose === "afterglow" ? "pause" : purpose === "climax" ? "transform" : "observe";
    return { actionType, direction: actionType === "transform" ? "toward" : "still", interaction: "environment" };
  }
  if (purpose === "perform") return { actionType: "perform", direction: "still", interaction: "audience" };
  if (purpose === "afterglow") return { actionType: "pause", direction: "still", interaction: "environment" };
  if (isPeak && section === "bridge") return { actionType: "reveal", direction: "still", interaction: "object" };
  if (isPeak) return { actionType: "choose", direction: "toward", interaction: "environment" };
  const table: Partial<Record<SceneNarrativePurpose, SceneActionType>> = {
    "introduce-subject": "observe", establish: "observe", develop: "move",
    contrast: "remember", reveal: "reveal", turn: "choose", release: "connect",
    resolve: "arrive", climax: "transform",
  };
  const actionType = table[purpose] ?? "observe";
  return {
    actionType,
    direction: ["move", "choose", "arrive", "transform"].includes(actionType) ? "toward" : "still",
    interaction: actionType === "connect" ? "character" : "environment",
  };
}

function applyAfterglow(
  scene: MVScene,
  overall: OverallDirection,
) {
  const style = overall.afterglow.releaseStyle;
  scene.emotionalIntent = overall.afterglow.emotion;
  scene.narrativePurpose = "afterglow";
  if (style === "empty") {
    scene.subject = { type: "none" };
    scene.action = { actionType: "depart", direction: "away", interaction: "environment" };
  } else if (style === "hopeful" || style === "inspired") {
    scene.visualMotif = { kind: style === "hopeful" ? "sky" : "light" };
    scene.action = { actionType: style === "hopeful" ? "arrive" : "choose", direction: "toward", interaction: "environment" };
  } else if (style === "bittersweet") {
    scene.visualMotif = { kind: "photograph" };
    scene.action = { actionType: "remember", direction: "still", interaction: "object" };
  } else if (style === "warm") {
    scene.action = { actionType: "connect", direction: "still", interaction: "character" };
  } else {
    scene.action = { actionType: "pause", direction: "still", interaction: "environment" };
  }
}

function assetRefsFor(
  subject: SceneSubject,
  assets: MVScenePlannerAssets,
): SceneAssetReference[] {
  if (subject.type === "character") {
    const entry = assets.characterAssets?.find((item) =>
      item.characterRef === subject.characterRef && item.continuityRole === "identity-primary");
    return entry ? [{ assetId: entry.asset.assetId, role: "identity" }] : [];
  }
  if (subject.type === "performance" && assets.performerAsset) {
    return [{ assetId: assets.performerAsset.asset.assetId, role: "identity" }];
  }
  return [];
}

function createScenes(
  prepared: PreparedInput,
  motif: VisualMotif,
): MVScene[] {
  const { directorDecision: projection, constraints } = prepared.input;
  const duration = constraints.durationSeconds;
  const peak = projection.overallDirection.mainPeakSection;
  const counts = allocateCounts(
    prepared.sceneCount,
    peak,
    duration,
    projection.sectionDirections,
  );
  const scenes: MVScene[] = [];
  let order = 1;
  for (const sectionName of SECTION_ORDER) {
    const section = projection.sectionDirections.find((item) => item.section === sectionName)!;
    const count = counts.get(sectionName) ?? 1;
    for (let localIndex = 0; localIndex < count; localIndex += 1) {
      const startRatio = localIndex === 0
        ? section.startRatio
        : round(section.startRatio + (section.endRatio - section.startRatio) * localIndex / count, 6);
      const endRatio = localIndex === count - 1
        ? section.endRatio
        : round(section.startRatio + (section.endRatio - section.startRatio) * (localIndex + 1) / count, 6);
      const isMainPeak = sectionName === peak && localIndex === count - 1;
      const isAfterglow = sectionName === "outro" && localIndex === count - 1;
      const performance = isPerformanceScene(prepared.performanceMode, sectionName, localIndex, count, peak);
      const purpose = purposeFor(section, localIndex, count, isMainPeak, isAfterglow, performance);
      const subject = subjectFor(prepared, performance, motif);
      const scene: MVScene = {
        sceneId: `scene-${sectionName}-${String(localIndex + 1).padStart(2, "0")}`,
        order,
        section: sectionName,
        startRatio,
        endRatio,
        startSeconds: order === 1 ? 0 : round(startRatio * duration, 6),
        endSeconds: round(endRatio * duration, 6),
        narrativePurpose: purpose,
        subject,
        setting: baseSetting(prepared),
        action: actionFor(purpose, sectionName, isMainPeak, prepared.storyPresent),
        emotionalIntent: projection.direction.visualMood,
        temporalMode: sectionName === "bridge" && prepared.input.story.events?.some((event) =>
          /memory|flashback|記憶|回想/i.test(event.summary)) ? "memory" : "present",
        visualMotif: { ...motif },
        continuityRefs: subject.type === "character"
          ? [{ kind: "character", ref: subject.characterRef, relation: "preserve" }]
          : [],
        assetRefs: assetRefsFor(subject, prepared.input.assets),
        isMainPeak,
        isAfterglow,
      };
      if (isAfterglow) applyAfterglow(scene, projection.overallDirection);
      scenes.push(scene);
      order += 1;
    }
  }
  for (let index = 1; index < scenes.length; index += 1) {
    scenes[index].startSeconds = scenes[index - 1].endSeconds;
    scenes[index].startRatio = scenes[index - 1].endRatio;
  }
  scenes[0].startSeconds = 0;
  scenes[0].startRatio = 0;
  scenes[scenes.length - 1].endSeconds = round(duration, 6);
  scenes[scenes.length - 1].endRatio = 1;
  return scenes;
}

function createContinuity(
  prepared: PreparedInput,
  scenes: MVScene[],
  arc: NarrativeArc,
): ContinuityPlan {
  const explicitAppearanceChange = prepared.input.story.events?.some((event) => event.kind === "change") ?? false;
  const characters = (prepared.input.story.characters ?? []).map((character) => ({
    characterRef: character.characterId,
    identityIntent: "preserve" as const,
    appearanceIntent: explicitAppearanceChange ? "story-change" as const : "stable" as const,
    costumeIntent: explicitAppearanceChange ? "story-change" as const : "stable" as const,
    stateProgression: [] as CharacterStateChange[],
  }));
  const locationRef = prepared.input.story.setting?.locationRef;
  const transitions: TemporalTransition[] = [];
  for (let index = 1; index < scenes.length; index += 1) {
    if (scenes[index].temporalMode !== scenes[index - 1].temporalMode) {
      transitions.push({
        fromSceneId: scenes[index - 1].sceneId,
        toSceneId: scenes[index].sceneId,
        kind: scenes[index].temporalMode === "memory" ? "flashback" : "return",
      });
    }
  }
  return {
    characters,
    environment: {
      primaryLocationRef: locationRef,
      repeatedLocationRefs: locationRef ? [locationRef] : [],
      timeProgression: arc === "memory-fragment" ? "nonlinear" : prepared.storyPresent ? "forward" : "timeless",
      weatherProgression: "stable",
      afterglowLocationRule: prepared.storyPresent ? "preserve-final" : "symbolic-space",
    },
    temporal: {
      defaultMode: arc === "memory-fragment" ? "memory" : "present",
      allowedTransitions: transitions,
    },
  };
}

function calculateConfidence(prepared: PreparedInput) {
  let value = 100;
  if (!prepared.storyPresent && prepared.lyricsPresent) value -= 30;
  if (prepared.input.directorDecision.validation.status === "normalized") value -= 10;
  if (prepared.input.directorDecision.validation.status === "fallback") value -= 40;
  if (prepared.charactersMissingAssets) value -= 10;
  if (prepared.sceneCountReduced) value -= 10;
  value = Math.round(clamp(value, 0, 100));
  if (prepared.input.directorDecision.validation.status === "fallback") value = Math.min(value, 50);
  return Math.min(value, Math.round(clamp(prepared.input.directorDecision.confidence, 0, 100)));
}

function validationStatus(prepared: PreparedInput): MVScenePlanValidationStatus {
  if (!prepared.storyPresent || prepared.input.directorDecision.validation.status === "fallback") return "fallback";
  if (prepared.structuredConflict || prepared.input.directorDecision.validation.status === "normalized") return "normalized";
  return "valid";
}

function createRationale(prepared: PreparedInput, scenes: MVScene[]): MVScenePlanRationale {
  const codes: MVScenePlannerReasonCode[] = [];
  const add = (code: MVScenePlannerReasonCode) => { if (!codes.includes(code)) codes.push(code); };
  if (prepared.storyPresent) add("story-structure-derived");
  if (prepared.lyricsPresent && prepared.storyPresent) add("lyrics-section-aligned");
  add("director-section-aligned");
  add("main-peak-scene-assigned");
  add("afterglow-scene-preserved");
  if ((prepared.input.story.characters?.length ?? 0) > 0) add("character-continuity-applied");
  add("environment-continuity-applied");
  if (scenes.some((scene) => scene.assetRefs.length > 0)) add("asset-reference-assigned");
  if (prepared.performanceMode !== "narrative") add("performance-scene-inserted");
  if (prepared.sceneCountReduced) add("scene-count-reduced");
  if (!prepared.storyPresent) add("missing-story-fallback");
  return {
    reasonCodes: codes,
    summaries: codes.map((code) => ({
      code,
      scope: "plan" as const,
      summary: ({
        "story-structure-derived": "Scenes follow the structured story input.",
        "lyrics-section-aligned": "Lyrics metadata supports section alignment.",
        "director-section-aligned": "Scenes preserve directed section boundaries.",
        "main-peak-scene-assigned": "One primary peak remains in the directed section.",
        "afterglow-scene-preserved": "The final outro scene preserves afterglow intent.",
        "character-continuity-applied": "Known character references remain consistent.",
        "environment-continuity-applied": "Environment continuity follows a fixed plan.",
        "asset-reference-assigned": "Approved logical assets were assigned to scenes.",
        "performance-scene-inserted": "Performance scenes follow the requested mode.",
        "scene-count-reduced": "Scene count was reduced to preserve minimum duration.",
        "missing-story-fallback": "A constrained symbolic fallback was used.",
        "scene-count-expanded": "Scene count was expanded by a fixed rule.",
        "unknown-character-fallback": "An unknown character was omitted safely.",
        "continuity-fallback": "A neutral continuity rule was used.",
        "main-peak-scene-fallback": "A fixed peak scene fallback was used.",
        "afterglow-scene-fallback": "A fixed afterglow fallback was used.",
      } satisfies Record<MVScenePlannerReasonCode, string>)[code],
    })),
  };
}

export function createMVScenePlan(
  input: MVScenePlannerInput,
): MVScenePlanResult {
  const prepared = prepareInput(input);
  if ("status" in prepared) return prepared;
  const arc = selectNarrativeArc(
    prepared.input.story,
    prepared.storyPresent,
    prepared.performanceMode,
    prepared.input.directorDecision.overallDirection.narrativeDirection,
  );
  const motif = selectMotif(prepared.input, prepared.storyPresent);
  const scenes = createScenes(prepared, motif);
  const status = validationStatus(prepared);
  const confidence = calculateConfidence(prepared);
  const reviewRequired = status === "normalized" || status === "fallback" ||
    confidence < MV_SCENE_PLANNER_REVIEW_CONFIDENCE ||
    prepared.charactersMissingAssets || prepared.sceneCountReduced ||
    prepared.issues.includes("performance-asset-missing") ||
    prepared.issues.includes("sensitive-content-review-required") ||
    prepared.input.constraints.reviewMode === "required";
  return {
    status: "planned",
    plan: {
      schemaVersion: MV_SCENE_PLAN_SCHEMA_VERSION,
      plannerVersion: MV_SCENE_PLANNER_VERSION,
      sourceDecisionSchemaVersion: prepared.input.directorDecision.decisionSchemaVersion,
      durationSeconds: prepared.input.constraints.durationSeconds,
      aspectRatio: prepared.input.constraints.aspectRatio,
      narrativeArc: arc,
      continuity: createContinuity(prepared, scenes, arc),
      scenes,
      rationale: createRationale(prepared, scenes),
      validation: { status, issueCodes: [...prepared.issues] },
      confidence,
      reviewRequired,
    },
  };
}
