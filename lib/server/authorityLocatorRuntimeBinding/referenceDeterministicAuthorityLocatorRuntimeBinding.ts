import {
  createAuthorityLocatorResolutionAdapter,
} from "../authorityLocatorResolution/authorityLocatorResolutionAdapter";
import {
  createDeterministicAuthorityLocatorRuntimeCompositionFixture,
} from "../authorityLocatorRuntimeComposition/referenceDeterministicAuthorityLocatorRuntimeComposition";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import {
  createAuthorityLocatorRuntimeBinding,
} from "./authorityLocatorRuntimeBinding";
import type {
  AuthorityLocatorRuntimeBinding,
} from "./types";

export type DeterministicAuthorityLocatorRuntimeBindingFixture = Readonly<{
  binding: AuthorityLocatorRuntimeBinding;
  invocationOrder(): readonly ("authority" | "adapter" | "locator")[];
  authorityInvocations(): number;
  adapterInvocations(): number;
  locatorInvocations(): number;
}>;

export const createDeterministicAuthorityLocatorRuntimeBindingFixture = (
  authorityResult: SourceArtifactAuthorityResolutionResult,
  locatorResult: SourceArtifactLocatorV2Result,
): DeterministicAuthorityLocatorRuntimeBindingFixture => {
  const composition =
    createDeterministicAuthorityLocatorRuntimeCompositionFixture(
      authorityResult,
      locatorResult,
    );
  const adapter = createAuthorityLocatorResolutionAdapter();
  const order: ("authority" | "adapter" | "locator")[] = [];
  let adapterInvocations = 0;

  const binding = createAuthorityLocatorRuntimeBinding({
    composition: Object.freeze({
      ...composition.composition,
      authority: Object.freeze({
        ...composition.composition.authority,
        facade: Object.freeze({
          async evaluate(input: unknown) {
            order.push("authority");
            return composition.composition.authority.facade.evaluate(input);
          },
        }),
      }),
      locator: Object.freeze({
        ...composition.composition.locator,
        facade: Object.freeze({
          async invoke(input: unknown) {
            order.push("locator");
            return composition.composition.locator.facade.invoke(input);
          },
        }),
      }),
    }),
    adapter: Object.freeze({
      adapt(input: unknown) {
        order.push("adapter");
        adapterInvocations += 1;
        return adapter.adapt(input);
      },
    }),
  });

  return Object.freeze({
    binding,
    invocationOrder(): readonly ("authority" | "adapter" | "locator")[] {
      return Object.freeze([...order]);
    },
    authorityInvocations(): number {
      return composition.authorityInvocations().length;
    },
    adapterInvocations(): number {
      return adapterInvocations;
    },
    locatorInvocations(): number {
      return composition.locatorInvocations().length;
    },
  });
};
