import type { MultiCutReplayCompleteParameterInputFactoryResultV1 } from "../multiCutReplayPersistenceParameters";
import type { MultiCutReplayCompleteParticipationRequestValidationResultV2 } from "../multiCutReplayPostgresqlTransactionParticipation";
import type {
  MultiCutReplayLifecycleCompleteParameterInputFailureV1,
  MultiCutReplayLifecycleCompleteParticipationRequestFailureV1,
} from "./completePreParticipationFailureTypesV1";

const evidence = () => Object.freeze({
  statementId: "complete-processing-replay" as const,
  operationIdentity: "complete-replay-participation" as const,
  participantInvoked: false as const,
  replayParticipationStarted: false as const,
  queryExecuted: false as const,
  replayMutationAttempted: false as const,
  adapterRetryAttempted: false as const,
  recoveryExecuted: false as const,
  ownerAction: "do-not-commit" as const,
});

export const createMultiCutReplayLifecycleCompleteParameterInputFailureV1 = (
  failure: Extract<
    MultiCutReplayCompleteParameterInputFactoryResultV1,
    { status: "invalid" }
  >,
): MultiCutReplayLifecycleCompleteParameterInputFailureV1 => Object.freeze({
  schemaVersion: "1.0",
  contractVersion: "1.0",
  kind: "pre-participation-failure",
  phase: "parameter-input-validation",
  reason: failure.reason,
  validationReason: failure.validationReason,
  evidence: evidence(),
});

export const createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1 = (
  failure: Extract<
    MultiCutReplayCompleteParticipationRequestValidationResultV2,
    { status: "invalid" }
  >,
): MultiCutReplayLifecycleCompleteParticipationRequestFailureV1 => Object.freeze({
  schemaVersion: "1.0",
  contractVersion: "1.0",
  kind: "pre-participation-failure",
  phase: "participation-request-validation",
  reason: failure.reason,
  evidence: evidence(),
});
