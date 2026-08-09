import type { MultiCutReplayCompleteParticipationFailureEvidenceV3 } from "../multiCutReplayPostgresqlTransactionParticipation/completeEvidenceV3";
import type {
  MultiCutReplayLifecycleCompleteProductionCompletedOutputV1,
  MultiCutReplayLifecycleCompleteProductionInvariantOutputV1,
  MultiCutReplayLifecycleCompleteProductionNotAppliedOutputV1,
  MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1,
} from "./completeProductionOutputTypesV1";
import type { MultiCutReplayLifecycleCompletePreParticipationFailureV1 } from "./completePreParticipationFailureTypesV1";

export type MultiCutReplayLifecycleCompleteFailureEvidenceV2 = Readonly<{
  evidenceVersion: "2.0"; status: "unavailable"; sourceStatus: "execution-failure";
  issue: MultiCutReplayCompleteParticipationFailureEvidenceV3["issue"];
  safeReason: MultiCutReplayCompleteParticipationFailureEvidenceV3["safeReason"];
  retryable: boolean;
  sqlStateClass?: MultiCutReplayCompleteParticipationFailureEvidenceV3["sqlStateClass"];
  queryConnectionDisposition: MultiCutReplayCompleteParticipationFailureEvidenceV3["queryConnectionDisposition"];
  ownerAction: "rollback-required"; commitUnknown: false;
}>;

export function projectCompleteLifecycleFailureEvidenceV2(source: MultiCutReplayCompleteParticipationFailureEvidenceV3): MultiCutReplayLifecycleCompleteFailureEvidenceV2 {
  return Object.freeze({ evidenceVersion: "2.0", status: "unavailable", sourceStatus: "execution-failure", issue: source.issue, safeReason: source.safeReason, retryable: source.retryable, ...(source.sqlStateClass === undefined ? {} : { sqlStateClass: source.sqlStateClass }), queryConnectionDisposition: source.queryConnectionDisposition, ownerAction: "rollback-required", commitUnknown: false });
}
export type MultiCutReplayLifecycleCompleteProductionExecutionFailureOutputV2 = Readonly<{
  schemaVersion: "2.0";
  contractVersion: "2.0";
  operationIdentity: "complete-replay-participation";
  transactionOwnership: MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1;
  status: "execution-failure";
  durability: "not-durable";
  ownerAction: "rollback-required";
  projection: MultiCutReplayLifecycleCompleteFailureEvidenceV2;
}>;

export type MultiCutReplayLifecycleCompleteResultV2 =
  | MultiCutReplayLifecycleCompletePreParticipationFailureV1
  | MultiCutReplayLifecycleCompleteProductionCompletedOutputV1
  | MultiCutReplayLifecycleCompleteProductionNotAppliedOutputV1
  | MultiCutReplayLifecycleCompleteProductionInvariantOutputV1
  | MultiCutReplayLifecycleCompleteProductionExecutionFailureOutputV2;
