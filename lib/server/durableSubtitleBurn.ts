export type CreatorSubtitleStyleConfig = Readonly<{ style?: string; enabled?: boolean; intensity?: number }>;
export type SubtitleLine = Readonly<{ start: number; end: number; text: string }>;

const clampIntensity = (value: unknown): number => {
  const intensity = Number(value ?? 3);
  return Number.isFinite(intensity) ? Math.min(5, Math.max(1, Math.round(intensity))) : 3;
};

export const getCreatorSubtitleRenderConfig = (config: unknown) => {
  const value = config as CreatorSubtitleStyleConfig | null;
  const enabled = value?.style === "creator" && value.enabled === true;
  const intensity = clampIntensity(value?.intensity);
  const scale: Record<number, number> = { 1: 1, 2: 1.05, 3: 1.1, 4: 1.18, 5: 1.25 };
  const fade: Record<number, Readonly<{ inMs: number; outMs: number }>> = {
    1: { inMs: 120, outMs: 80 }, 2: { inMs: 140, outMs: 90 }, 3: { inMs: 170, outMs: 110 },
    4: { inMs: 200, outMs: 130 }, 5: { inMs: 240, outMs: 160 },
  };
  return Object.freeze({
    enabled, intensity, fontSize: Math.round(28 * scale[intensity]), fade: Object.freeze(fade[intensity]),
    outline: enabled ? Math.min(5, 2 + Math.ceil(intensity / 2)) : 3,
    shadow: enabled ? Math.min(3, 1 + Math.floor(intensity / 3)) : 1,
  });
};

const toSrtTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},000`;
};

const toAssTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const textLines = (value: string): string[] => value.split("\n").map((line) => line.trim()).filter(Boolean);

export const createSubtitleLines = (mainText: string, subText = "", dual = false): readonly SubtitleLine[] => {
  const main = textLines(mainText);
  const sub = textLines(subText);
  const length = dual ? Math.max(main.length, sub.length) : main.length;
  return Object.freeze(Array.from({ length }, (_, index) => {
    const start = Math.max(0, index * 2 - 0.3);
    return Object.freeze({
      start, end: start + 2,
      text: dual ? [main[index] ?? "", sub[index] ?? ""].filter(Boolean).join("\n") : main[index]!,
    });
  }));
};

export const subtitleLinesToSrt = (lines: readonly SubtitleLine[]): string => lines.map((line, index) => [
  String(index + 1), `${toSrtTime(line.start)} --> ${toSrtTime(line.end)}`, line.text,
].join("\n")).join("\n\n");

export const escapeAssText = (text: string): string => text
  .replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

export const subtitleLinesToCreatorAss = (
  lines: readonly SubtitleLine[], config: ReturnType<typeof getCreatorSubtitleRenderConfig>,
): string => {
  const dialogues = lines.map((line) =>
    `Dialogue: 0,${toAssTime(line.start)},${toAssTime(line.end)},Default,,0,0,0,,{\\fad(${config.fade.inMs},${config.fade.outMs})}${escapeAssText(line.text)}`,
  ).join("\n");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${config.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,${config.outline},${config.shadow},2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues}
`;
};

export const createSubtitleFilter = (subtitlePath: string, creator: boolean): string => {
  const escapedPath = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
  return creator ? `subtitles='${escapedPath}'`
    : `subtitles='${escapedPath}':force_style='Fontsize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=80'`;
};
