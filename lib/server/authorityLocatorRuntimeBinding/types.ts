import type {
  AuthorityLocatorResolutionAdapter,
  AuthorityLocatorResolutionAdapterInput,
  AuthorityLocatorResolutionAdapterResult,
} from "../authorityLocatorResolution/authorityLocatorAdapterTypes";
import type {
  AuthorityLocatorRuntimeComposition,
} from "../authorityLocatorRuntimeComposition/types";
import type {
  AuthorityRuntimeFacadeInput,
  AuthorityRuntimeFacadeResult,
} from "../authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  LocatorRuntimeFacadeInput,
  LocatorRuntimeFacadeResult,
} from "../locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";

export type AuthorityLocatorRuntimeBindingInput = Readonly<{
  bindingVersion: "1.0";
  authorityInput: AuthorityRuntimeFacadeInput;
  adapterInput: Omit<AuthorityLocatorResolutionAdapterInput, "authorityResult">;
  locatorProviderVersion: LocatorRuntimeFacadeInput["providerVersion"];
}>;

export type AuthorityLocatorRuntimeBindingFailureStage =
  | "input"
  | "authority"
  | "adapter"
  | "locator"
  | "internal";

export type AuthorityLocatorRuntimeBindingResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "completed";
    authorityResult: SourceArtifactAuthorityResolutionResult;
    adapterResult: AuthorityLocatorResolutionAdapterResult;
    locatorResult: SourceArtifactLocatorV2Result;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "failed";
    stage: AuthorityLocatorRuntimeBindingFailureStage;
    authorityFacadeResult?: AuthorityRuntimeFacadeResult;
    authorityResult?: SourceArtifactAuthorityResolutionResult;
    adapterResult?: AuthorityLocatorResolutionAdapterResult;
    locatorFacadeResult?: LocatorRuntimeFacadeResult;
    locatorResult?: SourceArtifactLocatorV2Result;
  }>;

export type AuthorityLocatorRuntimeBindingDependencies = Readonly<{
  composition: AuthorityLocatorRuntimeComposition;
  adapter: AuthorityLocatorResolutionAdapter;
}>;

export type AuthorityLocatorRuntimeBinding = Readonly<{
  execute(input: unknown): Promise<AuthorityLocatorRuntimeBindingResult>;
}>;
