import type {
  CleanupCapability, CleanupClassification, ExecutionRetryProjection,
  ExecutionWorkspaceReference, InputArtifactReference, InputMaterializationCapability,
  MediaExecutionAuditEntry, MediaExecutionClassification,
  MediaExecutionDecision, MediaExecutionInput, MediaExecutionIssueCode,
  MediaExecutionReasonCode, MediaExecutionValidation, MediaProcessCapability,
  MediaProcessResult, OutputArtifactReference, PackagingCapability,
  PackageArtifactReference, WorkspaceCapability,
} from "./types";

export type MediaExecutionCapabilitySet = Readonly<{
  workspace: WorkspaceCapability;
  materialization: InputMaterializationCapability;
  process: MediaProcessCapability;
  packaging: PackagingCapability;
  cleanup: CleanupCapability;
}>;

const operations = ["clip-generation", "clip-export", "zip-export", "preview-generation"] as const;
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const retryFor = (value: MediaExecutionClassification): ExecutionRetryProjection =>
  value === "invalid" || value === "rejected" ? "retry-not-allowed" :
  value === "unavailable" ? "retry-safe" :
  value === "cancelled" ? "retry-requires-new-request" : "retry-external-policy";
const reasonFor = (value: MediaExecutionClassification): MediaExecutionReasonCode =>
  `execution-${value}` as MediaExecutionReasonCode;

export const validateMediaExecutionInput = (input: MediaExecutionInput): MediaExecutionValidation => {
  const issues: MediaExecutionIssueCode[] = [];
  if (!input || input.inputVersion !== "1.0") issues.push("input-malformed");
  if (!input?.request || input.request.requestVersion !== "1.0") issues.push("request-missing");
  if (!input?.request?.requestIdentity || !input.request.operationIdentity) issues.push("identity-missing");
  if (!operations.includes(input?.request?.operation)) issues.push("operation-unsupported");
  if (!Array.isArray(input?.request?.inputArtifacts) || input.request.inputArtifacts.length === 0)
    issues.push("input-artifact-missing");
  else {
    const refs = input.request.inputArtifacts.map((item) => item.opaqueInputArtifactReference);
    if (input.request.inputArtifacts.some((item) =>
      item.referenceVersion !== "1.0" || !item.opaqueInputArtifactReference || !item.ownershipReference))
      issues.push("input-artifact-invalid");
    if (new Set(refs).size !== refs.length) issues.push("input-artifact-duplicate");
  }
  const context = input?.context;
  if (!context || context.contextVersion !== "1.0" ||
    !context.authenticatedTenantReference || !context.executionTenantReference ||
    !context.authenticatedWorkspaceReference || !context.executionWorkspaceReference ||
    !context.authenticatedOwnershipReference || !context.operationOwnershipReference)
    issues.push("context-missing");
  const policy = input?.policy;
  if (!policy || policy.policyVersion !== "1.0" || !Array.isArray(policy.allowedOperations) ||
    !Number.isSafeInteger(policy.maximumInputArtifacts) || policy.maximumInputArtifacts < 1 ||
    policy.cancellation?.projectionVersion !== "1.0" || policy.timeout?.projectionVersion !== "1.0")
    issues.push("policy-invalid");
  return deepFreeze(issues.length ? {
    status: "invalid", issues: issues.map((issueCode, sequence) => ({ sequence, issueCode })),
  } : { status: "valid" });
};

const copyWorkspace = (value: ExecutionWorkspaceReference): ExecutionWorkspaceReference => ({ ...value });
const copyInputArtifact = (value: InputArtifactReference): InputArtifactReference => ({ ...value });
const copyOutput = (value: OutputArtifactReference): OutputArtifactReference => ({ ...value });
const copyRequest = (input: MediaExecutionInput): MediaExecutionInput => deepFreeze({
  inputVersion: input.inputVersion,
  request: { ...input.request, inputArtifacts: input.request.inputArtifacts.map(copyInputArtifact) },
  context: { ...input.context },
  policy: {
    ...input.policy, allowedOperations: [...input.policy.allowedOperations],
    cancellation: { ...input.policy.cancellation }, timeout: { ...input.policy.timeout },
  },
});

export class ReferenceMediaExecutionAdapter {
  readonly #capabilities: MediaExecutionCapabilitySet;
  constructor(capabilities: MediaExecutionCapabilitySet) { this.#capabilities = capabilities; }

  async execute(input: MediaExecutionInput): Promise<MediaExecutionDecision> {
    const validation = validateMediaExecutionInput(input);
    const operation = operations.includes(input?.request?.operation) ? input.request.operation : "clip-generation";
    if (validation.status === "invalid")
      return this.#decision(operation, "invalid", "execution-invalid", [], undefined, "not-required", []);
    const ownershipMismatch =
      input.context.authenticatedTenantReference !== input.context.executionTenantReference ||
      input.context.authenticatedWorkspaceReference !== input.context.executionWorkspaceReference ||
      input.context.authenticatedOwnershipReference !== input.context.operationOwnershipReference ||
      input.request.inputArtifacts.some((item) => item.ownershipReference !== input.context.authenticatedOwnershipReference);
    if (ownershipMismatch)
      return this.#decision(operation, "rejected", "ownership-mismatch", [], undefined, "not-required", []);
    if (!input.policy.allowedOperations.includes(operation) ||
      input.request.inputArtifacts.length > input.policy.maximumInputArtifacts ||
      (operation === "zip-export" && !input.request.packagingRequired))
      return this.#decision(operation, "rejected", "policy-violation", [], undefined, "not-required", []);
    if (input.policy.cancellation.classification === "cancelled")
      return this.#decision(operation, "cancelled", "execution-cancelled", [], undefined, "not-required", []);
    if (input.policy.timeout.classification === "timed-out")
      return this.#decision(operation, "timed-out", "execution-timed-out", [], undefined, "not-required", []);

    let workspaceResult;
    try { workspaceResult = await this.#capabilities.workspace.prepareWorkspace(copyRequest(input)); }
    catch { return this.#decision(operation, "unavailable", "workspace-failure", [], undefined, "not-required", []); }
    if (workspaceResult.status !== "completed")
      return this.#decision(operation, workspaceResult.status, "workspace-failure", [], undefined, "not-required", []);
    const workspace = copyWorkspace(workspaceResult.workspace);
    if (workspace.referenceVersion !== "1.0" || !workspace.opaqueWorkspaceReference ||
      workspace.ownershipReference !== input.context.authenticatedOwnershipReference)
      return this.#decision(operation, "rejected", "ownership-mismatch", [], undefined, "not-required", []);
    const entries: Omit<MediaExecutionAuditEntry, "entryVersion" | "sequence">[] = [
      this.#entry("workspace-prepare", operation, "completed", "execution-completed", "not-required"),
    ];

    let materialized;
    try {
      materialized = await this.#capabilities.materialization.materializeInput(deepFreeze({
        request: { ...input.request, inputArtifacts: input.request.inputArtifacts.map(copyInputArtifact) },
        workspace: copyWorkspace(workspace),
      }));
    } catch {
      return this.#finishWithCleanup(input, workspace, "unavailable", "materialization-failure", [], undefined, entries);
    }
    if (materialized.status !== "completed")
      return this.#finishWithCleanup(input, workspace, materialized.status, "materialization-failure", [], undefined, entries);
    if (materialized.artifacts.some((artifact) =>
      artifact.referenceVersion !== "1.0" || !artifact.opaqueInputArtifactReference ||
      artifact.ownershipReference !== input.context.authenticatedOwnershipReference))
      return this.#finishWithCleanup(input, workspace, "rejected", "ownership-mismatch", [], undefined, entries);
    entries.push(this.#entry("input-materialize", operation, "completed", "execution-completed", "not-required"));

    let processed: MediaProcessResult;
    try {
      processed = await this.#capabilities.process.executeMediaOperation(deepFreeze({
        operation, workspace: copyWorkspace(workspace),
        artifacts: materialized.artifacts.map(copyInputArtifact),
        cancellation: { ...input.policy.cancellation }, timeout: { ...input.policy.timeout },
      }));
    } catch {
      return this.#finishWithCleanup(input, workspace, "unavailable", "process-failure", [], undefined, entries);
    }
    if (processed.status !== "completed" && processed.status !== "accepted")
      return this.#finishWithCleanup(input, workspace, processed.status, "process-failure", [], undefined, entries);
    if (processed.outputs.some((artifact) =>
      artifact.referenceVersion !== "1.0" || !artifact.opaqueOutputArtifactReference ||
      artifact.ownershipReference !== input.context.authenticatedOwnershipReference))
      return this.#finishWithCleanup(input, workspace, "rejected", "ownership-mismatch", [], undefined, entries);
    const outputs = processed.outputs.map(copyOutput);
    entries.push(this.#entry("media-process", operation, processed.status, reasonFor(processed.status), "not-required"));

    let packageArtifact: PackageArtifactReference | undefined;
    if (input.request.packagingRequired) {
      let packaged;
      try {
        packaged = await this.#capabilities.packaging.packageArtifacts(deepFreeze({
          workspace: copyWorkspace(workspace), artifacts: outputs.map(copyOutput),
        }));
      } catch {
        return this.#finishWithCleanup(input, workspace, "unavailable", "packaging-failure", outputs, undefined, entries);
      }
      if (packaged.status !== "completed")
        return this.#finishWithCleanup(input, workspace, packaged.status, "packaging-failure", outputs, undefined, entries);
      if (packaged.packageArtifact.referenceVersion !== "1.0" ||
        !packaged.packageArtifact.opaquePackageArtifactReference ||
        packaged.packageArtifact.ownershipReference !== input.context.authenticatedOwnershipReference)
        return this.#finishWithCleanup(input, workspace, "rejected", "ownership-mismatch", outputs, undefined, entries);
      packageArtifact = { ...packaged.packageArtifact };
      entries.push(this.#entry("package-output", operation, "completed", "execution-completed", "not-required"));
    }
    entries.push(this.#entry("collect-output", operation, processed.status, reasonFor(processed.status), "not-required"));
    return this.#finishWithCleanup(input, workspace, processed.status, reasonFor(processed.status), outputs, packageArtifact, entries);
  }

  async #finishWithCleanup(
    input: MediaExecutionInput, workspace: ExecutionWorkspaceReference,
    classification: Exclude<MediaExecutionClassification, "invalid" | "cancelled" | "timed-out"> | "cancelled" | "timed-out",
    reasonCode: MediaExecutionReasonCode, outputs: readonly OutputArtifactReference[],
    packageArtifact: PackageArtifactReference | undefined,
    entries: Omit<MediaExecutionAuditEntry, "entryVersion" | "sequence">[],
  ): Promise<MediaExecutionDecision> {
    let cleanupClassification: CleanupClassification;
    try {
      const cleanup = await this.#capabilities.cleanup.cleanupExecution(deepFreeze({ workspace: copyWorkspace(workspace) }));
      cleanupClassification = cleanup.status;
    } catch { cleanupClassification = "unavailable"; }
    entries.push(this.#entry("cleanup", input.request.operation, classification, cleanupClassification === "completed" ? reasonCode : "cleanup-failure", cleanupClassification));
    return this.#decision(input.request.operation, classification, reasonCode, outputs, packageArtifact, cleanupClassification, entries);
  }

  #entry(
    stage: MediaExecutionAuditEntry["stage"], operation: MediaExecutionAuditEntry["operation"],
    classification: MediaExecutionClassification, reasonCode: MediaExecutionReasonCode,
    cleanupClassification: CleanupClassification,
  ): Omit<MediaExecutionAuditEntry, "entryVersion" | "sequence"> {
    return { stage, operation, classification, reasonCode, cleanupClassification, retryClassification: retryFor(classification) };
  }

  #decision(
    operation: MediaExecutionDecision["operation"], classification: MediaExecutionClassification,
    reasonCode: MediaExecutionReasonCode, outputs: readonly OutputArtifactReference[],
    packageArtifact: PackageArtifactReference | undefined, cleanupClassification: CleanupClassification,
    entries: readonly Omit<MediaExecutionAuditEntry, "entryVersion" | "sequence">[],
  ): MediaExecutionDecision {
    return deepFreeze({
      decisionVersion: "1.0", operation, classification, reasonCode,
      outputArtifactCount: outputs.length, packageArtifactAvailable: packageArtifact !== undefined,
      retryClassification: retryFor(classification), cleanupClassification,
      outputArtifacts: outputs.map(copyOutput),
      ...(packageArtifact ? { packageArtifact: { ...packageArtifact } } : {}),
      audit: {
        auditVersion: "1.0",
        entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
      },
    });
  }
}
