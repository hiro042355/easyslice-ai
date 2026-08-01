import type {
  PostgreSQLDriverIssueCode,
  PostgreSQLQueryConnectionDisposition,
  PostgreSQLQueryRequest,
  PostgreSQLRow,
} from "../postgresqlDriver/types";
import type { DurableWorkflowTransactionContext } from "./types";

export type DurableWorkflowSameSessionQueryCapabilityVersion = "1.0";

export type DurableWorkflowSameSessionEvidence = Readonly<{
  evidenceVersion: "1.0";
  sessionScope: "workflow-transaction";
  sessionAffinity: "same-session-required";
  transactionOwnership: "workflow-owner";
  separateConnectionPermitted: false;
  capabilityOwnsLifecycle: false;
  validOnlyDuringActiveTransaction: true;
}>;

export type DurableWorkflowSameSessionQueryRequestV1 = Readonly<
  Omit<PostgreSQLQueryRequest, "expectedResult"> & {
    expectedResult: "many";
  }
>;

export type DurableWorkflowSameSessionQueryRequest =
  DurableWorkflowSameSessionQueryRequestV1;

export type DurableWorkflowSameSessionQuerySuccess = Readonly<{
  resultVersion: "1.0";
  status: "success";
  rows: readonly PostgreSQLRow[];
  rowCount: number;
  command: string;
}>;

export type DurableWorkflowSameSessionQueryFailure = Readonly<{
  resultVersion: "1.0";
  status: "execution-failure";
  phase: "query";
  classification: PostgreSQLDriverIssueCode;
  safeReason: string;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type DurableWorkflowSameSessionQueryResult =
  | DurableWorkflowSameSessionQuerySuccess
  | DurableWorkflowSameSessionQueryFailure;

export type DurableWorkflowSameSessionQueryCapability = Readonly<{
  capabilityVersion: DurableWorkflowSameSessionQueryCapabilityVersion;
  evidence: DurableWorkflowSameSessionEvidence;
  executeQuery(
    request: DurableWorkflowSameSessionQueryRequest,
  ): Promise<DurableWorkflowSameSessionQueryResult>;
}>;

export type DurableWorkflowTransactionContextV3 = Readonly<
  Omit<DurableWorkflowTransactionContext, "contextVersion"> & {
    contextVersion: "3.0";
    sameSessionQuery: DurableWorkflowSameSessionQueryCapability;
  }
>;
