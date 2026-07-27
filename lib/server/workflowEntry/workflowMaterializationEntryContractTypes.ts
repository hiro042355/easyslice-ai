import type {
  AuthorityLocatorRuntimeBindingInput,
  AuthorityLocatorRuntimeBindingResult,
} from "../authorityLocatorRuntimeBinding/types";
import type {
  InputMaterializationV2Request,
} from "../inputMaterialization/resolutionContextV2Types";
import type {
  InputMaterializationContext,
} from "../inputMaterialization/types";
import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../locatorMaterializationRuntimeBinding/types";

export type WorkflowMaterializationEntryInput = Readonly<{
  workflowMaterializationEntryInputVersion: "1.0";
  authorityLocatorBindingInput: AuthorityLocatorRuntimeBindingInput;
  materializationRequest: InputMaterializationV2Request;
  materializationExecutionContext: InputMaterializationContext;
}>;

export type WorkflowMaterializationEntryResult = Readonly<{
  workflowMaterializationEntryResultVersion: "1.0";
  authorityLocatorBindingResult: AuthorityLocatorRuntimeBindingResult;
  handoffResult?: LocatorMaterializationHandoffResult;
  materializationRuntimeBindingResult?:
    LocatorMaterializationRuntimeBindingResult;
}>;
