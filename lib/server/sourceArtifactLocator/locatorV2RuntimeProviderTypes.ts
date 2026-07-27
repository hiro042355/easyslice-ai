import type {
  SourceArtifactLocatorV2Request,
} from "./types";

export type SourceArtifactLocatorV2RuntimeProviderInput = Readonly<{
  providerInputVersion: "1.0";
  locatorRequest: SourceArtifactLocatorV2Request;
}>;

export type SourceArtifactLocatorV2RuntimeProviderInputFailure =
  | "unsupported-provider-input-version"
  | "invalid-provider-input"
  | "missing-locator-request"
  | "missing-source-reference"
  | "missing-resolution-context"
  | "internal-failure";

export type SourceArtifactLocatorV2RuntimeProviderInputValidationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "valid";
    input: SourceArtifactLocatorV2RuntimeProviderInput;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: SourceArtifactLocatorV2RuntimeProviderInputFailure;
  }>;

export type SourceArtifactLocatorV2RuntimeProviderInputValidationCapability =
  Readonly<{
    validateProviderInput(
      input: unknown,
    ): SourceArtifactLocatorV2RuntimeProviderInputValidationResult;
  }>;
