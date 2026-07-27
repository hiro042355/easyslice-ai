import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "./locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
} from "./locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "./types";

export type ProductionLocatorStrategyCapability = Readonly<{
  locate(
    input: SourceArtifactLocatorV2RuntimeProviderInput,
  ): SourceArtifactLocatorV2Result | Promise<SourceArtifactLocatorV2Result>;
}>;

export type ProductionLocatorProviderDependencies = Readonly<{
  strategy: ProductionLocatorStrategyCapability;
}>;

export type ProductionLocatorProviderCompositionDependencies = Readonly<{
  strategy: ProductionLocatorStrategyCapability;
  validation: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability;
}>;

export type ProductionLocatorProviderComposition = Readonly<{
  provider: SourceArtifactLocatorV2RuntimeProviderCapability;
  validation: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability;
}>;
