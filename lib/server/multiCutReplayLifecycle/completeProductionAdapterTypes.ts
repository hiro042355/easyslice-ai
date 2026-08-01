import type {
  MultiCutReplayCompleteLifecycleInputV4,
  MultiCutReplayCompleteParameterInputFactoryInputV1,
  MultiCutReplayCompleteParameterInputFactoryResultV1,
  MultiCutReplayCompleteParameterInputVersionAuthorityV1,
} from "../multiCutReplayPersistenceParameters";
import type {
  MultiCutReplayCompleteParticipationRequestFactoryInputV2,
  MultiCutReplayCompleteParticipationRequestValidationResultV2,
  MultiCutReplayCompleteParticipationResultV2,
  MultiCutReplayCompleteQueryExecutionPortV2,
  MultiCutReplayCompleteTransactionParticipantV2,
} from "../multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayAuthoritativeIdentity } from "../multiCutReplayShared/types";
import type { MultiCutReplayLifecycleCompleteAdapterResultV1 } from "./completePreParticipationFailureTypesV1";
import type { MultiCutReplayLifecycleCompleteProductionResultV1 } from "./completeProductionOutputTypesV1";
import type { MultiCutReplayLifecycleProjectionResultV1 } from "./projectionTypesV1";

export type MultiCutReplayLifecycleCompleteProductionAuthorityV1 = Readonly<{
  authorityVersion: "1.0";
  authoritativeReplayIdentity: MultiCutReplayAuthoritativeIdentity;
  completionTimestamp: string;
  parameterVersionAuthority: MultiCutReplayCompleteParameterInputVersionAuthorityV1;
  queryPort: MultiCutReplayCompleteQueryExecutionPortV2;
}>;

export type MultiCutReplayLifecycleCompleteProductionAdapterInputV1 = Readonly<{
  inputVersion: "1.0";
  input: MultiCutReplayCompleteLifecycleInputV4;
  authority: MultiCutReplayLifecycleCompleteProductionAuthorityV1;
}>;

export type MultiCutReplayLifecycleCompleteProductionAdapterDependencies =
  Readonly<{
    createParameterInput(
      input: MultiCutReplayCompleteParameterInputFactoryInputV1,
    ): MultiCutReplayCompleteParameterInputFactoryResultV1;
    createParticipationRequest(
      input: MultiCutReplayCompleteParticipationRequestFactoryInputV2,
    ): MultiCutReplayCompleteParticipationRequestValidationResultV2;
    participant: MultiCutReplayCompleteTransactionParticipantV2;
    projectLifecycleResult(
      result: MultiCutReplayCompleteParticipationResultV2,
    ): MultiCutReplayLifecycleProjectionResultV1;
    createProductionOutput(
      projection: MultiCutReplayLifecycleProjectionResultV1,
    ): MultiCutReplayLifecycleCompleteProductionResultV1;
    createParameterFailureOutput(
      failure: Extract<MultiCutReplayCompleteParameterInputFactoryResultV1, { status: "invalid" }>,
    ): MultiCutReplayLifecycleCompleteAdapterResultV1;
    createRequestFailureOutput(
      failure: Extract<MultiCutReplayCompleteParticipationRequestValidationResultV2, { status: "invalid" }>,
    ): MultiCutReplayLifecycleCompleteAdapterResultV1;
  }>;

export type MultiCutReplayLifecycleCompleteProductionAdapter = Readonly<{
  complete(
    input: MultiCutReplayLifecycleCompleteProductionAdapterInputV1,
  ): Promise<MultiCutReplayLifecycleCompleteAdapterResultV1>;
}>;
