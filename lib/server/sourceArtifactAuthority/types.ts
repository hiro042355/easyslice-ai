import type { SourceArtifactReference } from "../inputMaterialization/types";

export type SourceArtifactAuthorityContractVersion = "1.0";

export type SourceArtifactOwnershipScope = Readonly<{
  scopeVersion: "1.0";
  sourceTenantReference: string;
  sourceOwnershipReference: string;
}>;

export type SourceArtifactAuthorizationEvidence = Readonly<{
  evidenceVersion: "1.0";
  authorityDecisionReference: string;
  decision: "authorized";
}>;

export type SourceArtifactResolutionContext = Readonly<{
  contextVersion: "1.0";
  requestIdentity: string;
  operationIdentity: string;
  ownershipScope: SourceArtifactOwnershipScope;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
}>;

export type SourceArtifactAuthorityResolutionInput = Readonly<{
  inputVersion: "1.0";
  sourceArtifact: SourceArtifactReference;
  context: SourceArtifactResolutionContext;
}>;

export type SourceArtifactAuthorityFailureClassification =
  | "invalid-context"
  | "unauthorized"
  | "revoked"
  | "stale"
  | "deleted"
  | "missing"
  | "conflict"
  | "unavailable";

export type SourceArtifactAuthorityAuthorizedResult = Readonly<{
  resultVersion: "1.0";
  status: "authorized";
  opaqueAuthorityRecordReference: string;
  opaqueResolutionReference: string;
  ownershipScope: SourceArtifactOwnershipScope;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
}>;

export type SourceArtifactAuthorityRejectedResult = Readonly<{
  resultVersion: "1.0";
  status: "rejected";
  classification: SourceArtifactAuthorityFailureClassification;
}>;

export type SourceArtifactAuthorityResolutionResult =
  | SourceArtifactAuthorityAuthorizedResult
  | SourceArtifactAuthorityRejectedResult;

export type SourceArtifactAuthorityCapability = Readonly<{
  resolveSourceArtifact(
    input: SourceArtifactAuthorityResolutionInput,
  ): SourceArtifactAuthorityResolutionResult | Promise<SourceArtifactAuthorityResolutionResult>;
}>;
