import type {
  AuthorityLocatorRuntimeBindingInput,
  AuthorityLocatorRuntimeBindingResult,
} from "../authorityLocatorRuntimeBinding/types";
import type {
  InputMaterializationV2Request,
} from "../inputMaterialization/resolutionContextV2Types";
import type {
  InputMaterializationContext,
  InputMaterializationDecision,
} from "../inputMaterialization/types";
import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../locatorMaterializationRuntimeBinding/types";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";

const authorityFailedResult = (
): AuthorityLocatorRuntimeBindingResult => Object.freeze({
  resultVersion: "1.0",
  status: "failed",
  stage: "authority",
});

const authorityCompletedResult = (
): Extract<
  AuthorityLocatorRuntimeBindingResult,
  { status: "completed" }
> => Object.freeze({
  resultVersion: "1.0",
  status: "completed",
  authorityResult: Object.freeze({}) as never,
  adapterResult: Object.freeze({}) as never,
  locatorResult: Object.freeze({}) as never,
});

const materializationRequest = (): InputMaterializationV2Request =>
  Object.freeze({
    version: "2.0",
    materializationRequest: Object.freeze({
      requestVersion: "1.0",
      requestIdentity: "request:workflow-materialization",
      operationIdentity: "operation:workflow-materialization",
      sourceArtifact: Object.freeze({
        referenceVersion: "1.0",
        opaqueSourceArtifactReference: "source_workflow_materialization",
      }),
      workspace: Object.freeze({
        referenceVersion: "1.0",
        opaqueWorkspaceReference: "workspace_workflow_materialization",
      }),
      materializedArtifact: Object.freeze({
        referenceVersion: "1.0",
        opaqueMaterializedArtifactReference:
          "artifact_workflow_materialization",
      }),
      ownership: Object.freeze({
        projectionVersion: "1.0",
        authenticatedTenantReference: "tenant:1",
        requestTenantReference: "tenant:1",
        sourceTenantReference: "tenant:1",
        workspaceTenantReference: "tenant:1",
        authenticatedOwnershipReference: "owner:1",
        sourceOwnershipReference: "owner:1",
        workspaceOwnershipReference: "owner:1",
        operationOwnershipReference: "owner:1",
      }),
      policy: Object.freeze({
        policyVersion: "1.0",
        collisionPolicy: "reject-existing",
      }),
    }),
    sourceResolutionContext: Object.freeze({}) as never,
  });

const executionContext = (): InputMaterializationContext => Object.freeze({
  contextVersion: "1.0",
  executionWorkspaceReference: "workspace_workflow_materialization",
  executionOperationIdentity: "operation:workflow-materialization",
});

const decision = (): InputMaterializationDecision => Object.freeze({
  decisionVersion: "1.0",
  classification: "materialized",
  reasonCode: "materialization-completed",
  materializedArtifactAvailable: true,
  materializedArtifact: Object.freeze({
    referenceVersion: "1.0",
    opaqueMaterializedArtifactReference:
      "artifact_workflow_materialization",
  }),
  retryClassification: "retry-not-required",
  audit: Object.freeze({
    auditVersion: "1.0",
    entries: Object.freeze([
      Object.freeze({
        entryVersion: "1.0",
        sequence: 0,
        stage: "result-projection",
        classification: "materialized",
        reasonCode: "materialization-completed",
        retryClassification: "retry-not-required",
      }),
    ]),
  }),
});

export const createReferenceWorkflowMaterializationEntryInputFixture =
  (): WorkflowMaterializationEntryInput => {
    const authorityLocatorBindingInput =
      Object.freeze({
        bindingVersion: "1.0",
        authorityInput: Object.freeze({}) as never,
        adapterInput: Object.freeze({}) as never,
        locatorProviderVersion: "1.0",
      }) as AuthorityLocatorRuntimeBindingInput;

    return Object.freeze({
      workflowMaterializationEntryInputVersion: "1.0",
      authorityLocatorBindingInput,
      materializationRequest: materializationRequest(),
      materializationExecutionContext: executionContext(),
    });
  };

export const createReferenceAuthorityShortCircuitResultFixture =
  (): WorkflowMaterializationEntryResult => Object.freeze({
    workflowMaterializationEntryResultVersion: "1.0",
    authorityLocatorBindingResult: authorityFailedResult(),
  });

export const createReferenceHandoffNonReadyResultFixture =
  (): WorkflowMaterializationEntryResult => {
    const authorityLocatorBindingResult = authorityCompletedResult();
    const handoffResult:
      LocatorMaterializationHandoffResult = Object.freeze({
        resultVersion: "1.0",
        status: "rejected",
        failure: "binding-not-successful",
        authorityLocatorBindingResult,
      });

    return Object.freeze({
      workflowMaterializationEntryResultVersion: "1.0",
      authorityLocatorBindingResult,
      handoffResult,
    });
  };

export const createReferenceMaterializationExecutedResultFixture =
  (): WorkflowMaterializationEntryResult => {
    const authorityLocatorBindingResult = authorityCompletedResult();
    const handoffResult = Object.freeze({
      resultVersion: "1.0",
      status: "ready",
      authorityLocatorBindingResult,
      locatorResult: Object.freeze({}) as never,
      workflowMaterializationRequest: materializationRequest(),
      executionContext: executionContext(),
    }) satisfies LocatorMaterializationHandoffResult;
    const materializationRuntimeBindingResult =
      Object.freeze({
        resultVersion: "1.0",
        status: "completed",
        handoffResult,
        facadeResult: Object.freeze({
          resultVersion: "1.0",
          status: "completed",
          providerDecision: decision(),
        }),
      }) satisfies LocatorMaterializationRuntimeBindingResult;

    return Object.freeze({
      workflowMaterializationEntryResultVersion: "1.0",
      authorityLocatorBindingResult,
      handoffResult,
      materializationRuntimeBindingResult,
    });
  };
