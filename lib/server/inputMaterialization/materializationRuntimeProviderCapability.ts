import type {
  MaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderTypes";
import type {
  InputMaterializationDecision,
} from "./types";

export type MaterializationRuntimeProviderCapability = Readonly<{
  materialize(
    input: MaterializationRuntimeProviderInput,
  ): InputMaterializationDecision | Promise<InputMaterializationDecision>;
}>;
