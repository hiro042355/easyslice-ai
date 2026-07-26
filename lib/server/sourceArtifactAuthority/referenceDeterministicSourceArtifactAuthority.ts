import type {
  SourceArtifactAuthorityCapability,
  SourceArtifactAuthorityFailureClassification,
  SourceArtifactAuthorityResolutionInput,
  SourceArtifactAuthorityResolutionResult,
  SourceArtifactAuthorizationEvidence,
  SourceArtifactOwnershipScope,
} from "./types";

export type DeterministicSourceArtifactAuthorityFixtureRecord = Readonly<{
  recordVersion: "1.0";
  opaqueSourceArtifactReference: string;
  opaqueAuthorityRecordReference: string;
  opaqueResolutionReference: string;
  ownershipScope: SourceArtifactOwnershipScope;
  authorizationEvidence: SourceArtifactAuthorizationEvidence;
  outcome: "authorized" | Exclude<SourceArtifactAuthorityFailureClassification, "invalid-context" | "unauthorized" | "missing">;
}>;

const copyOwnershipScope = (
  value: SourceArtifactOwnershipScope,
): SourceArtifactOwnershipScope => Object.freeze({ ...value });

const copyEvidence = (
  value: SourceArtifactAuthorizationEvidence,
): SourceArtifactAuthorizationEvidence => Object.freeze({ ...value });

const copyRecord = (
  value: DeterministicSourceArtifactAuthorityFixtureRecord,
): DeterministicSourceArtifactAuthorityFixtureRecord => Object.freeze({
  ...value,
  ownershipScope: copyOwnershipScope(value.ownershipScope),
  authorizationEvidence: copyEvidence(value.authorizationEvidence),
});

const rejected = (
  classification: SourceArtifactAuthorityFailureClassification,
): SourceArtifactAuthorityResolutionResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  classification,
});

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasValidContext = (input: SourceArtifactAuthorityResolutionInput): boolean =>
  input?.inputVersion === "1.0" &&
  input.sourceArtifact?.referenceVersion === "1.0" &&
  isNonEmpty(input.sourceArtifact.opaqueSourceArtifactReference) &&
  input.context?.contextVersion === "1.0" &&
  isNonEmpty(input.context.requestIdentity) &&
  isNonEmpty(input.context.operationIdentity) &&
  input.context.ownershipScope?.scopeVersion === "1.0" &&
  isNonEmpty(input.context.ownershipScope.sourceTenantReference) &&
  isNonEmpty(input.context.ownershipScope.sourceOwnershipReference) &&
  input.context.authorizationEvidence?.evidenceVersion === "1.0" &&
  isNonEmpty(input.context.authorizationEvidence.authorityDecisionReference) &&
  input.context.authorizationEvidence.decision === "authorized";

export const createDeterministicSourceArtifactAuthorityFixture = (
  records: readonly DeterministicSourceArtifactAuthorityFixtureRecord[],
): SourceArtifactAuthorityCapability => {
  const catalog = Object.freeze(records.map(copyRecord));

  return Object.freeze({
    resolveSourceArtifact(
      input: SourceArtifactAuthorityResolutionInput,
    ): SourceArtifactAuthorityResolutionResult {
      if (!hasValidContext(input)) return rejected("invalid-context");

      const sameReference = catalog.filter(
        (record) =>
          record.opaqueSourceArtifactReference ===
          input.sourceArtifact.opaqueSourceArtifactReference,
      );
      if (sameReference.length === 0) return rejected("missing");

      const record = sameReference.find(
        (candidate) =>
          candidate.ownershipScope.sourceTenantReference ===
            input.context.ownershipScope.sourceTenantReference &&
          candidate.ownershipScope.sourceOwnershipReference ===
            input.context.ownershipScope.sourceOwnershipReference,
      );
      if (!record) return rejected("unauthorized");

      if (
        record.authorizationEvidence.authorityDecisionReference !==
        input.context.authorizationEvidence.authorityDecisionReference
      ) {
        return rejected("unauthorized");
      }
      if (record.outcome !== "authorized") return rejected(record.outcome);

      return Object.freeze({
        resultVersion: "1.0",
        status: "authorized",
        opaqueAuthorityRecordReference: record.opaqueAuthorityRecordReference,
        opaqueResolutionReference: record.opaqueResolutionReference,
        ownershipScope: copyOwnershipScope(record.ownershipScope),
        authorizationEvidence: copyEvidence(record.authorizationEvidence),
      });
    },
  });
};
