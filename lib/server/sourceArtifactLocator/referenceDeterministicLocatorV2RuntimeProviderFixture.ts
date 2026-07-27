import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "./locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
} from "./locatorV2RuntimeProviderTypes";
import {
  copySourceArtifactLocatorV2RuntimeProviderInput,
  createSourceArtifactLocatorV2RuntimeProviderInputValidation,
} from "./locatorV2RuntimeProviderValidation";
import type {
  SourceArtifactLocatorV2Result,
} from "./types";

export type DeterministicLocatorV2RuntimeProviderFixtureOptions = Readonly<{
  throwOnInvocation?: boolean;
}>;

export type DeterministicLocatorV2RuntimeProviderFixture = Readonly<{
  provider: SourceArtifactLocatorV2RuntimeProviderCapability;
  validation: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability;
  invocations(): readonly SourceArtifactLocatorV2RuntimeProviderInput[];
}>;

const copyResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

export const createDeterministicLocatorV2RuntimeProviderFixture = (
  fixedResult: SourceArtifactLocatorV2Result,
  options: DeterministicLocatorV2RuntimeProviderFixtureOptions = {},
): DeterministicLocatorV2RuntimeProviderFixture => {
  const result = copyResult(fixedResult);
  const captured: SourceArtifactLocatorV2RuntimeProviderInput[] = [];

  return Object.freeze({
    validation: createSourceArtifactLocatorV2RuntimeProviderInputValidation(),
    provider: Object.freeze({
      locateSourceArtifact(
        input: SourceArtifactLocatorV2RuntimeProviderInput,
      ): SourceArtifactLocatorV2Result {
        captured.push(copySourceArtifactLocatorV2RuntimeProviderInput(input));
        if (options.throwOnInvocation === true) {
          throw new Error("deterministic locator provider failure");
        }
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
