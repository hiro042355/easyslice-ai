import type {
  MultiCutRouteRequest,
  MultiCutRouteResponseProjection,
} from "./multiCutRouteContractTypes";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isMultiCutRouteRequest = (
  value: unknown,
): value is MultiCutRouteRequest =>
  isRecord(value) &&
  value.requestVersion === "1.0" &&
  typeof value.jobId === "string" &&
  typeof value.mediaId === "string" &&
  Object.hasOwn(value, "clips") &&
  Array.isArray(value.clips);

export const isMultiCutRouteResponseProjection = (
  value: unknown,
): value is MultiCutRouteResponseProjection => {
  if (!isRecord(value) || value.responseProjectionVersion !== "1.0") {
    return false;
  }

  if (value.kind === "binary-success") {
    return (
      Object.hasOwn(value, "status") &&
      Object.hasOwn(value, "payload")
    );
  }

  if (value.kind === "json-error") {
    return (
      Object.hasOwn(value, "status") &&
      Object.hasOwn(value, "errorCode") &&
      Object.hasOwn(value, "message")
    );
  }

  return false;
};
