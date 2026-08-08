import type { PostgreSQLTransactionConnectionV2 } from "../postgresqlDriver/types";
import {
  createDurableWorkflowPostgresqlSameSessionQueryCapabilitySetV1,
} from "./postgresqlGeneralSameSessionQueryCapability";
import {
  createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2,
} from "./postgresqlDurableWorkflowDatabaseCapabilityV2";
import type {
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowSameSessionQueryCapabilityV2,
  DurableWorkflowTransactionContextV3,
} from "./sameSessionQueryTypes";
import type {
  DurableWorkflowDatabaseCapabilityV2,
  DurableWorkflowTransactionContext,
} from "./types";
import { narrowDurableWorkflowGeneralSameSessionQueryCapabilityV2 } from "./postgresqlGeneralSameSessionQueryCapability";

export type ProductionSessionConstructionAuthorityVersionV1 = "1.0";

export type ProductionSessionTransactionOwnerEvidenceV1 = Readonly<{
  evidenceVersion: "1.0";
  transactionOwner: "workflow-owner";
  transactionState: "active";
}>;

export type ProductionSessionSameConnectionEvidenceV1 = Readonly<{
  version: "1.0";
  source: "single-postgresql-transaction-connection";
  transactionOwner: "workflow-owner";
}>;

export type WorkflowCompletionStateParticipantConstructionDependencyV1 =
  Readonly<{
    dependencyVersion: "1.0";
    sameSessionQueryCapability: DurableWorkflowSameSessionQueryCapabilityV2;
    sameSessionEvidence: ProductionSessionSameConnectionEvidenceV1;
  }>;

/** Server-internal construction boundary. The connection must already be active. */
export type ProductionSessionConstructionInputV1 = Readonly<{
  constructionVersion: "1.0";
  transactionConnection: PostgreSQLTransactionConnectionV2;
  transactionContextV2: DurableWorkflowTransactionContext;
  transactionOwnerEvidence: ProductionSessionTransactionOwnerEvidenceV1;
}>;

export type ProductionSessionConstructionResultV1 = Readonly<{
  constructionVersion: "1.0";
  generalSameSessionQueryCapability: ReturnType<
    typeof import("./postgresqlGeneralSameSessionQueryCapability").createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1
  >;
  manyOnlySameSessionQueryCapability: DurableWorkflowSameSessionQueryCapability;
  durableWorkflowDatabaseCapabilityV2: DurableWorkflowDatabaseCapabilityV2;
  contextV3: DurableWorkflowTransactionContextV3;
  workflowCompletionStateParticipantDependency: WorkflowCompletionStateParticipantConstructionDependencyV1;
  sameSessionEvidence: ProductionSessionSameConnectionEvidenceV1;
}>;

const SAME_CONNECTION_EVIDENCE: ProductionSessionSameConnectionEvidenceV1 =
  Object.freeze({
    version: "1.0",
    source: "single-postgresql-transaction-connection",
    transactionOwner: "workflow-owner",
  });

function createContextV3(
  contextV2: DurableWorkflowTransactionContext,
  sameSessionQuery: DurableWorkflowSameSessionQueryCapability,
): DurableWorkflowTransactionContextV3 {
  return Object.freeze({
    contextVersion: "3.0",
    scope: contextV2.scope,
    startedAt: contextV2.startedAt,
    deadlineMonotonicMilliseconds: contextV2.deadlineMonotonicMilliseconds,
    externalIoAllowed: contextV2.externalIoAllowed,
    database: contextV2.database,
    state: contextV2.state,
    registerAfterCommit: contextV2.registerAfterCommit,
    sameSessionQuery,
  });
}
export function constructProductionTransactionSessionCapabilitiesV3(
  input: ProductionSessionConstructionInputV1,
): ProductionSessionConstructionResultV1 {
  if (
    input.constructionVersion !== "1.0"
    || input.transactionOwnerEvidence.evidenceVersion !== "1.0"
    || input.transactionOwnerEvidence.transactionOwner !== "workflow-owner"
    || input.transactionOwnerEvidence.transactionState !== "active"
    || input.transactionConnection.state() !== "active"
    || input.transactionContextV2.contextVersion !== "2.0"
    || input.transactionContextV2.state() !== "active"
  ) {
    throw new TypeError("invalid-production-session-construction-input");
  }

  const capabilities = createDurableWorkflowPostgresqlSameSessionQueryCapabilitySetV1({
    transactionConnection: input.transactionConnection,
  });
  const databaseV2 = createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2({
    sameSessionQueryCapability: capabilities.general,
  });
  const participantDependency = Object.freeze({
    dependencyVersion: "1.0",
    sameSessionQueryCapability: narrowDurableWorkflowGeneralSameSessionQueryCapabilityV2(capabilities.general),
    sameSessionEvidence: SAME_CONNECTION_EVIDENCE,
  } as const);

  return Object.freeze({
    constructionVersion: "1.0",
    generalSameSessionQueryCapability: capabilities.general,
    manyOnlySameSessionQueryCapability: capabilities.manyOnly,
    durableWorkflowDatabaseCapabilityV2: databaseV2,
    contextV3: createContextV3(input.transactionContextV2, capabilities.manyOnly),
    workflowCompletionStateParticipantDependency: participantDependency,
    sameSessionEvidence: SAME_CONNECTION_EVIDENCE,
  });
}
