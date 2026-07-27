import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
  SourceArtifactLocatorV2RuntimeProviderInputFailure,
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
  SourceArtifactLocatorV2RuntimeProviderInputValidationResult,
} from "./locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2ResolutionContext,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: SourceArtifactLocatorV2RuntimeProviderInputFailure,
): SourceArtifactLocatorV2RuntimeProviderInputValidationResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const hasResolutionContextShape = (
  value: unknown,
): value is SourceArtifactLocatorV2ResolutionContext => {
  if (!isRecord(value)) return false;

  const ownershipScope = value.ownershipScope;
  const authorizationEvidence = value.authorizationEvidence;

  return value.contextVersion === "2.0" &&
    isNonEmptyString(value.requestIdentity) &&
    isNonEmptyString(value.operationIdentity) &&
    isNonEmptyString(value.workflowIdentity) &&
    isRecord(ownershipScope) &&
    ownershipScope.scopeVersion === "1.0" &&
    isNonEmptyString(ownershipScope.sourceTenantReference) &&
    isNonEmptyString(ownershipScope.sourceOwnershipReference) &&
    isRecord(authorizationEvidence) &&
    authorizationEvidence.evidenceVersion === "1.0" &&
    isNonEmptyString(authorizationEvidence.authorityDecisionReference) &&
    isNonEmptyString(authorizationEvidence.decision);
};

const hasLocatorRequestShape = (
  value: unknown,
): value is SourceArtifactLocatorV2Request =>
  isRecord(value) &&
  value.version === "2.0" &&
  isNonEmptyString(value.opaqueReference) &&
  hasResolutionContextShape(value.resolutionContext);

export const copySourceArtifactLocatorV2RuntimeProviderInput = (
  input: SourceArtifactLocatorV2RuntimeProviderInput,
): SourceArtifactLocatorV2RuntimeProviderInput => Object.freeze({
  providerInputVersion: input.providerInputVersion,
  locatorRequest: Object.freeze({
    ...input.locatorRequest,
    resolutionContext: Object.freeze({
      ...input.locatorRequest.resolutionContext,
      ownershipScope: Object.freeze({
        ...input.locatorRequest.resolutionContext.ownershipScope,
      }),
      authorizationEvidence: Object.freeze({
        ...input.locatorRequest.resolutionContext.authorizationEvidence,
      }),
    }),
  }),
});

export const createSourceArtifactLocatorV2RuntimeProviderInputValidation =
  (): SourceArtifactLocatorV2RuntimeProviderInputValidationCapability =>
    Object.freeze({
      validateProviderInput(
        input: unknown,
      ): SourceArtifactLocatorV2RuntimeProviderInputValidationResult {
        try {
          if (!isRecord(input)) return rejected("invalid-provider-input");
          if (input.providerInputVersion !== "1.0") {
            return rejected("unsupported-provider-input-version");
          }
          if (input.locatorRequest === undefined || input.locatorRequest === null) {
            return rejected("missing-locator-request");
          }
          if (!isRecord(input.locatorRequest)) {
            return rejected("invalid-provider-input");
          }
          if (
            input.locatorRequest.opaqueReference === undefined ||
            input.locatorRequest.opaqueReference === null
          ) {
            return rejected("missing-source-reference");
          }
          if (
            input.locatorRequest.resolutionContext === undefined ||
            input.locatorRequest.resolutionContext === null
          ) {
            return rejected("missing-resolution-context");
          }
          if (!hasLocatorRequestShape(input.locatorRequest)) {
            return rejected("invalid-provider-input");
          }

          return Object.freeze({
            resultVersion: "1.0",
            status: "valid",
            input: copySourceArtifactLocatorV2RuntimeProviderInput(
              input as unknown as SourceArtifactLocatorV2RuntimeProviderInput,
            ),
          });
        } catch {
          return rejected("internal-failure");
        }
      },
    });
