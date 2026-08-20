export type MultiCutInstructionInput = Readonly<{
  start?: unknown;
  end?: unknown;
  title?: unknown;
}>;

export type MultiCutInstruction = Readonly<{
  start: number;
  end: number;
  title: string;
}>;

export const normalizeMultiCutInstructions = (
  values: readonly MultiCutInstructionInput[],
  mediaDuration: number,
): readonly MultiCutInstruction[] | undefined => {
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0 || values.length === 0) return undefined;
  const normalized: MultiCutInstruction[] = [];
  for (const value of values) {
    const start = Number(value?.start);
    const end = Number(value?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > mediaDuration) {
      return undefined;
    }
    normalized.push(Object.freeze({
      start,
      end,
      title: typeof value.title === "string" ? value.title : "",
    }));
  }
  return Object.freeze(normalized);
};

const safeZipTitle = (title: string, index: number): string => {
  const value = title.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  return value || `clip${index}`;
};

export const createMultiCutZipEntryName = (
  index: number,
  format: "original" | "shorts-9x16",
  clip: MultiCutInstruction,
): string => `clip${index}_${format}_${safeZipTitle(clip.title, index)}_${clip.start}-${clip.end}.mp4`;
