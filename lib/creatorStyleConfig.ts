export type CreatorStyle = "standard" | "creator";

export type SubtitleAnimation = "none" | "soft" | "normal" | "strong";
export type CutTempo = "none" | "slow" | "medium" | "fast";

export type CreatorStyleConfig = {
  style: CreatorStyle;
  intensity: number;
  enabled: boolean;
  zoomStrength: number;
  subtitleAnimation: SubtitleAnimation;
  subtitleScale: number;
  subtitleSpeed: number;
  cutTempo: CutTempo;
  emphasisLevel: number;
};

const clampIntensity = (intensity: number) => Math.min(5, Math.max(1, Math.round(intensity)));

const creatorConfigs: Record<number, Omit<CreatorStyleConfig, "style" | "intensity" | "enabled">> = {
  1: {
    zoomStrength: 0.1,
    subtitleAnimation: "soft",
    subtitleScale: 1.02,
    subtitleSpeed: 0.9,
    cutTempo: "slow",
    emphasisLevel: 1,
  },
  2: {
    zoomStrength: 0.3,
    subtitleAnimation: "soft",
    subtitleScale: 1.06,
    subtitleSpeed: 1,
    cutTempo: "slow",
    emphasisLevel: 2,
  },
  3: {
    zoomStrength: 0.5,
    subtitleAnimation: "normal",
    subtitleScale: 1.1,
    subtitleSpeed: 1.1,
    cutTempo: "medium",
    emphasisLevel: 3,
  },
  4: {
    zoomStrength: 0.75,
    subtitleAnimation: "strong",
    subtitleScale: 1.14,
    subtitleSpeed: 1.2,
    cutTempo: "fast",
    emphasisLevel: 4,
  },
  5: {
    zoomStrength: 1,
    subtitleAnimation: "strong",
    subtitleScale: 1.2,
    subtitleSpeed: 1.35,
    cutTempo: "fast",
    emphasisLevel: 5,
  },
};

const standardConfig: Omit<CreatorStyleConfig, "style" | "intensity" | "enabled"> = {
  zoomStrength: 0,
  subtitleAnimation: "none",
  subtitleScale: 1,
  subtitleSpeed: 1,
  cutTempo: "none",
  emphasisLevel: 0,
};

export const getCreatorStyleConfig = (
  style: CreatorStyle,
  animationIntensity: number
): CreatorStyleConfig => {
  const intensity = clampIntensity(animationIntensity);

  if (style === "standard") {
    return {
      style,
      intensity,
      enabled: false,
      ...standardConfig,
    };
  }

  return {
    style,
    intensity,
    enabled: true,
    ...creatorConfigs[intensity],
  };
};