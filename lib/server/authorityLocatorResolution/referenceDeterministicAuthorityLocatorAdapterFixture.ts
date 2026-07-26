import { createAuthorityLocatorResolutionAdapter } from "./authorityLocatorResolutionAdapter";
import type { AuthorityLocatorResolutionAdapter } from "./authorityLocatorAdapterTypes";

export const createDeterministicAuthorityLocatorResolutionAdapterFixture =
  (): AuthorityLocatorResolutionAdapter =>
    createAuthorityLocatorResolutionAdapter();
