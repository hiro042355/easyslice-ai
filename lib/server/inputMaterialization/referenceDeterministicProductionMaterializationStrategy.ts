import {
  copyInputMaterializationDecision,
} from "./productionMaterializationProvider";
import type {
  ProductionMaterializationStrategyCapability,
} from "./productionMaterializationProviderTypes";
import type {
  MaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderTypes";
import {
  copyMaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderValidation";
import type {
  InputMaterializationDecision,
} from "./types";

export type DeterministicProductionMaterializationStrategyOptions =
  Readonly<{
    throwOnInvocation?: boolean;
  }>;

export type DeterministicProductionMaterializationStrategyFixture = Readonly<{
  strategy: ProductionMaterializationStrategyCapability;
  invocations(): readonly MaterializationRuntimeProviderInput[];
}>;

export const createDeterministicProductionMaterializationStrategyFixture = (
  fixedDecision: InputMaterializationDecision,
  options: DeterministicProductionMaterializationStrategyOptions = {},
): DeterministicProductionMaterializationStrategyFixture => {
  const decision = copyInputMaterializationDecision(fixedDecision);
  const captured: MaterializationRuntimeProviderInput[] = [];

  return Object.freeze({
    strategy: Object.freeze({
      materialize(
        input: MaterializationRuntimeProviderInput,
      ): InputMaterializationDecision {
        captured.push(copyMaterializationRuntimeProviderInput(input));
        if (options.throwOnInvocation === true) {
          throw new Error("deterministic production materialization strategy failure");
        }
        return copyInputMaterializationDecision(decision);
      },
    }),
    invocations(): readonly MaterializationRuntimeProviderInput[] {
      return Object.freeze(
        captured.map(copyMaterializationRuntimeProviderInput),
      );
    },
  });
};
