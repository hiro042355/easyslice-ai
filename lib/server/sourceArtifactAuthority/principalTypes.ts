import type {
  SourceArtifactAuthorizationEvidence,
  SourceArtifactAuthorityResolutionInput,
  SourceArtifactOwnershipScope,
} from "./types";

export type SourceArtifactPrincipalIdentity = Readonly<{
  identityVersion: "1.0";
  authorityNamespace: string;
  principalReference: string;
}>;

export type SourceArtifactTenantScope = Readonly<{
  scopeVersion: "1.0";
  tenantReference: string;
}>;

export type SourceArtifactWorkflowScope = Readonly<{
  scopeVersion: "1.0";
  workflowIdentity: string;
}>;

export type SourceArtifactPrincipalAuthorizationBinding = Readonly<{
  bindingVersion: "1.0";
  principalIdentity: SourceArtifactPrincipalIdentity;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
}>;

export type SourceArtifactPrincipalAwareResolutionContext = Readonly<{
  contextVersion: "2.0";
  sourceArtifact: SourceArtifactAuthorityResolutionInput["sourceArtifact"];
  requestIdentity: string;
  operationIdentity: string;
  principalIdentity: SourceArtifactPrincipalIdentity;
  tenantScope: SourceArtifactTenantScope;
  ownershipScope: SourceArtifactOwnershipScope;
  workflowScope: SourceArtifactWorkflowScope;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
}>;

export type SourceArtifactPrincipalValidationFailure =
  | "missing-principal"
  | "invalid-principal"
  | "unsupported-principal-version"
  | "invalid-authority-namespace"
  | "invalid-principal-reference"
  | "invalid-context"
  | "internal-failure";

export type SourceArtifactPrincipalContextValidationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "valid";
    context: SourceArtifactPrincipalAwareResolutionContext;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: SourceArtifactPrincipalValidationFailure;
  }>;

export type SourceArtifactPrincipalContextValidationCapability = Readonly<{
  validatePrincipalContext(
    input: unknown,
  ): SourceArtifactPrincipalContextValidationResult;
}>;
