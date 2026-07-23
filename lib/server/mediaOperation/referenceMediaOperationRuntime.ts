import type {
  MediaOperationAudit,
  MediaOperationAuditEntry,
  MediaOperationCapability,
  MediaOperationCapabilityResult,
  MediaOperationClassification,
  MediaOperationDecision,
  MediaOperationInput,
  MediaOperationIssueCode,
  MediaOperationReasonCode,
  MediaOperationValidation,
} from "./types";

const operations: readonly MediaOperationClassification[] = [
  "clip-generation",
  "clip-export",
  "zip-export",
  "preview-generation",
];

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const audit = (
  entries: readonly Omit<MediaOperationAuditEntry, "entryVersion" | "sequence">[],
): MediaOperationAudit => deepFreeze({
  auditVersion: "1.0",
  entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
  reasonCodes: entries.map((entry) => entry.reasonCode),
});

const operationOrNone = (input: MediaOperationInput): MediaOperationClassification | "none" =>
  operations.includes(input.request?.operation) ? input.request.operation : "none";

const copyInput = (input: MediaOperationInput): MediaOperationInput => deepFreeze({
  inputVersion: input.inputVersion,
  request: {
    ...input.request,
    opaqueUploadReferences: [...input.request.opaqueUploadReferences],
    opaqueOutputReferences: [...input.request.opaqueOutputReferences],
  },
  context: {
    ...input.context,
    sensitiveProjections: input.context.sensitiveProjections.map((projection) => ({ ...projection })),
  },
  policy: { ...input.policy, allowedOperations: [...input.policy.allowedOperations] },
});

export const validateMediaOperationInput = (input: MediaOperationInput): MediaOperationValidation => {
  const issues: MediaOperationIssueCode[] = [];
  if (!input || typeof input !== "object" || input.inputVersion !== "1.0") issues.push("input-malformed");
  const request = input?.request;
  if (!request || typeof request !== "object" || request.requestVersion !== "1.0") issues.push("request-missing");
  if (!request || typeof request.requestIdentity !== "string" || request.requestIdentity.length === 0)
    issues.push("request-identity-missing");
  if (!request || typeof request.operationIdentity !== "string" || request.operationIdentity.length === 0)
    issues.push("operation-missing");
  if (!request || typeof request.operation !== "string" || request.operation.length === 0) issues.push("operation-missing");
  else if (!operations.includes(request.operation)) issues.push("operation-unsupported");
  if (!request || !Array.isArray(request.opaqueUploadReferences) || request.opaqueUploadReferences.length === 0)
    issues.push("upload-context-missing");
  else {
    if (request.opaqueUploadReferences.some((reference) => typeof reference !== "string" || reference.length === 0))
      issues.push("upload-reference-invalid");
    if (new Set(request.opaqueUploadReferences).size !== request.opaqueUploadReferences.length)
      issues.push("request-duplicate");
  }
  if (!request || !Array.isArray(request.opaqueOutputReferences)) issues.push("input-malformed");
  const context = input?.context;
  if (!context || context.contextVersion !== "1.0" ||
    typeof context.tenantReference !== "string" || context.tenantReference.length === 0 ||
    typeof context.workspaceReference !== "string" || context.workspaceReference.length === 0 ||
    typeof context.ownershipReference !== "string" || context.ownershipReference.length === 0 ||
    !Array.isArray(context.sensitiveProjections)) issues.push("auth-context-missing");
  const policy = input?.policy;
  if (!policy || policy.policyVersion !== "1.0" || !Array.isArray(policy.allowedOperations) ||
    !Number.isSafeInteger(policy.maximumUploadReferences) || policy.maximumUploadReferences < 1 ||
    typeof policy.outputRequired !== "boolean") issues.push("policy-invalid");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : {
    status: "invalid",
    issues: issues.map((issueCode, sequence) => ({ sequence, issueCode })),
  });
};

const terminalDecision = (
  classification: "failed" | "rejected" | "unavailable",
  operation: MediaOperationClassification | "none",
  reasonCode: MediaOperationReasonCode,
  resultAudit: MediaOperationAudit,
): MediaOperationDecision => deepFreeze({
  decisionVersion: "1.0",
  status: classification,
  operation,
  reasonCode,
  retryClassification: classification === "unavailable" ? "retryable" : "not-retryable",
  audit: resultAudit,
});

const resultReasonMatches = (result: MediaOperationCapabilityResult): boolean => {
  const expected: Record<MediaOperationCapabilityResult["classification"], MediaOperationReasonCode> = {
    accepted: "media-operation-accepted",
    completed: "media-operation-completed",
    failed: "media-operation-failed",
    rejected: "media-operation-rejected",
    unavailable: "media-operation-unavailable",
  };
  return expected[result.classification] === result.reasonCode;
};

export class ReferenceMediaOperationRuntime {
  readonly #capability: MediaOperationCapability;

  constructor(capability: MediaOperationCapability) {
    this.#capability = capability;
  }

  async execute(input: MediaOperationInput): Promise<MediaOperationDecision> {
    const validation = validateMediaOperationInput(input);
    const operation = operationOrNone(input);
    if (validation.status === "invalid") return deepFreeze({
      decisionVersion: "1.0", status: "invalid", operation: "none",
      reasonCode: "media-operation-invalid", retryClassification: "not-retryable",
      audit: audit([{
        stage: "validation", classification: "invalid", operation,
        reasonCode: "media-operation-invalid",
      }]),
    });
    if (!input.policy.allowedOperations.includes(input.request.operation) ||
      input.request.opaqueUploadReferences.length > input.policy.maximumUploadReferences ||
      (input.policy.outputRequired && input.request.opaqueOutputReferences.length === 0))
      return terminalDecision("rejected", operation, "media-operation-policy-violation", audit([{
        stage: "policy", classification: "rejected", operation,
        reasonCode: "media-operation-policy-violation",
      }]));
    if (input.context.sensitiveProjections.some((projection) =>
      projection.tenantClassification !== "matched" ||
      projection.workspaceClassification !== "matched" ||
      !projection.ownershipVerified))
      return terminalDecision("rejected", operation, "media-operation-ownership-mismatch", audit([{
        stage: "ownership", classification: "rejected", operation,
        reasonCode: "media-operation-ownership-mismatch",
      }]));
    let result: MediaOperationCapabilityResult;
    try {
      result = await this.#capability.execute(copyInput(input));
    } catch {
      return terminalDecision("unavailable", operation, "media-operation-unavailable", audit([{
        stage: "capability", classification: "unavailable", operation,
        reasonCode: "media-operation-unavailable",
      }]));
    }
    if (result.resultVersion !== "1.0" || !resultReasonMatches(result) ||
      !Array.isArray(result.opaqueArtifactReferences) ||
      result.opaqueArtifactReferences.some((reference) => typeof reference !== "string" || reference.length === 0))
      return terminalDecision("unavailable", operation, "media-operation-unavailable", audit([{
        stage: "projection", classification: "unavailable", operation,
        reasonCode: "media-operation-unavailable",
      }]));
    const resultAudit = audit([{
      stage: "projection" as const,
      classification: result.classification,
      operation,
      reasonCode: result.reasonCode,
    }]);
    if (result.classification === "accepted" || result.classification === "completed") return deepFreeze({
      decisionVersion: "1.0", status: result.classification, operation: input.request.operation,
      opaqueArtifactReferences: [...result.opaqueArtifactReferences], audit: resultAudit,
    });
    return terminalDecision(result.classification, operation, result.reasonCode, resultAudit);
  }
}
