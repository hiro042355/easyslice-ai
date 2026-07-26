import type {
  InputMaterializationV2ProjectionFailure,
  InputMaterializationV2Request,
} from "../inputMaterialization/resolutionContextV2Types";
import type { InputMaterializationRequest } from "../inputMaterialization/types";
import type { SourceArtifactPrincipalAwareResolutionContext } from "../sourceArtifactAuthority/principalTypes";
import type { SourceArtifactLocatorV2ResolutionContext } from "../sourceArtifactLocator/types";
import type { WorkflowEntryInputEnvelope } from "../workflowEntry/types";

export type WorkflowEntryTrustedMaterializationContext =
  Omit<SourceArtifactPrincipalAwareResolutionContext, "workflowScope">;

export type WorkflowEntryTrustedContextAdapterInput = Readonly<{
  adapterVersion: "1.0";
  workflowEntry: WorkflowEntryInputEnvelope<InputMaterializationRequest>;
  trustedContext: WorkflowEntryTrustedMaterializationContext;
}>;

export type WorkflowEntryTrustedContextAdapterFailure =
  InputMaterializationV2ProjectionFailure;

export type WorkflowEntryTrustedContextAdapterResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "adapted";
    materializationRequest: InputMaterializationV2Request;
    locatorWorkflowIdentity: SourceArtifactLocatorV2ResolutionContext["workflowIdentity"];
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: WorkflowEntryTrustedContextAdapterFailure;
  }>;

export type WorkflowEntryTrustedContextAdapter = Readonly<{
  adapt(input: unknown): WorkflowEntryTrustedContextAdapterResult;
}>;
