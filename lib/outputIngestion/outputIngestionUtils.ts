import type {
  OutputIngestionIssue,
  OutputIngestionIssueClassification,
  OutputIngestionReasonCode,
} from "./types";

export const REASON_ORDER: readonly OutputIngestionReasonCode[] = [
  "unsupported-contract-version",
  "input-shape-invalid",
  "generation-result-invalid",
  "provider-mismatch",
  "provider-api-version-mismatch",
  "operation-mismatch",
  "output-reference-invalid",
  "duplicate-output-reference",
  "required-output-missing",
  "optional-output-failed",
  "output-count-exceeded",
  "output-role-invalid",
  "output-fetch-failed",
  "output-fetch-timeout",
  "output-too-large",
  "output-empty",
  "mime-type-mismatch",
  "codec-unsupported",
  "checksum-mismatch",
  "metadata-missing",
  "duration-mismatch",
  "dimensions-mismatch",
  "aspect-ratio-mismatch",
  "content-scan-pending",
  "content-quarantined",
  "content-blocked",
  "storage-write-failed",
  "registry-create-failed",
  "provenance-write-failed",
  "duplicate-content-reused",
  "ingestion-cancelled",
  "cleanup-required",
  "idempotency-conflict",
];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isOpaque = (value: unknown, maximumLength: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximumLength &&
  !/[\r\n\u0000]/.test(value) &&
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);

export const normalizeMime = (value: unknown): string =>
  typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";

export const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export const utcMillis = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.000Z$/.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
};

export const deepCopy = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;

export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) deepFreeze(child);
  }
  return value;
};

export const issue = (
  reasonCode: OutputIngestionReasonCode,
  classification: OutputIngestionIssueClassification,
  slotIndex?: number,
  retryable = false,
): OutputIngestionIssue => ({
  reasonCode,
  classification,
  ...(slotIndex === undefined ? {} : { slotIndex }),
  retryable,
});

export const sortIssues = (
  issues: readonly OutputIngestionIssue[],
): OutputIngestionIssue[] => [...issues]
  .sort((left, right) => {
    const reasonDifference = REASON_ORDER.indexOf(left.reasonCode) - REASON_ORDER.indexOf(right.reasonCode);
    if (reasonDifference !== 0) return reasonDifference;
    return (left.slotIndex ?? -1) - (right.slotIndex ?? -1);
  })
  .filter((candidate, index, values) => index === 0 ||
    candidate.reasonCode !== values[index - 1].reasonCode ||
    candidate.slotIndex !== values[index - 1].slotIndex);
