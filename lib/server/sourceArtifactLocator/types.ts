import type {
  SourceArtifactAuthorizationEvidence,
  SourceArtifactOwnershipScope,
} from "../sourceArtifactAuthority/types";

export type SourceArtifactLocatorContractVersion = "1.0" | "2.0";

export type SourceArtifactLocatorV2ResolutionContext = Readonly<{
  contextVersion: "2.0";
  requestIdentity: string;
  operationIdentity: string;
  workflowIdentity: string;
  ownershipScope: SourceArtifactOwnershipScope;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
}>;

export type SourceArtifactLocatorV2Request = Readonly<{
  version: "2.0";
  opaqueReference: string;
  resolutionContext: SourceArtifactLocatorV2ResolutionContext;
}>;

export type SourceArtifactLocatorV2AuthorizedResult = Readonly<{
  resultVersion: "2.0";
  status: "authorized";
  opaqueResolutionReference: string;
}>;

export type SourceArtifactLocatorV2RejectedResult = Readonly<{
  resultVersion: "2.0";
  status: "rejected";
  classification: "authorization-denied" | "policy-rejected";
}>;

export type SourceArtifactLocatorV2FailureResult = Readonly<{
  resultVersion: "2.0";
  status:
    | "not-found"
    | "revoked"
    | "expired"
    | "ownership-mismatch"
    | "workflow-mismatch"
    | "invalid-reference"
    | "internal-failure";
}>;

export type SourceArtifactLocatorV2Result =
  | SourceArtifactLocatorV2AuthorizedResult
  | SourceArtifactLocatorV2RejectedResult
  | SourceArtifactLocatorV2FailureResult;

export type SourceArtifactLocatorV2Capability = Readonly<{
  locateSourceV2(
    request: SourceArtifactLocatorV2Request,
  ): SourceArtifactLocatorV2Result | Promise<SourceArtifactLocatorV2Result>;
}>;

export type SourceArtifactLocatorVersionNegotiationRequest = Readonly<{
  negotiationVersion: "1.0";
  requestedVersions: readonly SourceArtifactLocatorContractVersion[];
}>;

export type SourceArtifactLocatorVersionNegotiationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "selected";
    selectedVersion: SourceArtifactLocatorContractVersion;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "unsupported";
  }>;

export type SourceArtifactLocatorVersionNegotiationCapability = Readonly<{
  negotiateVersion(
    request: SourceArtifactLocatorVersionNegotiationRequest,
  ): SourceArtifactLocatorVersionNegotiationResult;
}>;
