import type {
  AuthorityLocatorResolutionAdapterResult,
} from "../authorityLocatorResolution/authorityLocatorAdapterTypes";
import type {
  AuthorityRuntimeFacadeResult,
} from "../authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  LocatorRuntimeFacadeResult,
} from "../locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import type {
  AuthorityLocatorRuntimeBinding,
  AuthorityLocatorRuntimeBindingDependencies,
  AuthorityLocatorRuntimeBindingFailureStage,
  AuthorityLocatorRuntimeBindingInput,
  AuthorityLocatorRuntimeBindingResult,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const copyAuthorityResult = (
  result: SourceArtifactAuthorityResolutionResult,
): SourceArtifactAuthorityResolutionResult => result.status === "authorized"
  ? Object.freeze({
    ...result,
    ownershipScope: Object.freeze({ ...result.ownershipScope }),
    authorizationEvidence: Object.freeze({ ...result.authorizationEvidence }),
  })
  : Object.freeze({ ...result });

const copyAdapterResult = (
  result: AuthorityLocatorResolutionAdapterResult,
): AuthorityLocatorResolutionAdapterResult => result.status === "adapted"
  ? Object.freeze({
    ...result,
    locatorRequest: Object.freeze({
      ...result.locatorRequest,
      resolutionContext: Object.freeze({
        ...result.locatorRequest.resolutionContext,
        ownershipScope: Object.freeze({
          ...result.locatorRequest.resolutionContext.ownershipScope,
        }),
        authorizationEvidence: Object.freeze({
          ...result.locatorRequest.resolutionContext.authorizationEvidence,
        }),
      }),
    }),
  })
  : Object.freeze({ ...result });

const copyLocatorResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

const copyAuthorityFacadeResult = (
  result: AuthorityRuntimeFacadeResult,
): AuthorityRuntimeFacadeResult => result.status === "evaluated"
  ? Object.freeze({
    ...result,
    authorityResult: copyAuthorityResult(result.authorityResult),
  })
  : Object.freeze({ ...result });

const copyLocatorFacadeResult = (
  result: LocatorRuntimeFacadeResult,
): LocatorRuntimeFacadeResult => result.status === "located"
  ? Object.freeze({
    ...result,
    locatorResult: copyLocatorResult(result.locatorResult),
  })
  : Object.freeze({ ...result });

const failed = (
  stage: AuthorityLocatorRuntimeBindingFailureStage,
  details: Omit<
    Extract<AuthorityLocatorRuntimeBindingResult, { status: "failed" }>,
    "resultVersion" | "status" | "stage"
  > = {},
): AuthorityLocatorRuntimeBindingResult => Object.freeze({
  resultVersion: "1.0",
  status: "failed",
  stage,
  ...details,
});

const hasDependencies = (
  dependencies: AuthorityLocatorRuntimeBindingDependencies,
): boolean =>
  typeof dependencies?.composition?.authority?.facade?.evaluate === "function" &&
  typeof dependencies?.composition?.locator?.facade?.invoke === "function" &&
  typeof dependencies?.adapter?.adapt === "function";

export const createAuthorityLocatorRuntimeBinding = (
  dependencies: AuthorityLocatorRuntimeBindingDependencies,
): AuthorityLocatorRuntimeBinding => Object.freeze({
  async execute(input: unknown): Promise<AuthorityLocatorRuntimeBindingResult> {
    if (!hasDependencies(dependencies)) return failed("internal");
    if (
      !isRecord(input) ||
      input.bindingVersion !== "1.0" ||
      !isRecord(input.authorityInput)
    ) return failed("input");

    const bindingInput = input as unknown as AuthorityLocatorRuntimeBindingInput;
    let authorityFacadeResult: AuthorityRuntimeFacadeResult;
    try {
      authorityFacadeResult =
        await dependencies.composition.authority.facade.evaluate(
          bindingInput.authorityInput,
        );
    } catch {
      return failed("authority");
    }
    const copiedAuthorityFacadeResult = copyAuthorityFacadeResult(
      authorityFacadeResult,
    );
    if (authorityFacadeResult.status !== "evaluated") {
      return failed("authority", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
      });
    }

    const authorityResult = authorityFacadeResult.authorityResult;
    if (authorityResult.status !== "authorized") {
      return failed("authority", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
      });
    }

    let adapterResult: AuthorityLocatorResolutionAdapterResult;
    try {
      adapterResult = dependencies.adapter.adapt({
        ...bindingInput.adapterInput,
        authorityResult,
      });
    } catch {
      return failed("adapter", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
      });
    }
    const copiedAdapterResult = copyAdapterResult(adapterResult);
    if (adapterResult.status !== "adapted") {
      return failed("adapter", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
        adapterResult: copiedAdapterResult,
      });
    }

    let locatorFacadeResult: LocatorRuntimeFacadeResult;
    try {
      locatorFacadeResult =
        await dependencies.composition.locator.facade.invoke({
          providerVersion: bindingInput.locatorProviderVersion,
          locatorRequest: adapterResult.locatorRequest,
        });
    } catch {
      return failed("locator", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
        adapterResult: copiedAdapterResult,
      });
    }
    const copiedLocatorFacadeResult = copyLocatorFacadeResult(locatorFacadeResult);
    if (locatorFacadeResult.status !== "located") {
      return failed("locator", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
        adapterResult: copiedAdapterResult,
        locatorFacadeResult: copiedLocatorFacadeResult,
      });
    }

    const locatorResult = locatorFacadeResult.locatorResult;
    if (locatorResult.status !== "authorized") {
      return failed("locator", {
        authorityFacadeResult: copiedAuthorityFacadeResult,
        authorityResult: copyAuthorityResult(authorityResult),
        adapterResult: copiedAdapterResult,
        locatorFacadeResult: copiedLocatorFacadeResult,
        locatorResult: copyLocatorResult(locatorResult),
      });
    }

    return Object.freeze({
      resultVersion: "1.0",
      status: "completed",
      authorityResult: copyAuthorityResult(authorityResult),
      adapterResult: copiedAdapterResult,
      locatorResult: copyLocatorResult(locatorResult),
    });
  },
});
