import type { PostgreSQLSliceAStatementResolutionV1 } from "../postgresqlStores/postgresqlStatementResolver";

export type DurableWorkflowStatementResolutionFailureReasonV2 =
  | "unsupported-statement"
  | "parameter-count-mismatch"
  | "cardinality-mismatch";

export type DurableWorkflowDatabaseResolverFailureV2 = Readonly<{
  resultVersion: "2.0";
  status: "failure";
  kind: "resolver-failure";
  phase: "statement-resolution";
  reason: DurableWorkflowStatementResolutionFailureReasonV2;
  queryInvoked: false;
  mutationAttempted: false;
  retryAttempted: false;
  ownerAction: "do-not-commit";
}>;

export type PostgreSQLSliceAStatementResolverFailureV1 = Exclude<
  PostgreSQLSliceAStatementResolutionV1,
  { status: "resolved" }
>;

const result = (
  reason: DurableWorkflowStatementResolutionFailureReasonV2,
): DurableWorkflowDatabaseResolverFailureV2 => Object.freeze({
  resultVersion: "2.0",
  status: "failure",
  kind: "resolver-failure",
  phase: "statement-resolution",
  reason,
  queryInvoked: false,
  mutationAttempted: false,
  retryAttempted: false,
  ownerAction: "do-not-commit",
});

export function createDurableWorkflowResolverFailureV2(
  resolverFailure: PostgreSQLSliceAStatementResolverFailureV1,
): DurableWorkflowDatabaseResolverFailureV2 {
  switch (resolverFailure.status) {
    case "unsupported-statement":
      return result("unsupported-statement");
    case "invalid-request":
      switch (resolverFailure.reason) {
        case "parameter-count-mismatch":
          return result("parameter-count-mismatch");
        case "cardinality-mismatch":
          return result("cardinality-mismatch");
      }
  }
}

export function isDurableWorkflowDatabaseResolverFailureV2(
  value: unknown,
): value is DurableWorkflowDatabaseResolverFailureV2 {
  if (typeof value !== "object" || value === null) return false;
  const reason = Reflect.get(value, "reason");
  return Reflect.get(value, "resultVersion") === "2.0"
    && Reflect.get(value, "status") === "failure"
    && Reflect.get(value, "kind") === "resolver-failure"
    && Reflect.get(value, "phase") === "statement-resolution"
    && ["unsupported-statement", "parameter-count-mismatch", "cardinality-mismatch"].includes(reason)
    && Reflect.get(value, "queryInvoked") === false
    && Reflect.get(value, "mutationAttempted") === false
    && Reflect.get(value, "retryAttempted") === false
    && Reflect.get(value, "ownerAction") === "do-not-commit";
}
