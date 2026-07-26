import type {
  SourceArtifactLocatorContractVersion,
  SourceArtifactLocatorV2Capability,
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2Result,
  SourceArtifactLocatorVersionNegotiationCapability,
  SourceArtifactLocatorVersionNegotiationRequest,
  SourceArtifactLocatorVersionNegotiationResult,
} from "./types";

type LegacySourceArtifactLocatorV1Capability = Readonly<{
  locateSource(
    reference: Readonly<{ opaqueReference: string }>,
  ):
    | Readonly<{ location: string }>
    | Promise<Readonly<{ location: string }>>;
}>;

export type DeterministicSourceArtifactLocatorV2FixtureRecord = Readonly<{
  recordVersion: "1.0";
  opaqueReference: string;
  sourceTenantReference: string;
  sourceOwnershipReference: string;
  workflowIdentity: string;
  authorityDecisionReference: string;
  result: SourceArtifactLocatorV2Result;
}>;

const copyResult = (
  result: SourceArtifactLocatorV2Result,
): SourceArtifactLocatorV2Result => Object.freeze({ ...result });

const copyRecord = (
  record: DeterministicSourceArtifactLocatorV2FixtureRecord,
): DeterministicSourceArtifactLocatorV2FixtureRecord => Object.freeze({
  ...record,
  result: copyResult(record.result),
});

const failure = (
  status: Exclude<SourceArtifactLocatorV2Result["status"], "authorized" | "rejected">,
): SourceArtifactLocatorV2Result => Object.freeze({
  resultVersion: "2.0",
  status,
});

const valid = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasValidRequest = (request: SourceArtifactLocatorV2Request): boolean =>
  request?.version === "2.0" &&
  valid(request.opaqueReference) &&
  request.resolutionContext?.contextVersion === "2.0" &&
  valid(request.resolutionContext.requestIdentity) &&
  valid(request.resolutionContext.operationIdentity) &&
  valid(request.resolutionContext.workflowIdentity) &&
  request.resolutionContext.ownershipScope?.scopeVersion === "1.0" &&
  valid(request.resolutionContext.ownershipScope.sourceTenantReference) &&
  valid(request.resolutionContext.ownershipScope.sourceOwnershipReference) &&
  request.resolutionContext.authorizationEvidence?.evidenceVersion === "1.0" &&
  valid(request.resolutionContext.authorizationEvidence.authorityDecisionReference) &&
  request.resolutionContext.authorizationEvidence.decision === "authorized";

export const createDeterministicSourceArtifactLocatorV2Fixture = (
  records: readonly DeterministicSourceArtifactLocatorV2FixtureRecord[],
): SourceArtifactLocatorV2Capability => {
  const catalog = Object.freeze(records.map(copyRecord));

  return Object.freeze({
    locateSourceV2(request: SourceArtifactLocatorV2Request): SourceArtifactLocatorV2Result {
      if (!hasValidRequest(request)) return failure("invalid-reference");

      const sameReference = catalog.filter(
        (record) => record.opaqueReference === request.opaqueReference,
      );
      if (sameReference.length === 0) return failure("not-found");

      const sameOwnership = sameReference.filter(
        (record) =>
          record.sourceTenantReference ===
            request.resolutionContext.ownershipScope.sourceTenantReference &&
          record.sourceOwnershipReference ===
            request.resolutionContext.ownershipScope.sourceOwnershipReference,
      );
      if (sameOwnership.length === 0) return failure("ownership-mismatch");

      const sameWorkflow = sameOwnership.filter(
        (record) =>
          record.workflowIdentity === request.resolutionContext.workflowIdentity,
      );
      if (sameWorkflow.length === 0) return failure("workflow-mismatch");

      const record = sameWorkflow.find(
        (candidate) =>
          candidate.authorityDecisionReference ===
          request.resolutionContext.authorizationEvidence.authorityDecisionReference,
      );
      if (!record) {
        return Object.freeze({
          resultVersion: "2.0",
          status: "rejected",
          classification: "authorization-denied",
        });
      }

      return copyResult(record.result);
    },
  });
};

export const createSourceArtifactLocatorVersionNegotiator = (
  supportedVersions: readonly SourceArtifactLocatorContractVersion[] = ["2.0", "1.0"],
): SourceArtifactLocatorVersionNegotiationCapability => {
  const supported = Object.freeze([...supportedVersions]);

  return Object.freeze({
    negotiateVersion(
      request: SourceArtifactLocatorVersionNegotiationRequest,
    ): SourceArtifactLocatorVersionNegotiationResult {
      if (request?.negotiationVersion !== "1.0") {
        return Object.freeze({ resultVersion: "1.0", status: "unsupported" });
      }
      const selectedVersion = supported.find((version) =>
        request.requestedVersions.includes(version));
      return selectedVersion
        ? Object.freeze({
          resultVersion: "1.0",
          status: "selected",
          selectedVersion,
        })
        : Object.freeze({ resultVersion: "1.0", status: "unsupported" });
    },
  });
};

export const createSourceArtifactLocatorV1CompatibilityAdapter = (
  legacy: LegacySourceArtifactLocatorV1Capability,
): SourceArtifactLocatorV2Capability => Object.freeze({
  async locateSourceV2(
    request: SourceArtifactLocatorV2Request,
  ): Promise<SourceArtifactLocatorV2Result> {
    if (!hasValidRequest(request)) return failure("invalid-reference");

    try {
      const located = await legacy.locateSource({
        opaqueReference: request.opaqueReference,
      });
      if (!valid(located?.location)) return failure("internal-failure");

      return Object.freeze({
        resultVersion: "2.0",
        status: "authorized",
        opaqueResolutionReference:
          request.resolutionContext.authorizationEvidence.authorityDecisionReference,
      });
    } catch {
      return failure("internal-failure");
    }
  },
});
