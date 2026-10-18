import type {
  PendingUploadPollV2Audit,
  PendingUploadPollV2Issue,
  PendingUploadPollV2ReasonCode,
  PendingUploadPollV2Status,
} from "./types";

export const copy = <T>(value: T): T => (value === undefined ? undefined as unknown as T : JSON.parse(JSON.stringify(value)));

export const freeze = <T>(value: T): T => Object.freeze(value);

export const validIso = (value: unknown): boolean =>
  typeof value === "string" && !isNaN(Date.parse(value));

export const validOpaque = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const addSeconds = (isoString: string, seconds: number): string => {
  const date = new Date(isoString);
  date.setSeconds(date.getSeconds() + seconds);
  return date.toISOString();
};

export const issue = (
  code: PendingUploadPollV2ReasonCode | string,
  classification: "invalid" | "missing" | "expired" | "conflict" | "failed" | "cancelled" | "blocked" | "internal" = "invalid",
  retryable = false
): PendingUploadPollV2Issue =>
  Object.freeze({
    reasonCode: code as PendingUploadPollV2ReasonCode,
    classification,
    retryable,
  });

export const reasons = (codes: readonly (PendingUploadPollV2ReasonCode | string)[]): readonly PendingUploadPollV2ReasonCode[] =>
  Object.freeze(codes as PendingUploadPollV2ReasonCode[]);

export const audit = (
  status: PendingUploadPollV2Status,
  state: unknown,
  op: PendingUploadPollV2Audit["operation"],
  attempt: unknown,
  reasonCodes: PendingUploadPollV2Audit["reasonCodes"] | undefined,
  selectedItemStatus?: PendingUploadPollV2Audit["selectedItemStatus"]
): PendingUploadPollV2Audit => {
  const items: readonly unknown[] = state && typeof state === "object" && "items" in state && Array.isArray(state.items) ? state.items : [];
  const statusOf = (item: unknown): unknown => item && typeof item === "object" && "status" in item ? item.status : undefined;
  return Object.freeze({
    auditVersion: "1.0" as const,
    status: status as PendingUploadPollV2Status,
    operation: op,
    attempt: Number(attempt) || 1,
    selectedItemStatus,
    pendingItemCount: items.filter((item) => statusOf(item) === "accepted" || statusOf(item) === "processing").length,
    processingItemCount: items.filter((item) => statusOf(item) === "processing").length,
    completedItemCount: items.filter((item) => statusOf(item) === "completed").length,
    omittedItemCount: items.filter((item) => statusOf(item) === "omitted").length,
    failedItemCount: items.filter((item) => statusOf(item) === "failed").length,
    reasonCodes: reasonCodes || [],
  });
};
