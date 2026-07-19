export const DIRECTOR_PRESETS = [
  "auto",
  "epic",
  "emotional",
  "cinematic",
  "fantasy",
  "dark",
  "bright",
  "anime-inspired",
] as const;

export type DirectorPreset = (typeof DIRECTOR_PRESETS)[number];

export type SupportedEmotion =
  | "joy"
  | "sadness"
  | "hope"
  | "love"
  | "fear"
  | "anger"
  | "loneliness"
  | "excitement"
  | "nostalgia"
  | "determination";

export type EmotionSectionName =
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "outro";

export type EmotionEngineInput = {
  story: string;
  theme?: string;
  mood?: string;
  lyrics?: string;
  directorPreset: DirectorPreset;
};

export type EmotionSection = {
  section: EmotionSectionName;
  startRatio: number;
  endRatio: number;
  primaryEmotion: SupportedEmotion;
  secondaryEmotion?: SupportedEmotion;
  emotionScore: number;
  energyScore: number;
  peakLevel: number;
  mainPeak: boolean;
  directionNote: string;
};

export type EmotionGraph = {
  primaryEmotion: SupportedEmotion;
  secondaryEmotions: SupportedEmotion[];
  overallArc: string;
  mainPeakSection: EmotionSectionName;
  afterglow: string;
  sections: EmotionSection[];
};

type SectionDraft = Omit<EmotionSection, "mainPeak">;

type PeakDecision = {
  section: EmotionSectionName;
  reason:
    | "dark-preset"
    | "sadness-or-loneliness"
    | "emotional-love"
    | "default-chorus"
    | "fallback";
};

type PresetProfile = {
  emotions: SupportedEmotion[];
  emotionOffset: number;
  energyOffset: number;
};

const EMOTION_PRIORITY: SupportedEmotion[] = [
  "sadness",
  "love",
  "nostalgia",
  "hope",
  "determination",
  "loneliness",
  "fear",
  "anger",
  "joy",
  "excitement",
];

const emotionKeywords: Record<SupportedEmotion, string[]> = {
  joy: ["joy", "happy", "嬉", "喜", "幸せ", "笑", "明る"],
  sadness: ["sad", "grief", "loss", "悲", "哀", "涙", "失恋", "別れ", "喪失"],
  hope: ["hope", "future", "希望", "未来", "前向き", "光", "再出発"],
  love: ["love", "恋", "愛", "大切", "好き", "家族"],
  fear: ["fear", "afraid", "怖", "恐", "不安"],
  anger: ["anger", "angry", "怒", "悔"],
  loneliness: ["lonely", "alone", "孤独", "寂", "ひとり"],
  excitement: ["excited", "thrill", "興奮", "高鳴", "熱狂"],
  nostalgia: ["nostalgia", "memory", "remember", "思い出", "記憶", "懐", "昔", "日記"],
  determination: ["determination", "決意", "挑戦", "進む", "諦めない", "夢", "仕事"],
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const score = (value: number) => Math.round(clamp(value, 0, 100));
const ratio = (value: number) => clamp(value, 0, 1);

function detectEmotions(text: string): SupportedEmotion[] {
  const normalized = text.toLowerCase();
  const ranked = (Object.entries(emotionKeywords) as [SupportedEmotion, string[]][])
    .map(([emotion, keywords]) => ({
      emotion,
      matches: keywords.reduce(
        (total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ matches }) => matches > 0)
    .sort(
      (a, b) =>
        b.matches - a.matches ||
        EMOTION_PRIORITY.indexOf(a.emotion) - EMOTION_PRIORITY.indexOf(b.emotion),
    )
    .map(({ emotion }) => emotion);

  return ranked.length > 0 ? ranked : ["hope"];
}

function normalizePreset(value: unknown): DirectorPreset {
  return typeof value === "string" && DIRECTOR_PRESETS.includes(value as DirectorPreset)
    ? (value as DirectorPreset)
    : "auto";
}

function presetProfile(preset: DirectorPreset): PresetProfile {
  const map: Record<DirectorPreset, PresetProfile> = {
    auto: { emotions: ["hope", "nostalgia"], emotionOffset: 0, energyOffset: 0 },
    epic: { emotions: ["determination", "excitement"], emotionOffset: 5, energyOffset: 12 },
    emotional: { emotions: ["sadness", "love", "nostalgia"], emotionOffset: 8, energyOffset: -8 },
    cinematic: { emotions: ["nostalgia", "determination"], emotionOffset: 3, energyOffset: -4 },
    fantasy: { emotions: ["hope", "excitement"], emotionOffset: 2, energyOffset: 4 },
    dark: { emotions: ["fear", "loneliness", "anger"], emotionOffset: 6, energyOffset: -2 },
    bright: { emotions: ["joy", "hope", "excitement"], emotionOffset: -2, energyOffset: 8 },
    "anime-inspired": {
      emotions: ["determination", "excitement", "hope"],
      emotionOffset: 4,
      energyOffset: 10,
    },
  };
  return map[preset];
}

function decidePeak(
  preset: DirectorPreset,
  detectedEmotions: SupportedEmotion[],
  availableSections: readonly EmotionSectionName[],
): PeakDecision {
  let decision: PeakDecision;

  if (preset === "dark") {
    decision = { section: "bridge", reason: "dark-preset" };
  } else if (
    detectedEmotions.includes("sadness") ||
    detectedEmotions.includes("loneliness")
  ) {
    decision = { section: "bridge", reason: "sadness-or-loneliness" };
  } else if (preset === "emotional" && detectedEmotions.includes("love")) {
    decision = { section: "outro", reason: "emotional-love" };
  } else {
    decision = { section: "chorus", reason: "default-chorus" };
  }

  return availableSections.includes(decision.section)
    ? decision
    : { section: availableSections[0] ?? "chorus", reason: "fallback" };
}

export function createEmotionGraph(input: EmotionEngineInput): EmotionGraph {
  const preset = normalizePreset(input.directorPreset);
  const detected = detectEmotions(
    [input.story, input.theme, input.mood, input.lyrics].filter(Boolean).join(" "),
  );
  const profile = presetProfile(preset);
  const emotions = Array.from(new Set([...detected, ...profile.emotions]));
  const primaryEmotion = emotions[0];
  const secondaryEmotions = emotions.slice(1, 4);

  const drafts: SectionDraft[] = [
    {
      section: "verse", startRatio: 0, endRatio: 0.25,
      primaryEmotion, secondaryEmotion: secondaryEmotions[0],
      emotionScore: 58 + profile.emotionOffset, energyScore: 28 + profile.energyOffset, peakLevel: 18,
      directionNote: "Introduce the story with restraint and space.",
    },
    {
      section: "pre-chorus", startRatio: 0.25, endRatio: 0.43,
      primaryEmotion: secondaryEmotions[0] ?? "hope", secondaryEmotion: primaryEmotion,
      emotionScore: 72 + profile.emotionOffset, energyScore: 52 + profile.energyOffset, peakLevel: 48,
      directionNote: "Build tension and create forward movement.",
    },
    {
      section: "chorus", startRatio: 0.43, endRatio: 0.7,
      primaryEmotion: preset === "bright" ? "joy" : "determination",
      secondaryEmotion: primaryEmotion, emotionScore: 88 + profile.emotionOffset, energyScore: 82 + profile.energyOffset, peakLevel: 88,
      directionNote: "Open the arrangement and release the emotional pressure.",
    },
    {
      section: "bridge", startRatio: 0.7, endRatio: 0.87,
      primaryEmotion: emotions.includes("sadness") ? "sadness" : "nostalgia",
      secondaryEmotion: primaryEmotion, emotionScore: 84 + profile.emotionOffset, energyScore: 32 + profile.energyOffset, peakLevel: 68,
      directionNote: "Pull back for contrast, reflection, and vulnerability.",
    },
    {
      section: "outro", startRatio: 0.87, endRatio: 1,
      primaryEmotion: emotions.includes("hope") ? "hope" : primaryEmotion,
      secondaryEmotion: secondaryEmotions[0], emotionScore: 62 + profile.emotionOffset, energyScore: 22 + profile.energyOffset, peakLevel: 30,
      directionNote: "Let the peak resolve into a clear emotional afterglow.",
    },
  ];

  const peakDecision = decidePeak(
    preset,
    detected,
    drafts.map(({ section }) => section),
  );
  const mainPeakSection = peakDecision.section;

  const sections = drafts
    .map((section) => ({
      ...section,
      startRatio: ratio(section.startRatio),
      endRatio: ratio(section.endRatio),
      emotionScore: score(section.emotionScore),
      energyScore: score(section.energyScore),
      peakLevel: score(section.section === mainPeakSection ? 100 : section.peakLevel),
      mainPeak: section.section === mainPeakSection,
    }))
    .sort((a, b) => a.startRatio - b.startRatio);

  return {
    primaryEmotion,
    secondaryEmotions,
    overallArc: sections.map(({ primaryEmotion: emotion }) => emotion).join(" → "),
    mainPeakSection,
    afterglow: sections.at(-1)?.primaryEmotion ?? "hope",
    sections,
  };
}
