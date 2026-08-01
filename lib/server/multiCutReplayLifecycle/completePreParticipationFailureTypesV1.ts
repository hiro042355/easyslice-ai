import type { MultiCutReplayCompleteParameterInputFactoryResultV1 } from "../multiCutReplayPersistenceParameters";
import type { MultiCutReplayCompleteParticipationRequestValidationResultV2 } from "../multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayLifecycleCompleteProductionResultV1 } from "./completeProductionOutputTypesV1";

export type MultiCutReplayLifecycleCompletePreParticipationVersionV1 = "1.0";

type ParameterFactoryFailure = Extract<
  MultiCutReplayCompleteParameterInputFactoryResultV1,
  { status: "invalid" }
>;

type ParticipationRequestFailure = Extract<
  MultiCutReplayCompleteParticipationRequestValidationResultV2,
  { status: "invalid" }
>;

type PreParticipationEvidence = Readonly<{
  statementId: "complete-processing-replay";
  operationIdentity: "complete-replay-participation";
  participantInvoked: false;
  replayParticipationStarted: false;
  queryExecuted: false;
  replayMutationAttempted: false;
  adapterRetryAttempted: false;
  recoveryExecuted: false;
  ownerAction: "do-not-commit";
}>;

export type MultiCutReplayLifecycleCompleteParameterInputFailureV1 = Readonly<{
  schemaVersion: MultiCutReplayLifecycleCompletePreParticipationVersionV1;
  contractVersion: MultiCutReplayLifecycleCompletePreParticipationVersionV1;
  kind: "pre-participation-failure";
  phase: "parameter-input-validation";
  reason: ParameterFactoryFailure["reason"];
  validationReason: ParameterFactoryFailure["validationReason"];
  evidence: PreParticipationEvidence;
}>;

export type MultiCutReplayLifecycleCompleteParticipationRequestFailureV1 =
  Readonly<{
    schemaVersion: MultiCutReplayLifecycleCompletePreParticipationVersionV1;
    contractVersion: MultiCutReplayLifecycleCompletePreParticipationVersionV1;
    kind: "pre-participation-failure";
    phase: "participation-request-validation";
    reason: ParticipationRequestFailure["reason"];
    evidence: PreParticipationEvidence;
  }>;

export type MultiCutReplayLifecycleCompletePreParticipationFailureV1 =
  | MultiCutReplayLifecycleCompleteParameterInputFailureV1
  | MultiCutReplayLifecycleCompleteParticipationRequestFailureV1;

export type MultiCutReplayLifecycleCompleteAdapterResultV1 =
  | MultiCutReplayLifecycleCompletePreParticipationFailureV1
  | MultiCutReplayLifecycleCompleteProductionResultV1;
