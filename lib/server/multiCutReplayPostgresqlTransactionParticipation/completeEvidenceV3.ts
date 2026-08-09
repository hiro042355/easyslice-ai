import type { PostgreSQLDriverIssueCode, PostgreSQLQueryConnectionDisposition, PostgreSQLQueryFailureSafeReason } from "../productionWorkflowRuntime/postgresqlDriver/types";

export type MultiCutReplayCompleteParticipationFailureEvidenceV3 = Readonly<{
  evidenceVersion: "3.0"; transactionPhase: "query"; issue: PostgreSQLDriverIssueCode;
  safeReason: PostgreSQLQueryFailureSafeReason; retryable: boolean;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition: PostgreSQLQueryConnectionDisposition;
  ownerAction: "rollback-required"; commitUnknown: false;
}>;

export function createCompleteParticipationFailureEvidenceV3(value: unknown): MultiCutReplayCompleteParticipationFailureEvidenceV3 | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Partial<MultiCutReplayCompleteParticipationFailureEvidenceV3>;
  const dispositions: readonly PostgreSQLQueryConnectionDisposition[] = ["safe-to-reuse", "must-rollback-before-reuse", "must-discard", "unknown"];
  if (source.issue === undefined || typeof source.safeReason !== "string" || typeof source.retryable !== "boolean" || !dispositions.includes(source.queryConnectionDisposition as PostgreSQLQueryConnectionDisposition)) return undefined;
  return Object.freeze({ evidenceVersion: "3.0", transactionPhase: "query", issue: source.issue, safeReason: source.safeReason, retryable: source.retryable, ...(source.sqlStateClass === undefined ? {} : { sqlStateClass: source.sqlStateClass }), queryConnectionDisposition: source.queryConnectionDisposition as PostgreSQLQueryConnectionDisposition, ownerAction: "rollback-required", commitUnknown: false });
}
