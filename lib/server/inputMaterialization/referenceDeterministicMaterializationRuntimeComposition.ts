import type {
  InputMaterializationDecision,
} from "./types";
import {
  createMaterializationRuntimeComposition,
} from "./materializationRuntimeComposition";
import type {
  MaterializationRuntimeComposition,
} from "./materializationRuntimeCompositionTypes";
import {
  createProductionMaterializationProviderComposition,
} from "./productionMaterializationProviderComposition";
import {
  createDeterministicProductionMaterializationStrategyFixture,
} from "./referenceDeterministicProductionMaterializationStrategy";
import type {
  DeterministicProductionMaterializationStrategyFixture,
  DeterministicProductionMaterializationStrategyOptions,
} from "./referenceDeterministicProductionMaterializationStrategy";
import {
  createMaterializationRuntimeProviderInputValidation,
} from "./materializationRuntimeProviderValidation";

export type DeterministicMaterializationRuntimeCompositionFixture = Readonly<{
  composition: MaterializationRuntimeComposition;
  strategyFixture: DeterministicProductionMaterializationStrategyFixture;
}>;

export const createDeterministicMaterializationRuntimeCompositionFixture = (
  decision: InputMaterializationDecision,
  options: DeterministicProductionMaterializationStrategyOptions = {},
): DeterministicMaterializationRuntimeCompositionFixture => {
  const strategyFixture =
    createDeterministicProductionMaterializationStrategyFixture(
      decision,
      options,
    );
  const providerComposition =
    createProductionMaterializationProviderComposition(
      strategyFixture.strategy,
    );

  return Object.freeze({
    composition: createMaterializationRuntimeComposition({
      providerComposition,
      validation: createMaterializationRuntimeProviderInputValidation(),
    }),
    strategyFixture,
  });
};
