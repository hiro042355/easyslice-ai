import type {
  MaterializationRuntimeProviderCapability,
} from "./materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInput,
  MaterializationRuntimeProviderInputValidationCapability,
} from "./materializationRuntimeProviderTypes";
import {
  copyMaterializationRuntimeProviderInput,
  createMaterializationRuntimeProviderInputValidation,
} from "./materializationRuntimeProviderValidation";
import type {
  InputMaterializationDecision,
} from "./types";

export type DeterministicMaterializationRuntimeProviderFixtureOptions =
  Readonly<{
    throwOnInvocation?: boolean;
  }>;

export type DeterministicMaterializationRuntimeProviderFixture = Readonly<{
  provider: MaterializationRuntimeProviderCapability;
  validation: MaterializationRuntimeProviderInputValidationCapability;
  invocations(): readonly MaterializationRuntimeProviderInput[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const immutableCopy = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => immutableCopy(item))) as T;
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, immutableCopy(item)]),
    )) as T;
  }
  return value;
};

export const createDeterministicMaterializationRuntimeProviderFixture = (
  fixedDecision: InputMaterializationDecision,
  options: DeterministicMaterializationRuntimeProviderFixtureOptions = {},
): DeterministicMaterializationRuntimeProviderFixture => {
  const decision = immutableCopy(fixedDecision);
  const captured: MaterializationRuntimeProviderInput[] = [];

  return Object.freeze({
    validation: createMaterializationRuntimeProviderInputValidation(),
    provider: Object.freeze({
      materialize(
        input: MaterializationRuntimeProviderInput,
      ): InputMaterializationDecision {
        captured.push(copyMaterializationRuntimeProviderInput(input));
        if (options.throwOnInvocation === true) {
          throw new Error("deterministic materialization provider failure");
        }
        return immutableCopy(decision);
      },
    }),
    invocations(): readonly MaterializationRuntimeProviderInput[] {
      return Object.freeze(
        captured.map(copyMaterializationRuntimeProviderInput),
      );
    },
  });
};
