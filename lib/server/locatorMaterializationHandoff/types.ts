import type {
  AuthorityLocatorRuntimeBindingResult,
} from "../authorityLocatorRuntimeBinding/types";
import type {
  InputMaterializationV2Request,
} from "../inputMaterialization/resolutionContextV2Types";
import type {
  InputMaterializationContext,
} from "../inputMaterialization/types";
import type {
  SourceArtifactLocatorV2AuthorizedResult,
} from "../sourceArtifactLocator/types";

export type SuccessfulAuthorityLocatorRuntimeBindingResult = Extract<
  AuthorityLocatorRuntimeBindingResult,
  { status: "completed" }
>;

export type LocatorMaterializationHandoffInput = Readonly<{
  handoffVersion: "1.0";
  authorityLocatorBindingResult: AuthorityLocatorRuntimeBindingResult;
  workflowMaterializationRequest: InputMaterializationV2Request;
  executionContext: InputMaterializationContext;
}>;

export type LocatorMaterializationHandoffFailure =
  | "unsupported-handoff-version"
  | "invalid-handoff-input"
  | "missing-binding-result"
  | "binding-not-successful"
  | "missing-locator-result"
  | "locator-not-authorized"
  | "missing-materialization-request"
  | "missing-execution-context"
  | "identity-mismatch"
  | "internal-failure";

export type LocatorMaterializationHandoffValidationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "valid";
    input: LocatorMaterializationHandoffInput;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: LocatorMaterializationHandoffFailure;
    authorityLocatorBindingResult?: AuthorityLocatorRuntimeBindingResult;
  }>;

export type LocatorMaterializationHandoffValidationCapability = Readonly<{
  validate(
    input: unknown,
  ): LocatorMaterializationHandoffValidationResult;
}>;

export type LocatorMaterializationHandoffResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "ready";
    authorityLocatorBindingResult:
      SuccessfulAuthorityLocatorRuntimeBindingResult;
    locatorResult: SourceArtifactLocatorV2AuthorizedResult;
    workflowMaterializationRequest: InputMaterializationV2Request;
    executionContext: InputMaterializationContext;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: LocatorMaterializationHandoffFailure;
    authorityLocatorBindingResult?: AuthorityLocatorRuntimeBindingResult;
  }>;

export type LocatorMaterializationHandoff = Readonly<{
  prepare(input: unknown): LocatorMaterializationHandoffResult;
}>;
