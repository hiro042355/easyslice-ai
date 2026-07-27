import {
  createDeterministicLocatorV2RuntimeProviderFixture,
} from "../sourceArtifactLocator/referenceDeterministicLocatorV2RuntimeProviderFixture";
import type {
  DeterministicLocatorV2RuntimeProviderFixtureOptions,
} from "../sourceArtifactLocator/referenceDeterministicLocatorV2RuntimeProviderFixture";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import {
  createLocatorRuntimeFacade,
} from "./locatorRuntimeFacade";
import type {
  LocatorRuntimeFacade,
} from "./locatorRuntimeFacadeTypes";

export type DeterministicLocatorRuntimeFacadeStub = Readonly<{
  facade: LocatorRuntimeFacade;
  invocations(): readonly SourceArtifactLocatorV2RuntimeProviderInput[];
}>;

export const createDeterministicLocatorRuntimeFacadeStub = (
  fixedResult: SourceArtifactLocatorV2Result,
  options: DeterministicLocatorV2RuntimeProviderFixtureOptions = {},
): DeterministicLocatorRuntimeFacadeStub => {
  const fixture = createDeterministicLocatorV2RuntimeProviderFixture(
    fixedResult,
    options,
  );

  return Object.freeze({
    facade: createLocatorRuntimeFacade({
      provider: fixture.provider,
      validation: fixture.validation,
    }),
    invocations: fixture.invocations,
  });
};
