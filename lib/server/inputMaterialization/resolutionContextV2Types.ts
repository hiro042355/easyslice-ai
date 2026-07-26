import type {
  SourceArtifactPrincipalAwareResolutionContext,
} from "../sourceArtifactAuthority/principalTypes";
import type { SourceArtifactLocatorV2ResolutionContext } from "../sourceArtifactLocator/types";
import type { InputMaterializationRequest } from "./types";

export type InputMaterializationV2ExplicitResolutionContext =
  SourceArtifactPrincipalAwareResolutionContext;

export type InputMaterializationV2Request = Readonly<{
  version: "2.0";
  materializationRequest: InputMaterializationRequest;
  sourceResolutionContext: InputMaterializationV2ExplicitResolutionContext;
}>;

export type InputMaterializationV2ProjectionFailure =
  | "missing-principal"
  | "missing-workflow"
  | "missing-ownership"
  | "missing-tenant"
  | "missing-evidence"
  | "invalid-context"
  | "unsupported-version"
  | "internal-failure";

export type InputMaterializationV2ProjectionResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "projected";
    resolutionContext: SourceArtifactLocatorV2ResolutionContext;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: InputMaterializationV2ProjectionFailure;
  }>;

export type InputMaterializationV2ResolutionContextProjector = Readonly<{
  projectResolutionContext(
    input: unknown,
  ): InputMaterializationV2ProjectionResult;
}>;
