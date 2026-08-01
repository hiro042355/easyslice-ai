import { createMultiCutReplayCompleteProcessingParameterInput } from "../multiCutReplayPersistenceParameters";
import { createMultiCutReplayCompleteParticipationRequestV2 } from "../multiCutReplayPostgresqlTransactionParticipation";
import {
  createMultiCutReplayLifecycleCompleteParameterInputFailureV1,
  createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1,
} from "./completePreParticipationFailureContractV1";
import { createMultiCutReplayLifecycleCompleteProductionOutputV1 } from "./completeProductionOutputContractV1";
import { projectMultiCutReplayCompleteParticipationResultToLifecycleV1 } from "./projectionContractV1";
import type {
  MultiCutReplayLifecycleCompleteProductionAdapter,
  MultiCutReplayLifecycleCompleteProductionAdapterDependencies,
} from "./completeProductionAdapterTypes";

export const createMultiCutReplayLifecycleCompleteProductionAdapter = (
  dependencies: MultiCutReplayLifecycleCompleteProductionAdapterDependencies,
): MultiCutReplayLifecycleCompleteProductionAdapter => Object.freeze({
  async complete(request) {
    const parameterResult = dependencies.createParameterInput({
      inputVersion: "1.0",
      versionAuthority: request.authority.parameterVersionAuthority,
      completion: Object.freeze({
        ...request.input,
        metadata: Object.freeze({
          ...request.input.metadata,
          completedAt: request.authority.completionTimestamp,
        }),
      }),
    });
    if (parameterResult.status === "invalid") {
      return dependencies.createParameterFailureOutput(parameterResult);
    }
    const participationResult = dependencies.createParticipationRequest({
      authoritativeReplayIdentity:
        request.authority.authoritativeReplayIdentity,
      parameterInput: parameterResult.value,
    });
    if (participationResult.status === "invalid") {
      return dependencies.createRequestFailureOutput(participationResult);
    }
    const participantResult = await dependencies.participant.executeComplete(
      request.authority.queryPort,
      participationResult.request,
    );
    const projection = dependencies.projectLifecycleResult(participantResult);
    return dependencies.createProductionOutput(projection);
  },
});

export const createDefaultMultiCutReplayLifecycleCompleteProductionAdapter = (
  participant: MultiCutReplayLifecycleCompleteProductionAdapterDependencies["participant"],
): MultiCutReplayLifecycleCompleteProductionAdapter =>
  createMultiCutReplayLifecycleCompleteProductionAdapter({
    createParameterInput: createMultiCutReplayCompleteProcessingParameterInput,
    createParticipationRequest: createMultiCutReplayCompleteParticipationRequestV2,
    participant,
    projectLifecycleResult:
      projectMultiCutReplayCompleteParticipationResultToLifecycleV1,
    createProductionOutput:
      createMultiCutReplayLifecycleCompleteProductionOutputV1,
    createParameterFailureOutput:
      createMultiCutReplayLifecycleCompleteParameterInputFailureV1,
    createRequestFailureOutput:
      createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1,
  });
