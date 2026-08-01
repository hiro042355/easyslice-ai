import type { MultiCutReplayLifecycleInputV4 } from "../multiCutReplayLifecycle/typesV4";
import type { MultiCutReplayCompleteProcessingParameterInputV1 } from "./completeProcessingReplayInputTypes";

export type MultiCutReplayCompleteLifecycleInputV4 = Extract<
  MultiCutReplayLifecycleInputV4,
  { transition: "complete" }
>;

export type MultiCutReplayCompleteParameterInputVersionAuthorityV1 = Readonly<{
  schemaVersion: "1.0";
  contractVersion: "1.0";
  physicalSchemaVersion: "2.0";
  logicalSchemaVersion: "2.0";
  bindingInventoryVersion: "2.0";
  parameterContractVersion: "2.0";
}>;

export type MultiCutReplayCompleteParameterInputFactoryInputV1 = Readonly<{
  inputVersion: "1.0";
  completion: MultiCutReplayCompleteLifecycleInputV4;
  versionAuthority: MultiCutReplayCompleteParameterInputVersionAuthorityV1;
}>;

export type MultiCutReplayCompleteParameterInputFactoryResultV1 =
  | Readonly<{
      resultVersion: "1.0";
      status: "created";
      value: MultiCutReplayCompleteProcessingParameterInputV1;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "invalid";
      reason: "typed-input-validation-failure";
      validationReason:
        | "invalid-input"
        | "unsupported-version"
        | "invalid-statement"
        | "invalid-binding-inventory"
        | "invalid-binding-value";
    }>;

export type MultiCutReplayCompleteParameterAuthorityMappingV1 = Readonly<{
  bindingId: string;
  factoryInputField: string;
  authority: string;
  valueType: string;
  nullability: "required";
  transformation: "forbidden";
  validatorAuthority: "typed-complete-parameter-input-validator";
}>;
