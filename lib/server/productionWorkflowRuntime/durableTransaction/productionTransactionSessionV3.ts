import type {
  PostgreSQLCommitResult,
  PostgreSQLRollbackResult,
  PostgreSQLTransactionDiscardResult,
} from "../postgresqlDriver/types";
import type { WorkflowCompletionStateSameSessionParticipantV1 } from "../../workflowCompletionStatePersistence/participantV1";
import type {
  DurableWorkflowSameSessionQueryCapabilityV2,
  DurableWorkflowTransactionContextV3,
} from "./sameSessionQueryTypes";
import type { DurableWorkflowDatabaseCapabilityV2 } from "./types";
import {
  constructProductionTransactionSessionCapabilitiesV3,
  type ProductionSessionConstructionInputV1,
  type ProductionSessionSameConnectionEvidenceV1,
} from "./productionSessionConstructionAuthorityV3";

export type DurableWorkflowTransactionSessionV3 = Readonly<{
  sessionVersion: "3.0";
  contextV3: DurableWorkflowTransactionContextV3;
  databaseV2: DurableWorkflowDatabaseCapabilityV2;
  workflowCompletionState: WorkflowCompletionStateSameSessionParticipantV1;
  manyOnlySameSessionQueryV2: DurableWorkflowSameSessionQueryCapabilityV2;
  sameSessionEvidence: ProductionSessionSameConnectionEvidenceV1;
  commit(): Promise<PostgreSQLCommitResult>;
  rollback(): Promise<PostgreSQLRollbackResult>;
  release(): "released" | "already-released" | "transaction-active";
  discard(): PostgreSQLTransactionDiscardResult;
}>;

export function createDurableWorkflowTransactionSessionV3(
  input: ProductionSessionConstructionInputV1,
): DurableWorkflowTransactionSessionV3 {
  const constructed = constructProductionTransactionSessionCapabilitiesV3(input);
  const connection = input.transactionConnection;
  let commitResult: Promise<PostgreSQLCommitResult> | undefined;
  let rollbackResult: Promise<PostgreSQLRollbackResult> | undefined;
  let releaseResult: ReturnType<typeof connection.release> | undefined;
  let discardResult: PostgreSQLTransactionDiscardResult | undefined;

  return Object.freeze({
    sessionVersion: "3.0",
    contextV3: constructed.contextV3,
    databaseV2: constructed.durableWorkflowDatabaseCapabilityV2,
    workflowCompletionState: constructed.workflowCompletionStateParticipant,
    manyOnlySameSessionQueryV2: constructed.manyOnlySameSessionQueryCapabilityV2,
    sameSessionEvidence: constructed.sameSessionEvidence,
    commit() {
      commitResult ??= connection.commit();
      return commitResult;
    },
    rollback() {
      rollbackResult ??= connection.rollback();
      return rollbackResult;
    },
    release() {
      releaseResult ??= connection.release();
      return releaseResult;
    },
    discard() {
      discardResult ??= connection.discard();
      return discardResult;
    },
  });
}
