import type {
  MaterializationRuntimeProviderCapability,
} from "./materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderTypes";
import type {
  InputMaterializationDecision,
} from "./types";

export type ProductionMaterializationStrategyCapability = Readonly<{
  materialize(
    input: MaterializationRuntimeProviderInput,
  ): InputMaterializationDecision | Promise<InputMaterializationDecision>;
}>;

export type ProductionMaterializationProviderDependencies = Readonly<{
  strategy: ProductionMaterializationStrategyCapability;
}>;

export type ProductionMaterializationProviderComposition = Readonly<{
  strategy: ProductionMaterializationStrategyCapability;
  provider: MaterializationRuntimeProviderCapability;
}>;
