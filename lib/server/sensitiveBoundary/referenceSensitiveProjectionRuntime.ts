import type {
  SafeAuditProjection,
  SafeInternalProjection,
  SafePublicProjection,
  SensitiveProjectionAudit,
  SensitiveProjectionAuditEntry,
  SensitiveProjectionDecision,
  SensitiveProjectionInput,
  SensitiveProjectionIssueCode,
  SensitiveProjectionValidation,
  SensitiveValueClassification,
  SensitiveValueReference,
  SensitiveValueUsageScope,
} from "./types";

export type SensitiveReferenceClassification =
  | Readonly<{ status: "approved" }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "unavailable" }>;

export type SensitiveReferenceClassificationCapability = Readonly<{
  classifySensitiveReference(
    reference: SensitiveValueReference,
  ): SensitiveReferenceClassification | Promise<SensitiveReferenceClassification>;
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const audit = (
  entries: readonly Omit<SensitiveProjectionAuditEntry, "entryVersion" | "sequence">[],
): SensitiveProjectionAudit => deepFreeze({
  auditVersion: "1.0",
  entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
  reasonCodes: entries.map((entry) => entry.reasonCode),
});

const publicProjection = (
  outcomeClassification: SafePublicProjection["outcomeClassification"],
  reasonCode: SafePublicProjection["reasonCode"],
): SafePublicProjection => deepFreeze({
  projectionVersion: "1.0",
  outcomeClassification,
  reasonCode,
  retryClassification: outcomeClassification === "unavailable" ? "retryable" : "not-retryable",
  userActionClassification:
    outcomeClassification === "unavailable" ? "retry-later" :
    outcomeClassification === "rejected" || outcomeClassification === "invalid" ? "change-request" : "none",
  messageClassification:
    outcomeClassification === "projected" ? "accepted" : outcomeClassification,
});

const supported = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

export const validateSensitiveProjectionInput = (
  input: SensitiveProjectionInput,
): SensitiveProjectionValidation => {
  const issues: SensitiveProjectionIssueCode[] = [];
  if (input.inputVersion !== "1.0" || typeof input.requestIdentity !== "string" || input.requestIdentity.length === 0)
    issues.push("request-identity-missing");
  if (!Array.isArray(input.references) || input.references.length === 0) issues.push("value-reference-missing");
  const identities = new Set<string>();
  for (const reference of input.references ?? []) {
    if (reference.referenceVersion !== "1.0" ||
      typeof reference.opaqueValueReference !== "string" ||
      reference.opaqueValueReference.length === 0) issues.push("opaque-reference-invalid");
    else if (identities.has(reference.opaqueValueReference)) issues.push("reference-duplicate");
    else identities.add(reference.opaqueValueReference);
    if (!supported(reference.classification, ["public", "internal", "confidential", "credential", "locator", "personal", "operational", "derived-safe"]))
      issues.push("classification-unsupported");
    if (!supported(reference.sourceClassification, ["request-boundary", "auth-boundary", "upload-boundary", "capability-boundary", "internal-runtime"]))
      issues.push("source-classification-unsupported");
    if (!supported(reference.requestedUsageScope, ["internal-execution", "capability-input", "audit", "public-response", "diagnostic", "cleanup"]))
      issues.push("usage-scope-unsupported");
    if (typeof reference.tenantReference !== "string" || reference.tenantReference.length === 0) issues.push("tenant-reference-missing");
    if (typeof reference.workspaceReference !== "string" || reference.workspaceReference.length === 0) issues.push("workspace-reference-missing");
    if (typeof reference.ownershipReference !== "string" || reference.ownershipReference.length === 0) issues.push("ownership-reference-missing");
    if (!supported(reference.projectionPolicyClassification, ["strict", "personal-public-explicit", "internal-capability"]))
      issues.push("projection-policy-invalid");
  }
  if (typeof input.authenticatedTenantReference !== "string" || input.authenticatedTenantReference.length === 0)
    issues.push("tenant-reference-missing");
  if (typeof input.requestedWorkspaceReference !== "string" || input.requestedWorkspaceReference.length === 0)
    issues.push("workspace-reference-missing");
  if (typeof input.authenticatedOwnershipReference !== "string" || input.authenticatedOwnershipReference.length === 0)
    issues.push("ownership-reference-missing");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : {
    status: "invalid",
    issues: issues.map((issueCode, sequence) => ({ issueCode, sequence })),
  });
};

type PolicyDecision = "projected" | "redacted" | "rejected";

const decidePolicy = (
  classification: SensitiveValueClassification,
  scope: SensitiveValueUsageScope,
  policy: SensitiveValueReference["projectionPolicyClassification"],
): PolicyDecision => {
  if (classification === "public" || classification === "derived-safe") return "projected";
  if (classification === "personal" && scope === "public-response")
    return policy === "personal-public-explicit" ? "projected" : "rejected";
  if (classification === "credential")
    return scope === "internal-execution" || scope === "capability-input" ? "projected" : "redacted";
  if (classification === "locator") {
    if (scope === "capability-input" || scope === "cleanup") return "projected";
    return scope === "public-response" ? "rejected" : "redacted";
  }
  if (classification === "confidential")
    return scope === "internal-execution" || scope === "capability-input" || scope === "cleanup" ? "projected" : "redacted";
  if (classification === "internal")
    return scope === "internal-execution" || scope === "capability-input" || scope === "cleanup" ? "projected" : "redacted";
  return scope === "internal-execution" || scope === "capability-input" || scope === "cleanup" ? "projected" : "redacted";
};

export class ReferenceSensitiveProjectionRuntime {
  readonly #classification: SensitiveReferenceClassificationCapability;

  constructor(classification: SensitiveReferenceClassificationCapability) {
    this.#classification = classification;
  }

  async project(input: SensitiveProjectionInput): Promise<SensitiveProjectionDecision> {
    const validation = validateSensitiveProjectionInput(input);
    if (validation.status === "invalid") {
      const resultAudit = audit([{
        stage: "validation", classification: "request", requestedUsageScope: "none",
        decisionClassification: "invalid", reasonCode: "sensitive-input-invalid",
      }]);
      return deepFreeze({
        decisionVersion: "1.0", status: "invalid", reasonCode: "sensitive-input-invalid",
        audit: resultAudit, publicProjection: publicProjection("invalid", "sensitive-input-invalid"),
      });
    }
    if (input.references.some((reference) =>
      reference.tenantReference !== input.authenticatedTenantReference ||
      reference.workspaceReference !== input.requestedWorkspaceReference ||
      reference.ownershipReference !== input.authenticatedOwnershipReference)) {
      const resultAudit = audit([{
        stage: "ownership", classification: "request", requestedUsageScope: "none",
        decisionClassification: "rejected", reasonCode: "ownership-mismatch",
      }]);
      return deepFreeze({
        decisionVersion: "1.0", status: "rejected", reasonCode: "ownership-mismatch",
        audit: resultAudit, publicProjection: publicProjection("rejected", "ownership-mismatch"),
      });
    }

    const internalProjections: SafeInternalProjection[] = [];
    const auditProjections: SafeAuditProjection[] = [];
    const publicProjections: SafePublicProjection[] = [];
    const auditEntries: Omit<SensitiveProjectionAuditEntry, "entryVersion" | "sequence">[] = [];
    let redacted = false;
    for (const reference of input.references) {
      const policyDecision = decidePolicy(
        reference.classification,
        reference.requestedUsageScope,
        reference.projectionPolicyClassification,
      );
      const sequence = auditProjections.length;
      if (policyDecision === "rejected") {
        const resultAudit = audit([...auditEntries, {
          stage: "policy", classification: reference.classification,
          requestedUsageScope: reference.requestedUsageScope,
          decisionClassification: "rejected", reasonCode: "scope-forbidden",
        }]);
        return deepFreeze({
          decisionVersion: "1.0", status: "rejected", reasonCode: "scope-forbidden",
          audit: resultAudit, publicProjection: publicProjection("rejected", "scope-forbidden"),
        });
      }
      if (policyDecision === "redacted") {
        redacted = true;
        auditProjections.push({
          projectionVersion: "1.0", sequence, stage: "policy",
          classification: reference.classification, requestedUsageScope: reference.requestedUsageScope,
          outcomeClassification: "redacted", reasonCode: "projection-redacted",
        });
        publicProjections.push(publicProjection("redacted", "projection-redacted"));
        auditEntries.push({
          stage: "policy", classification: reference.classification,
          requestedUsageScope: reference.requestedUsageScope,
          decisionClassification: "redacted", reasonCode: "projection-redacted",
        });
        continue;
      }

      let classification: SensitiveReferenceClassification;
      try {
        classification = await this.#classification.classifySensitiveReference(deepFreeze({ ...reference }));
      } catch {
        classification = { status: "unavailable" };
      }
      if (classification.status === "rejected") {
        const resultAudit = audit([...auditEntries, {
          stage: "projection", classification: reference.classification,
          requestedUsageScope: reference.requestedUsageScope,
          decisionClassification: "rejected", reasonCode: "projection-rejected",
        }]);
        return deepFreeze({
          decisionVersion: "1.0", status: "rejected", reasonCode: "projection-rejected",
          audit: resultAudit, publicProjection: publicProjection("rejected", "projection-rejected"),
        });
      }
      if (classification.status !== "approved") {
        const resultAudit = audit([...auditEntries, {
          stage: "projection", classification: reference.classification,
          requestedUsageScope: reference.requestedUsageScope,
          decisionClassification: "unavailable", reasonCode: "projection-unavailable",
        }]);
        return deepFreeze({
          decisionVersion: "1.0", status: "unavailable", reasonCode: "projection-unavailable",
          audit: resultAudit, publicProjection: publicProjection("unavailable", "projection-unavailable"),
        });
      }
      internalProjections.push({
        projectionVersion: "1.0", opaqueValueReference: reference.opaqueValueReference,
        classification: reference.classification, permittedUsageScope: reference.requestedUsageScope,
        tenantClassification: "matched", workspaceClassification: "matched", ownershipVerified: true,
        redactionRequired: false, reasonCode: "projection-approved",
      });
      auditProjections.push({
        projectionVersion: "1.0", sequence, stage: "projection",
        classification: reference.classification, requestedUsageScope: reference.requestedUsageScope,
        outcomeClassification: "projected", reasonCode: "projection-approved",
      });
      publicProjections.push(publicProjection("projected", "projection-approved"));
      auditEntries.push({
        stage: "projection", classification: reference.classification,
        requestedUsageScope: reference.requestedUsageScope,
        decisionClassification: "projected", reasonCode: "projection-approved",
      });
    }
    const context = deepFreeze({
      contextVersion: "1.0" as const,
      internalProjections: internalProjections.map((projection) => ({ ...projection })),
      auditProjections: auditProjections.map((projection) => ({ ...projection })),
      publicProjections: publicProjections.map((projection) => ({ ...projection })),
    });
    const resultAudit = audit(auditEntries);
    return deepFreeze(redacted
      ? { decisionVersion: "1.0", status: "redacted", context, reasonCode: "projection-redacted", audit: resultAudit }
      : { decisionVersion: "1.0", status: "projected", context, audit: resultAudit });
  }
}
