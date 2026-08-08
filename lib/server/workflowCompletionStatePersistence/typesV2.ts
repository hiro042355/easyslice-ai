import type { PostgreSQLDriverIssueCode, PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";
import type { DurableWorkflowSameSessionQueryCapabilityV2 } from "../productionWorkflowRuntime/durableTransaction/sameSessionQueryTypes";
import type { WorkflowCompletionTransitionRequestV1 } from "../workflowCompletionState";

export type WorkflowCompletionStatePostgresqlExecutorInputV2 = Readonly<{
  inputVersion: "2.0";
  query: DurableWorkflowSameSessionQueryCapabilityV2;
  transitionRequest: WorkflowCompletionTransitionRequestV1;
}>;

export type WorkflowCompletionStatePostgresqlExecutorResultV2 =
  | Readonly<{ resultVersion: "2.0"; status: "transitioned"; rowCount: 1; command: "UPDATE"; transition: ReturnType<typeof import("../workflowCompletionState").createWorkflowCompletionTransitionCandidate> }>
  | Readonly<{ resultVersion: "2.0"; status: "not-applied"; rowCount: 0; command: "UPDATE"; cause: "unresolved"; ownerAction: "rollback-required"; commitAllowed: false; authoritativeLookupRequired: true }>
  | Readonly<{ resultVersion: "2.0"; status: "internal-invariant-violation"; expectedRowCount: 1; actualRowCount: number; ownerAction: "rollback-required" }>
  | Readonly<{ resultVersion: "2.0"; status: "execution-failure"; issue: PostgreSQLDriverIssueCode; safeReason: string; retryable: boolean; sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57"; queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition; ownerAction: "rollback-required" }>;
