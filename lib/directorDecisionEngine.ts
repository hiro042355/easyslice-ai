import {
  DIRECTOR_PRESETS,
  type DirectorPreset,
  type EmotionGraph,
  type EmotionSection,
  type EmotionSectionName,
  type SupportedEmotion,
} from "@/lib/emotionEngine";

export type DirectorDecisionInput = {
  emotionGraph: EmotionGraph;
  directorPreset: DirectorPreset;
};

export type IntensityCurve =
  | "steady-rise" | "rise-and-release" | "late-peak"
  | "bridge-turn" | "quiet-resolution";
export type PacingStyle = "restrained" | "measured" | "progressive" | "driving";
export type ContrastLevel = "low" | "medium" | "high";
export type NarrativeDirection =
  | "reflection-to-release" | "tension-to-resolution"
  | "growth-to-climax" | "sustained-emotion" | "intimate-afterglow";
export type VisualTone =
  | "soft" | "balanced" | "luminous" | "shadowed" | "expansive" | "stylized";
export type AfterglowReleaseStyle =
  | "warm" | "quiet" | "hopeful" | "empty" | "inspired" | "bittersweet";

export type AfterglowDirection = {
  emotion: SupportedEmotion;
  intensity: number;
  releaseStyle: AfterglowReleaseStyle;
};
export type OverallDirection = {
  emotionalTone: SupportedEmotion;
  intensityCurve: IntensityCurve;
  pacing: PacingStyle;
  contrast: ContrastLevel;
  mainPeakSection: EmotionSectionName;
  afterglow: AfterglowDirection;
  narrativeDirection: NarrativeDirection;
  visualTone: VisualTone;
  confidence: number;
};

export type TransitionStyle = "hold" | "gentle" | "build" | "impact" | "dissolve";
export type SectionPurpose =
  | "establish" | "build" | "release" | "turn" | "climax" | "resolve";
export type SectionDirection = {
  section: EmotionSectionName;
  startRatio: number;
  endRatio: number;
  intensity: number;
  tension: number;
  release: number;
  vocalIntensity: number;
  musicIntensity: number;
  visualIntensity: number;
  transitionStyle: TransitionStyle;
  isMainPeak: boolean;
  purpose: SectionPurpose;
};

export type VocalDelivery =
  | "intimate" | "controlled" | "open" | "urgent" | "resolute";
export type DynamicsShape =
  | "narrow" | "gradual" | "wide" | "late-expansion";
export type ArticulationStyle =
  | "soft" | "natural" | "clear" | "accented";
export type VocalPeakTreatment =
  | "lift" | "sustain" | "breakthrough" | "vulnerable-focus";
export type VocalOutroTreatment =
  | "release" | "whispered" | "sustained" | "resolved";
export type VocalDirection = {
  delivery: VocalDelivery;
  dynamics: DynamicsShape;
  breathiness: number;
  vibrato: number;
  articulation: ArticulationStyle;
  emotionalExpression: SupportedEmotion;
  mainPeakTreatment: VocalPeakTreatment;
  outroTreatment: VocalOutroTreatment;
};

export type TempoRange = { minBpm: number; maxBpm: number };
export type DensityChange = "reduce" | "hold" | "add" | "expand";
export type SectionMusicMovement = {
  section: EmotionSectionName;
  densityChange: DensityChange;
};
export type MusicPeakTreatment =
  | "full-arrangement" | "rhythmic-impact"
  | "harmonic-release" | "intentional-space";
export type MusicAfterglowTreatment =
  | "thin-texture" | "long-decay" | "gentle-pulse" | "clean-stop";
export type MusicDirection = {
  tempoRange: TempoRange;
  energyCurve: IntensityCurve;
  instrumentationDensity: number;
  rhythmIntensity: number;
  harmonicTension: number;
  dynamicRange: "narrow" | "moderate" | "wide";
  sectionMovement: SectionMusicMovement[];
  mainPeakTreatment: MusicPeakTreatment;
  afterglowTreatment: MusicAfterglowTreatment;
};

export type ColorDirection =
  | "warm" | "cool" | "neutral" | "muted" | "vivid" | "high-contrast";
export type LightingDirection =
  | "soft" | "natural" | "low-key" | "radiant" | "contrast-led";
export type MovementStyle =
  | "still" | "floating" | "controlled" | "progressive" | "dynamic";
export type SubjectFocus =
  | "intimate" | "balanced" | "environmental" | "symbolic";
export type EnvironmentDirection =
  | "minimal" | "grounded" | "atmospheric" | "expansive" | "surreal";
export type MVPeakTreatment =
  | "scale-expansion" | "motion-impact"
  | "intimate-close-focus" | "contrast-break";
export type MVAfterglowTreatment =
  | "slow-fade" | "held-final-image" | "soft-departure" | "abrupt-absence";
export type MVDirection = {
  visualMood: SupportedEmotion;
  colorDirection: ColorDirection;
  lightingDirection: LightingDirection;
  cameraEnergy: number;
  movementStyle: MovementStyle;
  shotDensity: number;
  transitionIntensity: number;
  subjectFocus: SubjectFocus;
  environmentDirection: EnvironmentDirection;
  mainPeakTreatment: MVPeakTreatment;
  afterglowTreatment: MVAfterglowTreatment;
};

export type DirectorReasonCode =
  | "emotion-main-peak" | "afterglow-preservation" | "preset-modulation"
  | "low-energy-high-emotion" | "pre-chorus-tension-build"
  | "chorus-release" | "bridge-emotional-turn" | "outro-resolution"
  | "input-normalized" | "safe-fallback";
export type DirectorReason = {
  code: DirectorReasonCode;
  section?: EmotionSectionName;
  targets: Array<"overall" | "vocal" | "music" | "mv">;
  summary: string;
};
export type DirectorRationale = { decisions: DirectorReason[] };

export type ValidationIssueCode =
  | "unknown-preset" | "empty-sections" | "missing-section"
  | "duplicate-section" | "invalid-score" | "invalid-ratio"
  | "non-contiguous-ratios" | "invalid-main-peak" | "invalid-afterglow";
export type DecisionValidation = {
  status: "valid" | "normalized" | "fallback";
  issueCodes: ValidationIssueCode[];
};
export type DirectorDecision = {
  schemaVersion: "1.0";
  engineVersion: "rule-v1";
  normalizedPreset: DirectorPreset;
  overallDirection: OverallDirection;
  sectionDirections: SectionDirection[];
  vocalDirection: VocalDirection;
  musicDirection: MusicDirection;
  mvDirection: MVDirection;
  rationale: DirectorRationale;
  validation: DecisionValidation;
};

type NormalizedGraph = EmotionGraph & { afterglow: SupportedEmotion };
type PresetAdjustment = {
  vocal: number;
  music: number;
  visual: number;
  visualTone: VisualTone;
};

const SECTION_ORDER: EmotionSectionName[] =
  ["verse", "pre-chorus", "chorus", "bridge", "outro"];
// Snapshot the public tuple so external runtime mutation cannot alter this engine.
const VALID_PRESETS = new Set<DirectorPreset>([...DIRECTOR_PRESETS]);
const DEFAULT_RATIOS = [0, 0.25, 0.43, 0.7, 0.87, 1] as const;
const EMOTIONS: SupportedEmotion[] = [
  "joy", "sadness", "hope", "love", "fear", "anger",
  "loneliness", "excitement", "nostalgia", "determination",
];
const FALLBACK_SCORES = [
  { emotion: 45, energy: 20, peak: 15 },
  { emotion: 55, energy: 45, peak: 40 },
  { emotion: 75, energy: 70, peak: 100 },
  { emotion: 60, energy: 35, peak: 55 },
  { emotion: 40, energy: 15, peak: 20 },
] as const;
const PRESET_ADJUSTMENTS: Record<DirectorPreset, PresetAdjustment> = {
  auto: { vocal: 0, music: 0, visual: 0, visualTone: "balanced" },
  epic: { vocal: 5, music: 10, visual: 10, visualTone: "expansive" },
  emotional: { vocal: 8, music: -5, visual: -3, visualTone: "soft" },
  cinematic: { vocal: 0, music: 2, visual: 6, visualTone: "balanced" },
  fantasy: { vocal: 0, music: 4, visual: 7, visualTone: "luminous" },
  dark: { vocal: 3, music: -2, visual: 5, visualTone: "shadowed" },
  bright: { vocal: -2, music: 6, visual: 6, visualTone: "luminous" },
  "anime-inspired": {
    vocal: 6, music: 8, visual: 8, visualTone: "stylized",
  },
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const score = (value: number) => Math.round(clamp(value));
const ratio = (value: number) => clamp(value, 0, 1);
const isEmotion = (value: unknown): value is SupportedEmotion =>
  typeof value === "string" && EMOTIONS.includes(value as SupportedEmotion);
const addIssue = (
  issues: ValidationIssueCode[],
  issue: ValidationIssueCode,
) => {
  if (!issues.includes(issue)) issues.push(issue);
};

function normalizePreset(
  value: unknown,
  issues: ValidationIssueCode[],
): DirectorPreset {
  if (
    typeof value === "string" &&
    VALID_PRESETS.has(value as DirectorPreset)
  ) return value as DirectorPreset;
  addIssue(issues, "unknown-preset");
  return "auto";
}

function normalizeScore(
  value: unknown,
  fallback: number,
  issues: ValidationIssueCode[],
) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < 0 || value > 100 || !Number.isInteger(value)
  ) addIssue(issues, "invalid-score");
  return score(
    typeof value === "number" && Number.isFinite(value) ? value : fallback,
  );
}

function fallbackSection(
  section: EmotionSectionName,
  index: number,
): EmotionSection {
  const values = FALLBACK_SCORES[index];
  return {
    section,
    startRatio: DEFAULT_RATIOS[index],
    endRatio: DEFAULT_RATIOS[index + 1],
    primaryEmotion: "hope",
    secondaryEmotion: index === 2 ? "determination" : undefined,
    emotionScore: values.emotion,
    energyScore: values.energy,
    peakLevel: values.peak,
    mainPeak: section === "chorus",
    directionNote: "Safe foundation fallback.",
  };
}

function normalizeGraph(
  graphValue: unknown,
  issues: ValidationIssueCode[],
): NormalizedGraph {
  const graph = graphValue && typeof graphValue === "object"
    ? graphValue as Partial<EmotionGraph>
    : {};
  const rawSections = Array.isArray(graph.sections) ? graph.sections : [];
  if (rawSections.length === 0) addIssue(issues, "empty-sections");

  const buckets = new Map<
    EmotionSectionName,
    Partial<EmotionSection>[]
  >(SECTION_ORDER.map((name) => [name, []]));
  for (const candidate of rawSections) {
    if (!candidate || typeof candidate !== "object") continue;
    const section = (candidate as Partial<EmotionSection>).section;
    if (SECTION_ORDER.includes(section as EmotionSectionName)) {
      buckets
        .get(section as EmotionSectionName)
        ?.push(candidate as Partial<EmotionSection>);
    }
  }

  const sections = SECTION_ORDER.map((name, index): EmotionSection => {
    const candidates = buckets.get(name) ?? [];
    if (candidates.length > 1) addIssue(issues, "duplicate-section");
    if (candidates.length === 0) {
      addIssue(issues, "missing-section");
      return fallbackSection(name, index);
    }
    const candidate = candidates[0];
    const fallback = FALLBACK_SCORES[index];
    const rawStart = candidate.startRatio;
    const rawEnd = candidate.endRatio;
    if (
      typeof rawStart !== "number" || !Number.isFinite(rawStart) ||
      rawStart < 0 || rawStart > 1 ||
      typeof rawEnd !== "number" || !Number.isFinite(rawEnd) ||
      rawEnd < 0 || rawEnd > 1 || rawStart > rawEnd
    ) addIssue(issues, "invalid-ratio");
    return {
      section: name,
      startRatio: ratio(
        typeof rawStart === "number"
          ? rawStart
          : DEFAULT_RATIOS[index],
      ),
      endRatio: ratio(
        typeof rawEnd === "number"
          ? rawEnd
          : DEFAULT_RATIOS[index + 1],
      ),
      primaryEmotion: isEmotion(candidate.primaryEmotion)
        ? candidate.primaryEmotion
        : "hope",
      secondaryEmotion: isEmotion(candidate.secondaryEmotion)
        ? candidate.secondaryEmotion
        : undefined,
      emotionScore: normalizeScore(
        candidate.emotionScore,
        fallback.emotion,
        issues,
      ),
      energyScore: normalizeScore(
        candidate.energyScore,
        fallback.energy,
        issues,
      ),
      peakLevel: normalizeScore(
        candidate.peakLevel,
        fallback.peak,
        issues,
      ),
      mainPeak: candidate.mainPeak === true,
      directionNote: typeof candidate.directionNote === "string"
        ? candidate.directionNote
        : "Normalized direction.",
    };
  });

  const contiguous = sections.every((section, index) =>
    index === 0
      ? section.startRatio === 0
      : section.startRatio === sections[index - 1].endRatio,
  ) &&
    sections.at(-1)?.endRatio === 1 &&
    sections.every((section) => section.startRatio <= section.endRatio);
  if (!contiguous) {
    addIssue(issues, "non-contiguous-ratios");
    sections.forEach((section, index) => {
      section.startRatio = DEFAULT_RATIOS[index];
      section.endRatio = DEFAULT_RATIOS[index + 1];
    });
  }

  const declaredPeak = SECTION_ORDER.includes(
    graph.mainPeakSection as EmotionSectionName,
  )
    ? graph.mainPeakSection as EmotionSectionName
    : undefined;
  const flagged = sections.filter(({ mainPeak }) => mainPeak);
  let peakSection = declaredPeak;
  if (!peakSection) {
    peakSection = flagged
      .slice()
      .sort(
        (a, b) =>
          b.peakLevel - a.peakLevel ||
          SECTION_ORDER.indexOf(a.section) -
            SECTION_ORDER.indexOf(b.section),
      )[0]?.section;
  }
  if (!peakSection) {
    peakSection = sections
      .slice()
      .sort(
        (a, b) =>
          b.peakLevel - a.peakLevel ||
          SECTION_ORDER.indexOf(a.section) -
            SECTION_ORDER.indexOf(b.section),
      )[0]?.section ?? "chorus";
  }
  if (
    flagged.length !== 1 ||
    flagged[0]?.section !== peakSection ||
    graph.mainPeakSection !== peakSection
  ) addIssue(issues, "invalid-main-peak");
  const maximumPeak = Math.max(
    ...sections.map(({ peakLevel }) => peakLevel),
    0,
  );
  sections.forEach((section) => {
    section.mainPeak = section.section === peakSection;
    if (section.mainPeak) {
      section.peakLevel = Math.max(section.peakLevel, maximumPeak);
    }
  });

  const primaryEmotion = isEmotion(graph.primaryEmotion)
    ? graph.primaryEmotion
    : "hope";
  const outroEmotion = sections.find(
    ({ section }) => section === "outro",
  )?.primaryEmotion;
  const afterglow = isEmotion(graph.afterglow)
    ? graph.afterglow
    : isEmotion(outroEmotion) ? outroEmotion : primaryEmotion;
  if (!isEmotion(graph.afterglow)) addIssue(issues, "invalid-afterglow");

  return {
    primaryEmotion,
    secondaryEmotions: Array.isArray(graph.secondaryEmotions)
      ? graph.secondaryEmotions.filter(isEmotion).slice(0, 3)
      : [],
    overallArc: sections
      .map(({ primaryEmotion: emotion }) => emotion)
      .join(" → "),
    mainPeakSection: peakSection,
    afterglow,
    sections,
  };
}

function basePurpose(section: EmotionSectionName): SectionPurpose {
  const purposes: Record<EmotionSectionName, SectionPurpose> = {
    verse: "establish",
    "pre-chorus": "build",
    chorus: "release",
    bridge: "turn",
    outro: "resolve",
  };
  return purposes[section];
}

function transitionFor(
  value: number,
  section: EmotionSectionName,
): TransitionStyle {
  if (section === "outro") return "dissolve";
  if (value < 30) return "hold";
  if (value < 50) return "gentle";
  if (value < 70) return "build";
  return "impact";
}

function createSectionDirection(
  section: EmotionSection,
  adjustment: PresetAdjustment,
): SectionDirection {
  let intensity = score(
    section.emotionScore * 0.55 +
      section.energyScore * 0.3 +
      section.peakLevel * 0.15,
  );
  let tension = score(
    section.emotionScore * 0.45 +
      section.peakLevel * 0.35 +
      (100 - section.energyScore) * 0.2,
  );
  let release = score(
    section.peakLevel * 0.6 +
      section.energyScore * 0.25 +
      section.emotionScore * 0.15,
  );
  if (section.section === "verse") {
    tension = score(tension - 5);
    release = score(release - 10);
  } else if (section.section === "pre-chorus") {
    tension = score(tension + 10);
    release = score(release - 5);
  } else if (section.section === "chorus") {
    release = score(release + 8);
  } else if (section.section === "bridge") {
    tension = score(tension + 8);
  } else {
    tension = score(tension - 15);
    release = score(release + 5);
  }

  let vocalIntensity = score(
    section.emotionScore * 0.6 +
      section.energyScore * 0.25 +
      section.peakLevel * 0.15 +
      adjustment.vocal,
  );
  let musicIntensity = score(
    section.emotionScore * 0.15 +
      section.energyScore * 0.65 +
      section.peakLevel * 0.2 +
      adjustment.music,
  );
  let visualIntensity = score(
    section.emotionScore * 0.3 +
      section.energyScore * 0.45 +
      section.peakLevel * 0.25 +
      adjustment.visual,
  );
  if (section.mainPeak) {
    intensity = Math.max(90, intensity);
    release = Math.max(90, release);
    vocalIntensity = score(vocalIntensity + 8);
    musicIntensity = score(musicIntensity + 8);
    visualIntensity = score(visualIntensity + 8);
  }
  return {
    section: section.section,
    startRatio: section.startRatio,
    endRatio: section.endRatio,
    intensity,
    tension,
    release,
    vocalIntensity,
    musicIntensity,
    visualIntensity,
    transitionStyle: transitionFor(
      visualIntensity,
      section.section,
    ),
    isMainPeak: section.mainPeak,
    purpose: section.mainPeak
      ? "climax"
      : basePurpose(section.section),
  };
}

function enforcePeakDominance(
  directions: SectionDirection[],
): void {
  const peak = directions.find(({ isMainPeak }) => isMainPeak);
  if (!peak) return;
  const nonPeak = directions.filter(({ isMainPeak }) => !isMainPeak);
  const strongestNonPeak = Math.max(
    ...nonPeak.map(({ intensity }) => intensity),
    0,
  );
  peak.intensity = score(
    Math.max(peak.intensity, Math.min(100, strongestNonPeak + 1)),
  );
  if (peak.intensity === 100) {
    for (const section of nonPeak) {
      section.intensity = Math.min(section.intensity, 99);
    }
  }
}

function selectCurve(
  peak: EmotionSectionName,
  directions: SectionDirection[],
): IntensityCurve {
  if (peak === "bridge") return "bridge-turn";
  if (peak === "outro") return "late-peak";
  const outro = directions.find(
    ({ section }) => section === "outro",
  )?.intensity ?? 0;
  const chorus = directions.find(
    ({ section }) => section === "chorus",
  )?.intensity ?? 0;
  if (outro <= chorus - 30) return "quiet-resolution";
  return directions.every(
    (item, index) =>
      index === 0 ||
      item.intensity >= directions[index - 1].intensity,
  ) ? "steady-rise" : "rise-and-release";
}

function selectAfterglowRelease(
  emotion: SupportedEmotion,
  graph: NormalizedGraph,
): AfterglowReleaseStyle {
  if (emotion === "hope") return "hopeful";
  if (emotion === "joy" || emotion === "love") return "warm";
  if (emotion === "loneliness" || emotion === "fear") return "empty";
  if (
    emotion === "determination" ||
    emotion === "excitement"
  ) return "inspired";
  if (
    emotion === "sadness" &&
    graph.secondaryEmotions.includes("hope")
  ) return "bittersweet";
  return "quiet";
}

function confidenceFor(issues: ValidationIssueCode[]) {
  // Input quality after normalization, not creative or model certainty.
  const costs: Record<ValidationIssueCode, number> = {
    "unknown-preset": 3,
    "empty-sections": 50,
    "missing-section": 10,
    "duplicate-section": 7,
    "invalid-score": 5,
    "invalid-ratio": 5,
    "non-contiguous-ratios": 7,
    "invalid-main-peak": 12,
    "invalid-afterglow": 4,
  };
  return score(
    100 -
      issues.reduce((total, issue) => total + costs[issue], 0),
  );
}

function createVocalDirection(
  graph: NormalizedGraph,
  preset: DirectorPreset,
): VocalDirection {
  const peak = graph.mainPeakSection;
  const emotional = preset === "emotional";
  const expressive =
    preset === "epic" || preset === "anime-inspired";
  return {
    delivery: emotional
      ? "intimate"
      : expressive
        ? "open"
        : preset === "dark"
          ? "urgent"
          : graph.primaryEmotion === "determination"
            ? "resolute"
            : "controlled",
    dynamics: peak === "outro"
      ? "late-expansion"
      : expressive
        ? "wide"
        : emotional ? "gradual" : "narrow",
    breathiness: score(
      (emotional ? 65 : 35) +
        (
          graph.primaryEmotion === "sadness" ||
          graph.primaryEmotion === "love"
            ? 10
            : 0
        ),
    ),
    vibrato: score(
      peak === "outro"
        ? 60
        : emotional ? 55 : preset === "epic" ? 48 : 38,
    ),
    articulation: emotional
      ? "soft"
      : preset === "bright"
        ? "clear"
        : preset === "anime-inspired"
          ? "accented"
          : "natural",
    emotionalExpression: graph.primaryEmotion,
    mainPeakTreatment: peak === "bridge"
      ? "vulnerable-focus"
      : peak === "outro"
        ? "sustain"
        : expressive ? "breakthrough" : "lift",
    outroTreatment: peak === "outro"
      ? "sustained"
      : graph.afterglow === "loneliness" ||
          graph.afterglow === "fear"
        ? "whispered"
        : graph.afterglow === "determination"
          ? "resolved"
          : "release",
  };
}

function tempoFor(
  preset: DirectorPreset,
  averageEnergy: number,
): TempoRange {
  const presetOffset =
    preset === "epic" || preset === "anime-inspired"
      ? 10
      : preset === "emotional" ? -8 : 0;
  const center = clamp(
    62 + averageEnergy * 0.7 + presetOffset,
    50,
    180,
  );
  return {
    minBpm: Math.round(clamp(center - 10, 40, 200)),
    maxBpm: Math.round(clamp(center + 10, 40, 200)),
  };
}

function createMusicDirection(
  graph: NormalizedGraph,
  directions: SectionDirection[],
  preset: DirectorPreset,
  curve: IntensityCurve,
): MusicDirection {
  const averageEnergy =
    graph.sections.reduce(
      (sum, item) => sum + item.energyScore,
      0,
    ) / graph.sections.length;
  const averageMusic =
    directions.reduce(
      (sum, item) => sum + item.musicIntensity,
      0,
    ) / directions.length;
  const peak = graph.mainPeakSection;
  const spread =
    Math.max(...directions.map(({ intensity }) => intensity)) -
    Math.min(...directions.map(({ intensity }) => intensity));
  return {
    tempoRange: tempoFor(preset, averageEnergy),
    energyCurve: curve,
    instrumentationDensity: score(averageMusic),
    rhythmIntensity: score(
      averageEnergy + PRESET_ADJUSTMENTS[preset].music,
    ),
    harmonicTension: score(
      Math.max(...directions.map(({ tension }) => tension)),
    ),
    dynamicRange:
      preset === "epic" ||
      preset === "anime-inspired" ||
      spread >= 40
        ? "wide"
        : averageEnergy < 35 ? "narrow" : "moderate",
    sectionMovement: directions.map((direction) => ({
      section: direction.section,
      densityChange:
        direction.section === "outro" ||
        (direction.section === "bridge" && peak === "bridge")
          ? "reduce"
          : direction.isMainPeak
            ? "expand"
            : direction.musicIntensity >= 60 ? "add" : "hold",
    })),
    mainPeakTreatment: peak === "bridge"
      ? "intentional-space"
      : peak === "outro"
        ? "harmonic-release"
        : preset === "epic" || preset === "anime-inspired"
          ? "full-arrangement"
          : "rhythmic-impact",
    afterglowTreatment:
      graph.afterglow === "loneliness" ||
      graph.afterglow === "fear"
        ? "clean-stop"
        : graph.afterglow === "love" || peak === "outro"
          ? "long-decay"
          : graph.afterglow === "hope"
            ? "gentle-pulse"
            : "thin-texture",
  };
}

function createMVDirection(
  graph: NormalizedGraph,
  directions: SectionDirection[],
  preset: DirectorPreset,
): MVDirection {
  const averageVisual =
    directions.reduce(
      (sum, item) => sum + item.visualIntensity,
      0,
    ) / directions.length;
  const averageMusic =
    directions.reduce(
      (sum, item) => sum + item.musicIntensity,
      0,
    ) / directions.length;
  const peak = graph.mainPeakSection;
  const sad =
    graph.primaryEmotion === "sadness" ||
    graph.primaryEmotion === "loneliness";
  return {
    visualMood: graph.primaryEmotion,
    colorDirection: preset === "dark"
      ? "high-contrast"
      : preset === "bright"
        ? "vivid"
        : graph.primaryEmotion === "love" ||
            graph.primaryEmotion === "joy"
          ? "warm"
          : sad
            ? "muted"
            : graph.primaryEmotion === "fear"
              ? "cool"
              : "neutral",
    lightingDirection: preset === "dark"
      ? "low-key"
      : preset === "bright" || preset === "fantasy"
        ? "radiant"
        : preset === "epic" ||
            preset === "anime-inspired"
          ? "contrast-led"
          : graph.primaryEmotion === "love" ||
              preset === "emotional"
            ? "soft"
            : "natural",
    cameraEnergy: score(averageVisual),
    movementStyle: preset === "fantasy"
      ? "floating"
      : preset === "epic" || preset === "anime-inspired"
        ? "dynamic"
        : averageVisual < 35
          ? "still"
          : averageVisual < 55 ? "controlled" : "progressive",
    shotDensity: score(
      averageMusic -
        (graph.afterglow === "loneliness" ? 8 : 0),
    ),
    transitionIntensity: score(averageVisual),
    subjectFocus:
      peak === "bridge" || preset === "emotional"
        ? "intimate"
        : preset === "fantasy"
          ? "symbolic"
          : preset === "epic"
            ? "environmental"
            : "balanced",
    environmentDirection: preset === "fantasy"
      ? "surreal"
      : preset === "epic"
        ? "expansive"
        : preset === "cinematic"
          ? "atmospheric"
          : preset === "emotional" ? "minimal" : "grounded",
    mainPeakTreatment: peak === "bridge"
      ? "intimate-close-focus"
      : peak === "outro"
        ? "contrast-break"
        : preset === "epic" ||
            preset === "anime-inspired"
          ? "scale-expansion"
          : "motion-impact",
    afterglowTreatment:
      graph.afterglow === "loneliness" ||
      graph.afterglow === "fear"
        ? "abrupt-absence"
        : peak === "outro" || graph.afterglow === "love"
          ? "held-final-image"
          : graph.afterglow === "hope"
            ? "soft-departure"
            : "slow-fade",
  };
}

function createRationale(
  graph: NormalizedGraph,
  preset: DirectorPreset,
  issues: ValidationIssueCode[],
): DirectorRationale {
  const decisions: DirectorReason[] = [
    {
      code: "emotion-main-peak",
      section: graph.mainPeakSection,
      targets: ["overall", "vocal", "music", "mv"],
      summary:
        graph.mainPeakSection +
        " is the normalized main peak shared by every director.",
    },
    {
      code: "afterglow-preservation",
      section: "outro",
      targets: ["vocal", "music", "mv"],
      summary:
        graph.afterglow +
        " afterglow is preserved through the outro treatments.",
    },
    {
      code: "preset-modulation",
      targets: ["vocal", "music", "mv"],
      summary:
        preset +
        " changes expression strength without replacing emotion or peak timing.",
    },
  ];
  if (
    graph.sections.some(
      ({ emotionScore, energyScore }) =>
        emotionScore >= 70 && energyScore <= 35,
    )
  ) {
    decisions.push({
      code: "low-energy-high-emotion",
      targets: ["vocal", "music", "mv"],
      summary:
        "High emotion with low energy keeps expression strong while preserving space.",
    });
  }
  if (issues.length > 0) {
    decisions.push({
      code: issues.includes("empty-sections")
        ? "safe-fallback"
        : "input-normalized",
      targets: ["overall"],
      summary:
        "Input was normalized using: " + issues.join(", ") + ".",
    });
  }
  return { decisions };
}

export function createDirectorDecision(
  input: DirectorDecisionInput,
): DirectorDecision {
  const issues: ValidationIssueCode[] = [];
  const preset = normalizePreset(input?.directorPreset, issues);
  const graph = normalizeGraph(input?.emotionGraph, issues);
  const adjustment = PRESET_ADJUSTMENTS[preset];
  const sectionDirections = graph.sections.map((section) =>
    createSectionDirection(section, adjustment)
  );
  const preChorus = sectionDirections.find(
    ({ section }) => section === "pre-chorus",
  );
  if (graph.mainPeakSection === "chorus" && preChorus) {
    preChorus.tension = Math.max(65, preChorus.tension);
  }
  enforcePeakDominance(sectionDirections);
  const curve = selectCurve(
    graph.mainPeakSection,
    sectionDirections,
  );
  const averageEnergy =
    graph.sections.reduce(
      (sum, item) => sum + item.energyScore,
      0,
    ) / graph.sections.length;
  const intensities = sectionDirections.map(
    ({ intensity }) => intensity,
  );
  const spread =
    Math.max(...intensities) - Math.min(...intensities);
  const outroEmotionScore =
    graph.sections.find(({ section }) => section === "outro")
      ?.emotionScore ?? 40;
  const confidence = confidenceFor(issues);
  const fallback = issues.includes("empty-sections");

  const overallDirection: OverallDirection = {
    emotionalTone: graph.primaryEmotion,
    intensityCurve: curve,
    pacing: averageEnergy < 30
      ? "restrained"
      : averageEnergy < 50
        ? "measured"
        : averageEnergy < 70 ? "progressive" : "driving",
    contrast: spread < 20
      ? "low"
      : spread < 40 ? "medium" : "high",
    mainPeakSection: graph.mainPeakSection,
    afterglow: {
      emotion: graph.afterglow,
      intensity: score(outroEmotionScore),
      releaseStyle: selectAfterglowRelease(
        graph.afterglow,
        graph,
      ),
    },
    narrativeDirection: graph.mainPeakSection === "outro"
      ? "intimate-afterglow"
      : graph.mainPeakSection === "bridge"
        ? "tension-to-resolution"
        : graph.primaryEmotion === "nostalgia" ||
            graph.primaryEmotion === "sadness"
          ? "reflection-to-release"
          : curve === "steady-rise"
            ? "growth-to-climax"
            : "sustained-emotion",
    visualTone: adjustment.visualTone,
    confidence,
  };

  return {
    schemaVersion: "1.0",
    engineVersion: "rule-v1",
    normalizedPreset: preset,
    overallDirection,
    sectionDirections,
    vocalDirection: createVocalDirection(graph, preset),
    musicDirection: createMusicDirection(
      graph,
      sectionDirections,
      preset,
      curve,
    ),
    mvDirection: createMVDirection(
      graph,
      sectionDirections,
      preset,
    ),
    rationale: createRationale(graph, preset, issues),
    validation: {
      status: fallback
        ? "fallback"
        : issues.length > 0 ? "normalized" : "valid",
      issueCodes: [...issues],
    },
  };
}
