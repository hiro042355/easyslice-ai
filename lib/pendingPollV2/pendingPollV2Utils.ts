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
  status: any,
  state: any,
  op: any,
  attempt: any,
  reasonCodes: any,
  selectedItemStatus?: any
): PendingUploadPollV2Audit => {
  const items = Array.isArray(state?.items) ? state.items : [];
  return Object.freeze({
    auditVersion: "1.0" as const,
    status: status as PendingUploadPollV2Status,
    operation: op,
    attempt: Number(attempt) || 1,
    selectedItemStatus,
    pendingItemCount: items.filter((i: any) => i.status === "accepted" || i.status === "processing").length,
    processingItemCount: items.filter((i: any) => i.status === "processing").length,
    completedItemCount: items.filter((i: any) => i.status === "completed").length,
    omittedItemCount: items.filter((i: any) => i.status === "omitted").length,
    failedItemCount: items.filter((i: any) => i.status === "failed").length,
    reasonCodes: reasonCodes || [],
  });
};
