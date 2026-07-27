import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "./locatorV2RuntimeProviderTypes";
import {
  copySourceArtifactLocatorV2RuntimeProviderInput,
} from "./locatorV2RuntimeProviderValidation";
import type {
  ProductionLocatorStrategyCapability,
} from "./productionLocatorProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "./types";

export type DeterministicProductionLocatorFixture = Readonly<{
  strategy: ProductionLocatorStrategyCapability;
  invocations(): readonly SourceArtifactLocatorV2RuntimeProviderInput[];
}>;

const copyResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

export const createDeterministicProductionLocatorFixture = (
  fixedResult: SourceArtifactLocatorV2Result,
): DeterministicProductionLocatorFixture => {
  const result = copyResult(fixedResult);
  const captured: SourceArtifactLocatorV2RuntimeProviderInput[] = [];

  return Object.freeze({
    strategy: Object.freeze({
      locate(
        input: SourceArtifactLocatorV2RuntimeProviderInput,
      ): SourceArtifactLocatorV2Result {
        captured.push(copySourceArtifactLocatorV2RuntimeProviderInput(input));
        return copyResult(result);
      },
    }),
    invocations(): readonly SourceArtifactLocatorV2RuntimeProviderInput[] {
      return Object.freeze(
        captured.map(copySourceArtifactLocatorV2RuntimeProviderInput),
      );
    },
  });
};
