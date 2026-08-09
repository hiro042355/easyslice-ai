import { createMultiCutReplayCompleteProcessingParameterInput } from "../multiCutReplayPersistenceParameters";
import { createMultiCutReplayCompleteParticipationRequestV2, type MultiCutReplayCompleteTransactionParticipantV3, type MultiCutReplayCompleteQueryExecutionPortV3 } from "../multiCutReplayPostgresqlTransactionParticipation";
import { createMultiCutReplayLifecycleCompleteParameterInputFailureV1, createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1 } from "./completePreParticipationFailureContractV1";
import { projectMultiCutReplayCompleteParticipationResultToLifecycleV1 } from "./projectionContractV1";
import { createMultiCutReplayLifecycleCompleteProductionOutputV1 } from "./completeProductionOutputContractV1";
import { projectCompleteLifecycleFailureEvidenceV2, type MultiCutReplayLifecycleCompleteResultV2 } from "./completeFailureEvidenceV2";
import { MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1 } from "./completeProductionOutputContractV1";
import type { MultiCutReplayLifecycleCompleteProductionAdapterInputV1 } from "./completeProductionAdapterTypes";

export type MultiCutReplayLifecycleCompleteProductionAdapterV2 = Readonly<{ adapterVersion: "2.0"; complete(input: Omit<MultiCutReplayLifecycleCompleteProductionAdapterInputV1, "authority"> & Readonly<{ authority: Omit<MultiCutReplayLifecycleCompleteProductionAdapterInputV1["authority"], "queryPort"> & Readonly<{ queryPort: MultiCutReplayCompleteQueryExecutionPortV3 }> }>): Promise<MultiCutReplayLifecycleCompleteResultV2> }>;
export function createMultiCutReplayLifecycleCompleteProductionAdapterV2(
  participant: MultiCutReplayCompleteTransactionParticipantV3,
): MultiCutReplayLifecycleCompleteProductionAdapterV2 {
  return Object.freeze({
    adapterVersion: "2.0",
    async complete(request) {
      const parameters = createMultiCutReplayCompleteProcessingParameterInput({
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
      if (parameters.status === "invalid") {
        return createMultiCutReplayLifecycleCompleteParameterInputFailureV1(parameters);
      }
      const validated = createMultiCutReplayCompleteParticipationRequestV2({
        authoritativeReplayIdentity: request.authority.authoritativeReplayIdentity,
        parameterInput: parameters.value,
      });
      if (validated.status === "invalid") {
        return createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1(validated);
      }
      const result = await participant.executeComplete(
        request.authority.queryPort,
        validated.request,
      );
      if (result.status === "execution-failure") {
        return Object.freeze({
          schemaVersion: "2.0",
          contractVersion: "2.0",
          operationIdentity: "complete-replay-participation",
          transactionOwnership:
            MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1,
          status: "execution-failure",
          durability: "not-durable",
          ownerAction: "rollback-required",
          projection: projectCompleteLifecycleFailureEvidenceV2(result.failure),
        });
      }
      const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(
        projectMultiCutReplayCompleteParticipationResultToLifecycleV1(result),
      );
      if (output.status === "execution-failure") {
        throw new TypeError("invalid-complete-lifecycle-v2-projection");
      }
      return output;
    },
  });
}
