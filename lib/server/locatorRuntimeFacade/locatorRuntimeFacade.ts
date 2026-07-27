import type {
  SourceArtifactLocatorV2RuntimeProviderInputFailure,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import type {
  LocatorRuntimeFacade,
  LocatorRuntimeFacadeDependencies,
  LocatorRuntimeFacadeFailure,
  LocatorRuntimeFacadeInput,
  LocatorRuntimeFacadeResult,
} from "./locatorRuntimeFacadeTypes";

const rejected = (
  failure: LocatorRuntimeFacadeFailure,
): LocatorRuntimeFacadeResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const mapValidationFailure = (
  failure: SourceArtifactLocatorV2RuntimeProviderInputFailure,
): LocatorRuntimeFacadeFailure =>
  failure === "unsupported-provider-input-version"
    ? "unsupported-provider-version"
    : failure;

const copyLocatorResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

export const createLocatorRuntimeFacade = (
  dependencies: LocatorRuntimeFacadeDependencies,
): LocatorRuntimeFacade => Object.freeze({
  async invoke(input: unknown): Promise<LocatorRuntimeFacadeResult> {
    try {
      const candidate = input as LocatorRuntimeFacadeInput;
      const validation = dependencies.validation.validateProviderInput({
        providerInputVersion: candidate?.providerVersion,
        locatorRequest: candidate?.locatorRequest,
      });

      if (validation.status === "rejected") {
        return rejected(mapValidationFailure(validation.failure));
      }

      const locatorResult = await dependencies.provider.locateSourceArtifact(
        validation.input,
      );

      return Object.freeze({
        resultVersion: "1.0",
        status: "located",
        locatorResult: copyLocatorResult(locatorResult),
      });
    } catch {
      return rejected("internal-failure");
    }
  },
});
