export type AiHookConfig = {
  enabled: boolean;
  mode: "smart" | "3s" | "5s" | "7s";
};

export type HookPreview = {
  start: number;
  end: number;
  duration: number;
  source: "ai-highlight";
  confidence: number;
};

const modeDurations: Record<AiHookConfig["mode"], number> = {
  smart: 5,
  "3s": 3,
  "5s": 5,
  "7s": 7,
};

export function createHookPreview(config: AiHookConfig): HookPreview | null {
  if (!config.enabled) {
    return null;
  }

  const start = 134;
  const duration = modeDurations[config.mode];

  return {
    start,
    end: start + duration,
    duration,
    source: "ai-highlight",
    confidence: config.mode === "smart" ? 94 : 88,
  };
}
