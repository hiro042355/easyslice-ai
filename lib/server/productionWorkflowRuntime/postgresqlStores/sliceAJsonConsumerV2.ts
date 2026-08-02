import { projectProductionStructuredJsonValueV2 } from "../structuredJsonValueV2";
import type { ProductionStructuredJsonValueV2 } from "../structuredJsonValueV2";

export type SliceAJsonValueV2 = ProductionStructuredJsonValueV2;

export type SliceADatabaseValueV2 = SliceAJsonValueV2 | Uint8Array;
export type SliceADatabaseRowV2 = Readonly<Record<string, SliceADatabaseValueV2>>;

export type SliceAJsonValidationFailureV2 = Readonly<{
  resultVersion: "2.0";
  status: "failure";
  kind: "row-validation-failure";
  safeReason: "invalid-structured-json" | "invalid-row";
  retryable: false;
  ownerAction: "do-not-commit";
}>;

export type SliceAJsonProjectionResultV2 =
  | Readonly<{ status: "success"; value: Readonly<Record<string, SliceAJsonValueV2>> }>
  | SliceAJsonValidationFailureV2;

const failure = (safeReason: SliceAJsonValidationFailureV2["safeReason"]): SliceAJsonValidationFailureV2 =>
  Object.freeze({
    resultVersion: "2.0",
    status: "failure",
    kind: "row-validation-failure",
    safeReason,
    retryable: false,
    ownerAction: "do-not-commit",
  });

export function projectSliceAJsonObjectV2(value: unknown): SliceAJsonProjectionResultV2 {
  const projected = projectProductionStructuredJsonValueV2(value);
  if (projected.status === "failure" || projected.value === null || Array.isArray(projected.value) || typeof projected.value !== "object") {
    return failure("invalid-structured-json");
  }
  return Object.freeze({
    status: "success",
    value: projected.value as Readonly<Record<string, SliceAJsonValueV2>>,
  });
}

export function createSliceAInvalidRowFailureV2(): SliceAJsonValidationFailureV2 {
  return failure("invalid-row");
}
