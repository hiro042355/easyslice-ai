import type {
  SourceArtifactAuthorityResolutionInput,
} from "../sourceArtifactAuthority/types";

export type MultiCutSourceArtifactHandoffVersion = "1.0";

export type MultiCutSourceArtifactHandoff = Readonly<{
  handoffVersion: MultiCutSourceArtifactHandoffVersion;
  authorityInput: SourceArtifactAuthorityResolutionInput;
}>;
