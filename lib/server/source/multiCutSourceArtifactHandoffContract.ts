import type {
  MultiCutSourceArtifactHandoff,
} from "./multiCutSourceArtifactHandoffTypes";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isMultiCutSourceArtifactHandoff = (
  value: unknown,
): value is MultiCutSourceArtifactHandoff =>
  isRecord(value) &&
  value.handoffVersion === "1.0" &&
  Object.hasOwn(value, "authorityInput");
