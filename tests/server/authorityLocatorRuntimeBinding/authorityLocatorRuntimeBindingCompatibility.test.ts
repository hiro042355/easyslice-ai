import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AuthorityLocatorRuntimeBinding,
} from "../../../lib/server/authorityLocatorRuntimeBinding/types";
import type {
  AuthorityLocatorResolutionAdapter,
} from "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes";
import type {
  AuthorityLocatorRuntimeComposition,
} from "../../../lib/server/authorityLocatorRuntimeComposition/types";
import type {
  AuthorityRuntimeFacade,
} from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  LocatorRuntimeFacade,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes";

test("binding remains compatible with composition, facades, and adapter", () => {
  const acceptsBinding = (value: AuthorityLocatorRuntimeBinding) => value;
  const acceptsComposition = (value: AuthorityLocatorRuntimeComposition) => value;
  const acceptsAuthority = (value: AuthorityRuntimeFacade) => value;
  const acceptsLocator = (value: LocatorRuntimeFacade) => value;
  const acceptsAdapter = (value: AuthorityLocatorResolutionAdapter) => value;

  assert.equal(typeof acceptsBinding, "function");
  assert.equal(typeof acceptsComposition, "function");
  assert.equal(typeof acceptsAuthority, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsAdapter, "function");
});

test("existing foundations do not reverse-depend on runtime binding", () => {
  const existingFiles = [
    "../../../lib/server/authorityLocatorRuntimeComposition/types.ts",
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes.ts",
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /authorityLocatorRuntimeBinding/);
  }
});
