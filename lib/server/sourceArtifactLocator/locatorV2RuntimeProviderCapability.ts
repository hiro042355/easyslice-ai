import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "./locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "./types";

export type SourceArtifactLocatorV2RuntimeProviderCapability = Readonly<{
  locateSourceArtifact(
    input: SourceArtifactLocatorV2RuntimeProviderInput,
  ): SourceArtifactLocatorV2Result | Promise<SourceArtifactLocatorV2Result>;
}>;
