import type {
  PostgreSQLDriverIssueCode,
  PostgreSQLQueryConnectionDisposition,
  PostgreSQLQueryRequest,
  PostgreSQLRow,
} from "../postgresqlDriver/types";
import type { DurableWorkflowTransactionContext } from "./types";

export type DurableWorkflowSameSessionQueryCapabilityVersion = "1.0";

export type DurableWorkflowGeneralSameSessionQueryCapabilityVersionV1 = "1.0";

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

export type DurableWorkflowGeneralSameSessionQueryRequestV1 =
  Readonly<PostgreSQLQueryRequest>;

export type DurableWorkflowGeneralSameSessionQuerySuccessV1 =
  DurableWorkflowSameSessionQuerySuccess;

export type DurableWorkflowGeneralSameSessionQueryNotFoundV1 = Readonly<{
  resultVersion: "1.0";
  status: "not-found";
  expectedResult: "single";
  actualRowCount: 0;
  command: string;
}>;

export type DurableWorkflowGeneralSameSessionQueryCardinalityConflictV1 =
  Readonly<{
    resultVersion: "1.0";
    status: "cardinality-conflict";
    expectedResult: "single" | "none";
    actualRowCount: number;
    command: string;
  }>;

export type DurableWorkflowGeneralSameSessionQueryExecutionFailureV1 =
  DurableWorkflowSameSessionQueryFailure;

export type DurableWorkflowGeneralSameSessionQueryResultV1 =
  | DurableWorkflowGeneralSameSessionQuerySuccessV1
  | DurableWorkflowGeneralSameSessionQueryNotFoundV1
  | DurableWorkflowGeneralSameSessionQueryCardinalityConflictV1
  | DurableWorkflowGeneralSameSessionQueryExecutionFailureV1;

export type DurableWorkflowGeneralSameSessionQueryCapabilityV1 = Readonly<{
  capabilityVersion: DurableWorkflowGeneralSameSessionQueryCapabilityVersionV1;
  evidence: DurableWorkflowSameSessionEvidence;
  executeQuery(
    request: DurableWorkflowGeneralSameSessionQueryRequestV1,
  ): Promise<DurableWorkflowGeneralSameSessionQueryResultV1>;
}>;

export type DurableWorkflowSameSessionQueryCapabilitySetV1 = Readonly<{
  general: DurableWorkflowGeneralSameSessionQueryCapabilityV1;
  manyOnly: DurableWorkflowSameSessionQueryCapability;
}>;

export type DurableWorkflowTransactionContextV3 = Readonly<
  Omit<DurableWorkflowTransactionContext, "contextVersion"> & {
    contextVersion: "3.0";
    sameSessionQuery: DurableWorkflowSameSessionQueryCapability;
  }
>;
