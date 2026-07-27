import type {
  SourceArtifactLocatorV2AuthorizedResult,
} from "../sourceArtifactLocator/types";
import type {
  LocatorMaterializationHandoff,
  LocatorMaterializationHandoffResult,
  LocatorMaterializationHandoffValidationCapability,
  SuccessfulAuthorityLocatorRuntimeBindingResult,
} from "./types";

export const createLocatorMaterializationHandoff = (
  validation: LocatorMaterializationHandoffValidationCapability,
): LocatorMaterializationHandoff => Object.freeze({
  prepare(input: unknown): LocatorMaterializationHandoffResult {
    try {
      const result = validation.validate(input);
      if (result.status === "rejected") {
        return Object.freeze({
          resultVersion: "1.0",
          status: "rejected",
          failure: result.failure,
          ...(result.authorityLocatorBindingResult
            ? {
              authorityLocatorBindingResult:
                result.authorityLocatorBindingResult,
            }
            : {}),
        });
      }

      const validInput = result.input;
      return Object.freeze({
        resultVersion: "1.0",
        status: "ready",
        authorityLocatorBindingResult:
          validInput.authorityLocatorBindingResult as
            SuccessfulAuthorityLocatorRuntimeBindingResult,
        locatorResult:
          validInput.authorityLocatorBindingResult.locatorResult as
            SourceArtifactLocatorV2AuthorizedResult,
        workflowMaterializationRequest:
          validInput.workflowMaterializationRequest,
        executionContext: validInput.executionContext,
      });
    } catch {
      return Object.freeze({
        resultVersion: "1.0",
        status: "rejected",
        failure: "internal-failure",
      });
    }
  },
});
