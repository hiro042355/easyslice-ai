import type {
  OpaqueUploadReference,
  ProjectedUploadContext,
  UploadProjectionAudit,
  UploadProjectionAuditEntry,
  UploadProjectionDecision,
  UploadProjectionInput,
  UploadProjectionIssueCode,
  UploadProjectionValidation,
} from "./types";

export type UploadReferenceResolution =
  | Readonly<{ status: "resolved" }>
  | Readonly<{ status: "rejected"; reasonCode: "resolution-rejected" }>
  | Readonly<{ status: "unavailable"; reasonCode: "resolution-unavailable" }>;

export type UploadReferenceResolutionCapability = Readonly<{
  resolve(input: UploadProjectionInput): UploadReferenceResolution | Promise<UploadReferenceResolution>;
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copyReference = (reference: OpaqueUploadReference): OpaqueUploadReference => ({
  ...reference,
  metadata: { ...reference.metadata },
  integrity: { ...reference.integrity },
});

const audit = (
  entries: readonly Omit<UploadProjectionAuditEntry, "entryVersion" | "sequence">[],
): UploadProjectionAudit => deepFreeze({
  auditVersion: "1.0",
  entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
  reasonCodes: entries.map((entry) => entry.reasonCode),
});

export const validateUploadProjectionInput = (input: UploadProjectionInput): UploadProjectionValidation => {
  const issues: UploadProjectionIssueCode[] = [];
  if (input.inputVersion !== "1.0" || input.requestIdentity.length === 0) issues.push("request-identity-missing");
  if (!Array.isArray(input.uploadReferences) || input.uploadReferences.length === 0) issues.push("upload-reference-missing");
  const identities = new Set<string>();
  for (const reference of input.uploadReferences ?? []) {
    if (reference.referenceVersion !== "1.0" || reference.opaqueReferenceId.length === 0) issues.push("opaque-reference-invalid");
    else if (identities.has(reference.opaqueReferenceId)) issues.push("reference-duplicate");
    else identities.add(reference.opaqueReferenceId);
    if (!["uploaded-object", "pending-upload", "trusted-import"].includes(reference.referenceKind)) issues.push("reference-kind-unsupported");
    if (!["browser-upload", "server-ingest", "trusted-import"].includes(reference.sourceClassification)) issues.push("source-classification-unsupported");
    if (!["video", "audio", "image", "archive", "unknown"].includes(reference.mediaClassification)) issues.push("media-classification-unsupported");
    if (reference.tenantReference.length === 0) issues.push("tenant-reference-missing");
    if (reference.workspaceReference.length === 0) issues.push("workspace-reference-missing");
    if (reference.ownershipReference.length === 0) issues.push("ownership-reference-missing");
    if (!["empty", "small", "medium", "large", "unknown"].includes(reference.metadata.contentLengthClassification)) issues.push("content-length-classification-invalid");
    if (reference.metadata.metadataVersion !== "1.0" || reference.metadata.declaredMediaClassification !== reference.mediaClassification) issues.push("media-classification-unsupported");
    const integrity = reference.integrity;
    if (integrity.integrityVersion !== "1.0" || (!integrity.integrityPresent && integrity.integrityVerified) ||
      (integrity.integrityPresent && integrity.algorithmClassification === "none")) issues.push("integrity-projection-invalid");
    if (!["available", "pending", "expired", "deleted", "quarantined", "unavailable"].includes(reference.lifecycleClassification)) issues.push("lifecycle-classification-invalid");
  }
  if (input.authenticatedTenantReference.length === 0) issues.push("tenant-reference-missing");
  if (input.requestedWorkspaceReference.length === 0) issues.push("workspace-reference-missing");
  if (input.authenticatedOwnershipReference.length === 0) issues.push("ownership-reference-missing");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : {
    status: "invalid",
    issues: issues.map((issueCode, sequence) => ({ issueCode, sequence })),
  });
};

export class ReferenceUploadProjectionRuntime {
  readonly #resolution: UploadReferenceResolutionCapability;

  constructor(resolution: UploadReferenceResolutionCapability) {
    this.#resolution = resolution;
  }

  async project(input: UploadProjectionInput): Promise<UploadProjectionDecision> {
    const validation = validateUploadProjectionInput(input);
    if (validation.status === "invalid") return deepFreeze({
      decisionVersion: "1.0", status: "invalid", reasonCode: "upload-input-invalid",
      audit: audit([{ stage: "validation", classification: "invalid", reasonCode: "upload-input-invalid" }]),
    });
    if (input.uploadReferences.some((reference) =>
      reference.tenantReference !== input.authenticatedTenantReference ||
      reference.workspaceReference !== input.requestedWorkspaceReference ||
      reference.ownershipReference !== input.authenticatedOwnershipReference)) return deepFreeze({
        decisionVersion: "1.0", status: "rejected", reasonCode: "ownership-mismatch",
        audit: audit([{ stage: "ownership", classification: "rejected", reasonCode: "ownership-mismatch" }]),
      });
    if (input.uploadReferences.some((reference) => !input.acceptedMediaClassifications.includes(reference.mediaClassification))) return deepFreeze({
      decisionVersion: "1.0", status: "rejected", reasonCode: "media-unsupported",
      audit: audit([{ stage: "validation", classification: "rejected", reasonCode: "media-unsupported" }]),
    });
    const lifecycle = input.uploadReferences.find((reference) => reference.lifecycleClassification !== "available")?.lifecycleClassification;
    if (lifecycle === "pending") return deepFreeze({ decisionVersion: "1.0", status: "pending", reasonCode: "upload-pending", audit: audit([{ stage: "resolution", classification: "pending", reasonCode: "upload-pending" }]) });
    if (lifecycle === "expired" || lifecycle === "deleted" || lifecycle === "quarantined") return deepFreeze({
      decisionVersion: "1.0", status: "rejected", reasonCode: `upload-${lifecycle}`,
      audit: audit([{ stage: "resolution", classification: "rejected", reasonCode: `upload-${lifecycle}` }]),
    });
    if (lifecycle === "unavailable") return deepFreeze({ decisionVersion: "1.0", status: "unavailable", reasonCode: "upload-unavailable", audit: audit([{ stage: "resolution", classification: "unavailable", reasonCode: "upload-unavailable" }]) });
    let resolved: UploadReferenceResolution;
    try {
      resolved = await this.#resolution.resolve(deepFreeze({
        ...input,
        acceptedMediaClassifications: [...input.acceptedMediaClassifications],
        uploadReferences: input.uploadReferences.map(copyReference),
      }));
    } catch {
      return deepFreeze({ decisionVersion: "1.0", status: "unavailable", reasonCode: "resolution-unavailable", audit: audit([{ stage: "resolution", classification: "unavailable", reasonCode: "resolution-unavailable" }]) });
    }
    if (resolved.status === "rejected") return deepFreeze({ decisionVersion: "1.0", status: "rejected", reasonCode: "resolution-rejected", audit: audit([{ stage: "resolution", classification: "rejected", reasonCode: "resolution-rejected" }]) });
    if (resolved.status !== "resolved") return deepFreeze({ decisionVersion: "1.0", status: "unavailable", reasonCode: "resolution-unavailable", audit: audit([{ stage: "resolution", classification: "unavailable", reasonCode: "resolution-unavailable" }]) });
    const context: ProjectedUploadContext = {
      contextVersion: "1.0", requestIdentity: input.requestIdentity,
      tenantReference: input.authenticatedTenantReference,
      workspaceReference: input.requestedWorkspaceReference,
      uploads: input.uploadReferences.map(copyReference),
    };
    return deepFreeze({ decisionVersion: "1.0", status: "projected", context, audit: audit([{ stage: "projection", classification: "projected", reasonCode: "upload-projected" }]) });
  }
}
