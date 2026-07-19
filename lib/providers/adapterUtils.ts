import type { SectionDirection } from "@/lib/directorDecisionEngine";
import type {
  AssetReference,
  AdapterMappingKind,
  AdapterMappingRecord,
  AdapterIssue,
  AdapterReasonCode,
  AdapterValidationStatus,
  AdapterWarning,
  NormalizedProviderError,
  ProviderErrorCategory,
  SafeProviderMetadata,
} from "@/lib/providers/types";

export const clamp = (
  value: number,
  min: number,
  max: number,
) => Math.min(
  max,
  Math.max(min, Number.isFinite(value) ? value : min),
);

export const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const mapScoreToUnitRange = (value: number) =>
  roundTo(clamp(value, 0, 100) / 100, 4);

export const mapScoreToRange = (
  value: number,
  min: number,
  max: number,
) => roundTo(
  min + mapScoreToUnitRange(value) * (max - min),
  4,
);

export const mapScoreToLevel = (
  value: number,
): "low" | "medium" | "high" => {
  const normalized = clamp(value, 0, 100);
  if (normalized <= 32) return "low";
  if (normalized <= 66) return "medium";
  return "high";
};

export type TimelineSection = {
  section: SectionDirection["section"];
  startSeconds: number;
  endSeconds: number;
  isMainPeak: boolean;
};

export type TimelineConversionResult = {
  status: "ready" | "collapsed" | "invalid";
  timeline: TimelineSection[];
};

export function convertRatiosToTimeline(
  sections: readonly SectionDirection[],
  durationSeconds: number,
  supportsSectionControl = true,
  supportsTimelineControl = true,
): TimelineConversionResult {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { status: "invalid", timeline: [] };
  }
  const expectedSections = [
    "verse",
    "pre-chorus",
    "chorus",
    "bridge",
    "outro",
  ] as const;
  const validSections =
    sections.length === expectedSections.length &&
    sections.every((section, index) => {
      const previous = sections[index - 1];
      return (
        section.section === expectedSections[index] &&
        Number.isFinite(section.startRatio) &&
        Number.isFinite(section.endRatio) &&
        section.startRatio >= 0 &&
        section.endRatio <= 1 &&
        section.startRatio < section.endRatio &&
        (index === 0
          ? section.startRatio === 0
          : section.startRatio === previous.endRatio)
      );
    }) &&
    sections[sections.length - 1]?.endRatio === 1 &&
    sections.filter(({ isMainPeak }) => isMainPeak).length === 1;
  if (!validSections) {
    return { status: "invalid", timeline: [] };
  }
  if (!supportsSectionControl || !supportsTimelineControl) {
    return { status: "collapsed", timeline: [] };
  }
  const ordered = sections.map((section) => ({ ...section }));
  const timeline = ordered.map((section, index): TimelineSection => {
    const start = index === 0
      ? 0
      : roundTo(
          clamp(section.startRatio, 0, 1) * durationSeconds,
          6,
        );
    const end = index === ordered.length - 1
      ? roundTo(durationSeconds, 6)
      : roundTo(
          clamp(section.endRatio, 0, 1) * durationSeconds,
          6,
        );
    return {
      section: section.section,
      startSeconds: start,
      endSeconds: end,
      isMainPeak: section.isMainPeak,
    };
  });
  for (let index = 1; index < timeline.length; index += 1) {
    timeline[index].startSeconds = timeline[index - 1].endSeconds;
  }
  if (timeline[0]) timeline[0].startSeconds = 0;
  if (timeline.at(-1)) {
    timeline[timeline.length - 1].endSeconds =
      roundTo(durationSeconds, 6);
  }
  return { status: "ready", timeline };
}

export function createMappingRecord(args: {
  sourceField: string;
  sourceValue?: string | number | boolean;
  targetField?: string;
  targetValue?: string | number | boolean;
  mapping: AdapterMappingKind;
  reasonCode?: AdapterReasonCode;
}): AdapterMappingRecord {
  return { ...args };
}

export function deduplicateReasonCodes<
  T extends { code: AdapterReasonCode; sourceField?: string },
>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.code + ":" + (item.sourceField ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => ({ ...item }));
}

export function compareSupportedVersion(
  value: string,
  supported: readonly string[],
): boolean {
  return supported.includes(value);
}

export function sanitizeSafeMetadata(
  metadata: unknown,
  allowedKeys: readonly string[],
): SafeProviderMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const source = metadata as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = {};
  for (const key of allowedKeys) {
    const value = source[key];
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) result[key] = value;
  }
  return result;
}

export function isSafeAssetReference(
  asset: Partial<AssetReference>,
  acceptedKinds: readonly AssetReference["kind"][],
  acceptedMimePrefixes: readonly string[] = [],
): boolean {
  return (
    typeof asset.assetId === "string" &&
    asset.assetId.length > 0 &&
    asset.assetId.length <= 256 &&
    !asset.assetId.includes("://") &&
    acceptedKinds.includes(asset.kind as AssetReference["kind"]) &&
    (
      asset.mimeType === undefined ||
      (
        typeof asset.mimeType === "string" &&
        acceptedMimePrefixes.some((prefix) =>
          asset.mimeType!.startsWith(prefix)
        )
      )
    )
  );
}

export function cloneAndFreezeRecord(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cloneValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return Object.freeze(value.map(cloneValue));
    if (value && typeof value === "object") {
      return cloneAndFreezeRecord(
        value as Readonly<Record<string, unknown>>,
      );
    }
    return value;
  };
  return Object.freeze(Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, cloneValue(value)]),
  ));
}

const providerErrorRules: Record<
  string,
  { category: ProviderErrorCategory; retryable: boolean; message: string }
> = {
  authentication: {
    category: "authentication", retryable: false,
    message: "Authentication failed.",
  },
  "rate-limit": {
    category: "rate-limit", retryable: true,
    message: "Request rate was limited.",
  },
  "invalid-request": {
    category: "invalid-request", retryable: false,
    message: "Request was invalid.",
  },
  unsupported: {
    category: "unsupported", retryable: false,
    message: "Requested operation is unsupported.",
  },
  "content-policy": {
    category: "content-policy", retryable: false,
    message: "Request was rejected by content policy.",
  },
  timeout: {
    category: "timeout", retryable: true,
    message: "Request timed out.",
  },
  "provider-unavailable": {
    category: "provider-unavailable", retryable: true,
    message: "Generation service is unavailable.",
  },
  "generation-failed": {
    category: "generation-failed", retryable: false,
    message: "Generation failed.",
  },
  cancelled: {
    category: "cancelled", retryable: false,
    message: "Generation was cancelled.",
  },
};

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  const source = error && typeof error === "object"
    ? error as { code?: unknown; category?: unknown }
    : {};
  const key = typeof source.category === "string"
    ? source.category
    : typeof source.code === "string" ? source.code : "unknown";
  const rule = providerErrorRules[key] ?? {
    category: "unknown" as const,
    retryable: false,
    message: "An unknown generation error occurred.",
  };
  return {
    category: rule.category,
    code: providerErrorRules[key] ? key : undefined,
    message: rule.message,
    retryable: rule.retryable,
  };
}

export function resolveAdapterValidationStatus(
  errors: readonly AdapterIssue[],
  warnings: readonly AdapterWarning[],
): AdapterValidationStatus {
  if (errors.some(
    ({ classification }) => classification === "invalid",
  )) return "invalid";
  if (errors.length > 0) return "unsupported";
  if (warnings.length > 0) return "degraded";
  return "valid";
}
