import type { ClipTimedTextV1 } from "@/lib/clipEditing";

const parseTimeToSeconds = (value: string): number => {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return Number.NaN;
};

export const parseSubtitleText = (text: string): readonly ClipTimedTextV1[] => {
  const normalized = text.replace(/\r/g, "");
  const timed = normalized.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeline = lines.find((line) => line.includes("-->"));
    if (!timeline) return [];
    const [startValue, endValue] = timeline.split("-->");
    const start = parseTimeToSeconds(startValue ?? "");
    const end = parseTimeToSeconds((endValue ?? "").trim().split(/\s+/)[0] ?? "");
    const subtitle = lines.filter((line) =>
      line !== timeline && !/^\d+$/.test(line) && line.toUpperCase() !== "WEBVTT"
    ).join(" ").trim();
    return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && subtitle
      ? [{ start, end, text: subtitle }]
      : [];
  });
  if (timed.length > 0) return Object.freeze(timed.map((item) => Object.freeze(item)));

  const plain = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  return Object.freeze(plain.map((line, index) => Object.freeze({
    start: index * 2,
    end: index * 2 + 2,
    text: line,
  })));
};

export const projectTimedTextForHighlight = (subtitles: readonly ClipTimedTextV1[]) =>
  subtitles.map(({ start, text }) => ({ second: start, text }));
