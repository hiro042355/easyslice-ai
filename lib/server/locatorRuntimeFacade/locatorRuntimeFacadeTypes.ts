import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Capability,
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2ResolutionContext,
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";

export type LocatorRuntimeFacadeInput = Readonly<{
  providerVersion: SourceArtifactLocatorV2RuntimeProviderInput["providerInputVersion"];
  locatorRequest: SourceArtifactLocatorV2Request;
}>;

export type LocatorRuntimeFacadeFailure =
  | "unsupported-provider-version"
  | "invalid-provider-input"
  | "missing-locator-request"
  | "missing-source-reference"
  | "missing-resolution-context"
  | "internal-failure";

export type LocatorRuntimeFacadeResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "located";
    locatorResult: SourceArtifactLocatorV2Result;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: LocatorRuntimeFacadeFailure;
  }>;

export type LocatorRuntimeFacadeDependencies = Readonly<{
  provider: SourceArtifactLocatorV2RuntimeProviderCapability;
  validation: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability;
}>;

export type LocatorRuntimeFacade = Readonly<{
  invoke(input: unknown): Promise<LocatorRuntimeFacadeResult>;
}>;

export type LocatorRuntimeFacadeCompatibility = Readonly<{
  locatorCapability: SourceArtifactLocatorV2Capability;
  resolutionContext: SourceArtifactLocatorV2ResolutionContext;
}>;
