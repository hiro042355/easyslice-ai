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
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import type {
  LocatorMaterializationHandoffFailure,
  LocatorMaterializationHandoffInput,
  LocatorMaterializationHandoffValidationCapability,
  LocatorMaterializationHandoffValidationResult,
  SuccessfulAuthorityLocatorRuntimeBindingResult,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const copyAuthorityResult = (
  result: SourceArtifactAuthorityResolutionResult,
): SourceArtifactAuthorityResolutionResult => result.status === "authorized"
  ? Object.freeze({
    ...result,
    ownershipScope: Object.freeze({ ...result.ownershipScope }),
    authorizationEvidence: Object.freeze({ ...result.authorizationEvidence }),
  })
  : Object.freeze({ ...result });

const copyLocatorResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

const copyBindingResult = (
  result: AuthorityLocatorRuntimeBindingResult,
): AuthorityLocatorRuntimeBindingResult => result.status === "completed"
  ? Object.freeze({
    ...result,
    authorityResult: copyAuthorityResult(result.authorityResult),
    adapterResult: result.adapterResult.status === "adapted"
      ? Object.freeze({
        ...result.adapterResult,
        locatorRequest: Object.freeze({
          ...result.adapterResult.locatorRequest,
          resolutionContext: Object.freeze({
            ...result.adapterResult.locatorRequest.resolutionContext,
            ownershipScope: Object.freeze({
              ...result.adapterResult.locatorRequest.resolutionContext.ownershipScope,
            }),
            authorizationEvidence: Object.freeze({
              ...result.adapterResult.locatorRequest.resolutionContext
                .authorizationEvidence,
            }),
          }),
        }),
      })
      : Object.freeze({ ...result.adapterResult }),
    locatorResult: copyLocatorResult(result.locatorResult),
  })
  : Object.freeze({ ...result });

const copyMaterializationRequest = (
  input: InputMaterializationV2Request,
): InputMaterializationV2Request => Object.freeze({
  version: input.version,
  materializationRequest: Object.freeze({
    ...input.materializationRequest,
    sourceArtifact: Object.freeze({ ...input.materializationRequest.sourceArtifact }),
    workspace: Object.freeze({ ...input.materializationRequest.workspace }),
    materializedArtifact: Object.freeze({
      ...input.materializationRequest.materializedArtifact,
    }),
    ownership: Object.freeze({ ...input.materializationRequest.ownership }),
    policy: Object.freeze({ ...input.materializationRequest.policy }),
  }),
  sourceResolutionContext: Object.freeze({
    ...input.sourceResolutionContext,
    sourceArtifact: Object.freeze({ ...input.sourceResolutionContext.sourceArtifact }),
    principalIdentity: Object.freeze({
      ...input.sourceResolutionContext.principalIdentity,
    }),
    tenantScope: Object.freeze({ ...input.sourceResolutionContext.tenantScope }),
    ownershipScope: Object.freeze({
      ...input.sourceResolutionContext.ownershipScope,
    }),
    workflowScope: Object.freeze({ ...input.sourceResolutionContext.workflowScope }),
    authorizationEvidence: Object.freeze({
      ...input.sourceResolutionContext.authorizationEvidence,
    }),
  }),
});

const copyExecutionContext = (
  input: InputMaterializationContext,
): InputMaterializationContext => Object.freeze({ ...input });

export const copyLocatorMaterializationHandoffInput = (
  input: LocatorMaterializationHandoffInput,
): LocatorMaterializationHandoffInput => Object.freeze({
  handoffVersion: input.handoffVersion,
  authorityLocatorBindingResult: copyBindingResult(
    input.authorityLocatorBindingResult,
  ),
  workflowMaterializationRequest: copyMaterializationRequest(
    input.workflowMaterializationRequest,
  ),
  executionContext: copyExecutionContext(input.executionContext),
});

const rejected = (
  failure: LocatorMaterializationHandoffFailure,
  bindingResult?: AuthorityLocatorRuntimeBindingResult,
): LocatorMaterializationHandoffValidationResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
  ...(bindingResult
    ? { authorityLocatorBindingResult: copyBindingResult(bindingResult) }
    : {}),
});

const identitiesAgree = (
  binding: SuccessfulAuthorityLocatorRuntimeBindingResult,
  request: InputMaterializationV2Request,
  context: InputMaterializationContext,
): boolean => {
  if (binding.adapterResult.status !== "adapted") return false;
  const materialization = request.materializationRequest;
  const resolution = request.sourceResolutionContext;
  const locatorRequest = binding.adapterResult.locatorRequest;

  return materialization.requestIdentity === resolution.requestIdentity &&
    materialization.operationIdentity === resolution.operationIdentity &&
    materialization.operationIdentity === context.executionOperationIdentity &&
    materialization.workspace.opaqueWorkspaceReference ===
      context.executionWorkspaceReference &&
    materialization.sourceArtifact.opaqueSourceArtifactReference ===
      resolution.sourceArtifact.opaqueSourceArtifactReference &&
    materialization.sourceArtifact.opaqueSourceArtifactReference ===
      locatorRequest.opaqueReference &&
    resolution.requestIdentity ===
      locatorRequest.resolutionContext.requestIdentity &&
    resolution.operationIdentity ===
      locatorRequest.resolutionContext.operationIdentity &&
    resolution.workflowScope.workflowIdentity ===
      locatorRequest.resolutionContext.workflowIdentity;
};

export const createLocatorMaterializationHandoffValidation =
  (): LocatorMaterializationHandoffValidationCapability => Object.freeze({
    validate(input: unknown): LocatorMaterializationHandoffValidationResult {
      try {
        if (!isRecord(input)) return rejected("invalid-handoff-input");
        if (input.handoffVersion !== "1.0") {
          return rejected("unsupported-handoff-version");
        }
        if (
          input.authorityLocatorBindingResult === undefined ||
          input.authorityLocatorBindingResult === null
        ) return rejected("missing-binding-result");
        if (!isRecord(input.authorityLocatorBindingResult)) {
          return rejected("invalid-handoff-input");
        }
        const binding = input.authorityLocatorBindingResult as unknown as
          AuthorityLocatorRuntimeBindingResult;
        if (binding.status !== "completed") {
          return rejected("binding-not-successful", binding);
        }
        if (binding.locatorResult === undefined || binding.locatorResult === null) {
          return rejected("missing-locator-result", binding);
        }
        if (
          !isRecord(binding.locatorResult) ||
          binding.locatorResult.resultVersion !== "2.0"
        ) return rejected("invalid-handoff-input", binding);
        if (binding.locatorResult.status !== "authorized") {
          return rejected("locator-not-authorized", binding);
        }
        if (
          input.workflowMaterializationRequest === undefined ||
          input.workflowMaterializationRequest === null
        ) return rejected("missing-materialization-request", binding);
        if (
          input.executionContext === undefined ||
          input.executionContext === null
        ) return rejected("missing-execution-context", binding);
        if (
          !isRecord(input.workflowMaterializationRequest) ||
          !isRecord(input.executionContext)
        ) return rejected("invalid-handoff-input", binding);

        const request = input.workflowMaterializationRequest;
        const context = input.executionContext;
        if (
          request.version !== "2.0" ||
          !isRecord(request.materializationRequest) ||
          !isRecord(request.sourceResolutionContext) ||
          context.contextVersion !== "1.0" ||
          !isNonEmpty(context.executionWorkspaceReference) ||
          !isNonEmpty(context.executionOperationIdentity)
        ) return rejected("invalid-handoff-input", binding);

        const typedRequest = request as unknown as InputMaterializationV2Request;
        const typedContext = context as unknown as InputMaterializationContext;
        if (!identitiesAgree(binding, typedRequest, typedContext)) {
          return rejected("identity-mismatch", binding);
        }

        return Object.freeze({
          resultVersion: "1.0",
          status: "valid",
          input: copyLocatorMaterializationHandoffInput(
            input as unknown as LocatorMaterializationHandoffInput,
          ),
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
