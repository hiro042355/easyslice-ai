import type {
  AuthorityRuntimeFacade,
  AuthorityRuntimeFacadeDependencies,
  AuthorityRuntimeFacadeFailure,
  AuthorityRuntimeFacadeInput,
  AuthorityRuntimeFacadeResult,
} from "./authorityRuntimeFacadeTypes";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
  PrincipalAwareAuthorityRuntimeProviderInputFailure,
} from "../sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const rejected = (
  failure: AuthorityRuntimeFacadeFailure,
): AuthorityRuntimeFacadeResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const mapValidationFailure = (
  failure: PrincipalAwareAuthorityRuntimeProviderInputFailure,
): AuthorityRuntimeFacadeFailure => {
  switch (failure) {
    case "unsupported-provider-input-version":
      return "unsupported-provider-version";
    case "missing-source-reference":
      return "missing-source-reference";
    case "missing-resolution-context":
      return "missing-resolution-context";
    case "invalid-provider-input":
      return "invalid-provider-input";
    case "internal-failure":
      return "internal-failure";
  }
};

const copyProviderInput = (
  value: PrincipalAwareAuthorityRuntimeProviderInput,
): PrincipalAwareAuthorityRuntimeProviderInput => Object.freeze({
  ...value,
  sourceArtifactReference: Object.freeze({ ...value.sourceArtifactReference }),
  resolutionContext: Object.freeze({
    ...value.resolutionContext,
    sourceArtifact: Object.freeze({ ...value.resolutionContext.sourceArtifact }),
    principalIdentity: Object.freeze({ ...value.resolutionContext.principalIdentity }),
    tenantScope: Object.freeze({ ...value.resolutionContext.tenantScope }),
    ownershipScope: Object.freeze({ ...value.resolutionContext.ownershipScope }),
    workflowScope: Object.freeze({ ...value.resolutionContext.workflowScope }),
    authorizationEvidence: Object.freeze({
      ...value.resolutionContext.authorizationEvidence,
    }),
  }),
});

const copyAuthorityResult = (
  value: SourceArtifactAuthorityResolutionResult,
): SourceArtifactAuthorityResolutionResult => value.status === "authorized"
  ? Object.freeze({
    ...value,
    ownershipScope: Object.freeze({ ...value.ownershipScope }),
    authorizationEvidence: Object.freeze({ ...value.authorizationEvidence }),
  })
  : Object.freeze({ ...value });

const hasCapabilities = (
  dependencies: AuthorityRuntimeFacadeDependencies,
): boolean =>
  typeof dependencies?.provider?.evaluateSourceArtifact === "function" &&
  typeof dependencies?.validation?.validateProviderInput === "function";

export const createAuthorityRuntimeFacade = (
  dependencies: AuthorityRuntimeFacadeDependencies,
): AuthorityRuntimeFacade => Object.freeze({
  async evaluate(input: unknown): Promise<AuthorityRuntimeFacadeResult> {
    try {
      if (!hasCapabilities(dependencies)) return rejected("internal-failure");
      if (!isRecord(input)) return rejected("invalid-provider-input");
      if (input.providerVersion !== "2.0") {
        return rejected("unsupported-provider-version");
      }
      if (
        input.sourceArtifactReference === undefined ||
        input.sourceArtifactReference === null
      ) {
        return rejected("missing-source-reference");
      }
      if (input.resolutionContext === undefined || input.resolutionContext === null) {
        return rejected("missing-resolution-context");
      }
      if (input.facadeVersion !== "1.0") return rejected("invalid-provider-input");

      const facadeInput = input as unknown as AuthorityRuntimeFacadeInput;
      const providerInput: PrincipalAwareAuthorityRuntimeProviderInput = {
        contractVersion: facadeInput.providerVersion,
        sourceArtifactReference: facadeInput.sourceArtifactReference,
        resolutionContext: facadeInput.resolutionContext,
      };
      const validation = dependencies.validation.validateProviderInput(providerInput);
      if (validation.status === "rejected") {
        return rejected(mapValidationFailure(validation.failure));
      }

      const authorityResult = await dependencies.provider.evaluateSourceArtifact(
        copyProviderInput(validation.input),
      );
      return Object.freeze({
        resultVersion: "1.0",
        status: "evaluated",
        authorityResult: copyAuthorityResult(authorityResult),
      });
    } catch {
      return rejected("internal-failure");
    }
  },
});
