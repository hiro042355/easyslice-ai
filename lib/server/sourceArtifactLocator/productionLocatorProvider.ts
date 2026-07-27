import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "./locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "./locatorV2RuntimeProviderTypes";
import {
  copySourceArtifactLocatorV2RuntimeProviderInput,
} from "./locatorV2RuntimeProviderValidation";
import type {
  ProductionLocatorProviderDependencies,
} from "./productionLocatorProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "./types";

const copyResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

const internalFailure = (): SourceArtifactLocatorV2Result => Object.freeze({
  resultVersion: "2.0",
  status: "internal-failure",
});

export const createProductionLocatorProvider = (
  dependencies: ProductionLocatorProviderDependencies,
): SourceArtifactLocatorV2RuntimeProviderCapability => Object.freeze({
  async locateSourceArtifact(
    input: SourceArtifactLocatorV2RuntimeProviderInput,
  ): Promise<SourceArtifactLocatorV2Result> {
    try {
      if (typeof dependencies?.strategy?.locate !== "function") {
        return internalFailure();
      }
      const result = await dependencies.strategy.locate(
        copySourceArtifactLocatorV2RuntimeProviderInput(input),
      );
      return copyResult(result);
    } catch {
      return internalFailure();
    }
  },
});
