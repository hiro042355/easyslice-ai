import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AuthorityRuntimeFacadeDependencies,
} from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  PrincipalAwareAuthorityRuntimeProviderCapability,
} from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability";
import type {
  ProductionAuthorityProviderComposition,
} from "../../../lib/server/sourceArtifactAuthority/productionAuthorityProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../../../lib/server/sourceArtifactAuthority/types";

test("production composition is compatible with provider and facade contracts", () => {
  const acceptsProvider = (
    value: PrincipalAwareAuthorityRuntimeProviderCapability,
  ) => value;
  const acceptsFacadeDependencies = (
    value: AuthorityRuntimeFacadeDependencies,
  ) => value;
  const acceptsComposition = (
    value: ProductionAuthorityProviderComposition,
  ) => value;
  const acceptsResult = (value: SourceArtifactAuthorityResolutionResult) => value;

  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsFacadeDependencies, "function");
  assert.equal(typeof acceptsComposition, "function");
  assert.equal(typeof acceptsResult, "function");
});

test("existing contracts and facade do not reverse-depend on production provider", () => {
  const existingFiles = [
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability.ts",
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacade.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /productionAuthorityProvider/);
  }
});
