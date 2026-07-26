import type {
  SourceArtifactPrincipalAuthorizationBinding,
  SourceArtifactPrincipalAwareResolutionContext,
} from "../sourceArtifactAuthority/principalTypes";
import type {
  SourceArtifactAuthorityResolutionInput,
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2ResolutionContext,
} from "../sourceArtifactLocator/types";

export type AuthorityLocatorResolutionAdapterInput = Readonly<{
  adapterVersion: "1.0";
  authorityResult: SourceArtifactAuthorityResolutionResult;
  authorityContext: SourceArtifactPrincipalAwareResolutionContext;
  principalAuthorizationBinding: SourceArtifactPrincipalAuthorizationBinding;
  locatorVersion: SourceArtifactLocatorV2Request["version"];
  locatorContext: SourceArtifactLocatorV2ResolutionContext;
  sourceArtifact: SourceArtifactAuthorityResolutionInput["sourceArtifact"];
  requestIdentity: string;
  operationIdentity: string;
}>;

export type AuthorityLocatorResolutionAdapterFailure =
  | "missing-authority-result"
  | "authority-denied"
  | "unsupported-authority-version"
  | "unsupported-locator-version"
  | "missing-principal"
  | "missing-workflow"
  | "missing-ownership"
  | "missing-tenant"
  | "missing-evidence"
  | "source-mismatch"
  | "request-mismatch"
  | "operation-mismatch"
  | "principal-mismatch"
  | "tenant-mismatch"
  | "ownership-mismatch"
  | "workflow-mismatch"
  | "evidence-mismatch"
  | "invalid-context"
  | "internal-failure";

export type AuthorityLocatorResolutionAdapterResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "adapted";
    locatorRequest: SourceArtifactLocatorV2Request;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: AuthorityLocatorResolutionAdapterFailure;
  }>;

export type AuthorityLocatorResolutionAdapter = Readonly<{
  adapt(input: unknown): AuthorityLocatorResolutionAdapterResult;
}>;
