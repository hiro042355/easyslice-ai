import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AuthorityLocatorRuntimeComposition,
} from "../../../lib/server/authorityLocatorRuntimeComposition/types";
import type {
  AuthorityRuntimeFacade,
} from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  LocatorRuntimeFacade,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  ProductionAuthorityProviderComposition,
} from "../../../lib/server/sourceArtifactAuthority/productionAuthorityProviderTypes";
import type {
  ProductionLocatorProviderComposition,
} from "../../../lib/server/sourceArtifactLocator/productionLocatorProviderTypes";

test("composition is structurally compatible with existing boundaries", () => {
  const acceptsComposition = (
    value: AuthorityLocatorRuntimeComposition,
  ) => value;
  const acceptsAuthorityFacade = (value: AuthorityRuntimeFacade) => value;
  const acceptsLocatorFacade = (value: LocatorRuntimeFacade) => value;
  const acceptsAuthorityProvider = (
    value: ProductionAuthorityProviderComposition,
  ) => value;
  const acceptsLocatorProvider = (
    value: ProductionLocatorProviderComposition,
  ) => value;

  assert.equal(typeof acceptsComposition, "function");
  assert.equal(typeof acceptsAuthorityFacade, "function");
  assert.equal(typeof acceptsLocatorFacade, "function");
  assert.equal(typeof acceptsAuthorityProvider, "function");
  assert.equal(typeof acceptsLocatorProvider, "function");
});

test("existing foundations do not reverse-depend on runtime composition", () => {
  const existingFiles = [
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/productionAuthorityProviderTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/productionAuthorityProvider.ts",
    "../../../lib/server/sourceArtifactLocator/productionLocatorProviderTypes.ts",
    "../../../lib/server/sourceArtifactLocator/productionLocatorProvider.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /authorityLocatorRuntimeComposition/);
  }
});
