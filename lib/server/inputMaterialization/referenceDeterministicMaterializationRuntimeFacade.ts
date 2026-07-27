import {
  createMaterializationRuntimeFacade,
} from "./materializationRuntimeFacade";
import type {
  MaterializationRuntimeFacade,
} from "./materializationRuntimeFacadeTypes";
import {
  createDeterministicMaterializationRuntimeProviderFixture,
} from "./referenceDeterministicMaterializationRuntimeProviderFixture";
import type {
  InputMaterializationDecision,
} from "./types";

export type DeterministicMaterializationRuntimeFacadeFixtureOptions =
  Readonly<{
    throwOnValidation?: boolean;
    throwOnProvider?: boolean;
  }>;

export type DeterministicMaterializationRuntimeFacadeFixture = Readonly<{
  facade: MaterializationRuntimeFacade;
  invocationOrder(): readonly ("validation" | "provider")[];
  validationInvocations(): number;
  providerInvocations(): number;
}>;

export const createDeterministicMaterializationRuntimeFacadeFixture = (
  fixedDecision: InputMaterializationDecision,
  options: DeterministicMaterializationRuntimeFacadeFixtureOptions = {},
): DeterministicMaterializationRuntimeFacadeFixture => {
  const providerFixture =
    createDeterministicMaterializationRuntimeProviderFixture(
      fixedDecision,
      { throwOnInvocation: options.throwOnProvider },
    );
  const order: ("validation" | "provider")[] = [];
  let validationInvocations = 0;

  const facade = createMaterializationRuntimeFacade({
    validation: Object.freeze({
      validateProviderInput(input: unknown) {
        order.push("validation");
        validationInvocations += 1;
        if (options.throwOnValidation === true) {
          throw new Error("deterministic materialization validation failure");
        }
        return providerFixture.validation.validateProviderInput(input);
      },
    }),
    provider: Object.freeze({
      materialize(input) {
        order.push("provider");
        return providerFixture.provider.materialize(input);
      },
    }),
  });

  return Object.freeze({
    facade,
    invocationOrder(): readonly ("validation" | "provider")[] {
      return Object.freeze([...order]);
    },
    validationInvocations(): number {
      return validationInvocations;
    },
    providerInvocations(): number {
      return providerFixture.invocations().length;
    },
  });
};
