import { projectProductionStructuredJsonValueV2 } from "../structuredJsonValueV2";
import type {
  DurableWorkflowDatabaseRowProjectionFailureReasonV2,
  DurableWorkflowDatabaseRowProjectionFailureV2,
  DurableWorkflowDatabaseRowV2,
  DurableWorkflowDatabaseSuccessResultV2,
  DurableWorkflowDatabaseValueV2,
} from "./types";

export type DurableWorkflowDatabaseRowsProjectionResultV2 =
  | Readonly<{ status: "success"; rows: readonly DurableWorkflowDatabaseRowV2[] }>
  | DurableWorkflowDatabaseRowProjectionFailureV2;

export type DurableWorkflowQuerySuccessEvidenceSourceV2 = Readonly<{
  rows: readonly Readonly<Record<string, unknown>>[];
  rowCount: number;
  command: string;
}>;

const failure = (
  reason: DurableWorkflowDatabaseRowProjectionFailureReasonV2,
  mutationAttempted: boolean,
): DurableWorkflowDatabaseRowProjectionFailureV2 => Object.freeze({
  resultVersion: "2.0",
  status: "failure",
  kind: "row-projection-failure",
  phase: "result-projection",
  reason,
  queryInvoked: true,
  mutationAttempted,
  retryAttempted: false,
  ownerAction: "do-not-commit",
});

function projectValue(
  value: unknown,
  mutationAttempted: boolean,
): Readonly<{ status: "success"; value: DurableWorkflowDatabaseValueV2 }> | DurableWorkflowDatabaseRowProjectionFailureV2 {
  if (value instanceof Uint8Array) {
    try {
      return Object.freeze({ status: "success", value: Uint8Array.from(value) });
    } catch {
      return failure("invalid-binary-value", mutationAttempted);
    }
  }
  const projected = projectProductionStructuredJsonValueV2(value);
  if (projected.status === "success") return projected;
  const reason = projected.reason === "non-finite-number"
    ? "non-finite-number"
    : projected.reason === "cyclic-value"
      ? "cyclic-value"
      : "unsupported-row-value";
  return failure(reason, mutationAttempted);
}

export function projectPostgresqlQueryRowsToDurableRowsV2(
  rows: readonly Readonly<Record<string, unknown>>[],
  mutationAttempted: boolean,
): DurableWorkflowDatabaseRowsProjectionResultV2 {
  const output: DurableWorkflowDatabaseRowV2[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return failure("invalid-structured-json", mutationAttempted);
    }
    const prototype = Object.getPrototypeOf(row);
    if (prototype !== Object.prototype && prototype !== null) {
      return failure("invalid-structured-json", mutationAttempted);
    }
    const projectedRow: Record<string, DurableWorkflowDatabaseValueV2> = {};
    for (const key of Object.keys(row)) {
      const descriptor = Object.getOwnPropertyDescriptor(row, key);
      if (!descriptor || descriptor.get || descriptor.set) {
        return failure("unsupported-row-value", mutationAttempted);
      }
      const projected = projectValue(descriptor.value, mutationAttempted);
      if (projected.status === "failure") return projected;
      projectedRow[key] = projected.value;
    }
    output.push(Object.freeze(projectedRow));
  }
  return Object.freeze({ status: "success", rows: Object.freeze(output) });
}

export function projectPostgresqlQuerySuccessToDurableSuccessV2(
  source: DurableWorkflowQuerySuccessEvidenceSourceV2,
  mutationAttempted: boolean,
): DurableWorkflowDatabaseSuccessResultV2 | DurableWorkflowDatabaseRowProjectionFailureV2 {
  const projected = projectPostgresqlQueryRowsToDurableRowsV2(source.rows, mutationAttempted);
  if (projected.status === "failure") return projected;
  return Object.freeze({
    status: "success",
    rows: projected.rows,
    rowCount: source.rowCount,
    command: source.command,
  });
}
