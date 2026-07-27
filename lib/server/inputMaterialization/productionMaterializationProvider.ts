import type {
  MaterializationRuntimeProviderCapability,
} from "./materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderTypes";
import {
  copyMaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderValidation";
import type {
  ProductionMaterializationProviderDependencies,
} from "./productionMaterializationProviderTypes";
import type {
  InputMaterializationDecision,
} from "./types";

export const copyInputMaterializationDecision = (
  decision: InputMaterializationDecision,
): InputMaterializationDecision => Object.freeze({
  ...decision,
  ...(decision.materializedArtifact
    ? {
      materializedArtifact: Object.freeze({
        ...decision.materializedArtifact,
      }),
    }
    : {}),
  audit: Object.freeze({
    ...decision.audit,
    entries: Object.freeze(
      decision.audit.entries.map((entry) => Object.freeze({ ...entry })),
    ),
  }),
});

export const createProductionMaterializationProvider = (
  dependencies: ProductionMaterializationProviderDependencies,
): MaterializationRuntimeProviderCapability => Object.freeze({
  async materialize(
    input: MaterializationRuntimeProviderInput,
  ): Promise<InputMaterializationDecision> {
    const decision = await dependencies.strategy.materialize(
      copyMaterializationRuntimeProviderInput(input),
    );
    return copyInputMaterializationDecision(decision);
  },
});
