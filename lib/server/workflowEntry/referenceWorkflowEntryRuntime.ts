import type {
  WorkflowDefinition,
  WorkflowResult,
} from "../../workflows/types";
import type {
  WorkflowEntryAudit,
  WorkflowEntryAuditEntry,
  WorkflowEntryAuthorizationDecision,
  WorkflowEntryContext,
  WorkflowEntryErrorClassification,
  WorkflowEntryInputEnvelope,
  WorkflowEntryReconciliationRequest,
  WorkflowEntryResult,
  WorkflowEntryValidationIssue,
  WorkflowEntryValidationResult,
  WorkflowInvocationRequest,
} from "./types";

export type WorkflowEntryValue =
  | null
  | boolean
  | number
  | string
  | readonly WorkflowEntryValue[]
  | Readonly<{ [key: string]: WorkflowEntryValue }>;

export type WorkflowEntryRegistryCapability = Readonly<{
  getByIdentity(identity: Readonly<{ workflowId: string; workflowVersion: string }>): WorkflowDefinition | undefined;
  snapshot(): Readonly<{ snapshotVersion: "1.0"; definitions: readonly WorkflowDefinition[] }>;
}>;

export type WorkflowEntryRuntimeCapability = Readonly<{
  execute(
    definition: WorkflowDefinition,
    input: WorkflowInvocationRequest<Readonly<{ [key: string]: WorkflowEntryValue }>>,
  ): Promise<WorkflowResult<WorkflowEntryValue>>;
}>;

export type WorkflowEntryRuntimeDependencies = Readonly<{
  registry: WorkflowEntryRegistryCapability;
  workflowRuntime: WorkflowEntryRuntimeCapability;
}>;

export type WorkflowEntryExecutionRequest = Readonly<{
  envelope: WorkflowEntryInputEnvelope<Readonly<{ [key: string]: WorkflowEntryValue }>>;
  context: WorkflowEntryContext;
  authorization: WorkflowEntryAuthorizationDecision;
  resumeReference?: Readonly<{
    referenceIdentity: string;
    referenceKind: "workflow" | "stage" | "reconciliation";
  }>;
}>;

const copyValue = (value: WorkflowEntryValue): WorkflowEntryValue => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));
  }
  return value;
};

const copyRecord = (
  value: Readonly<{ [key: string]: WorkflowEntryValue }>,
): Readonly<{ [key: string]: WorkflowEntryValue }> =>
  Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const issue = (
  issues: WorkflowEntryValidationIssue[],
  reasonCode: WorkflowEntryValidationIssue["reasonCode"],
  field: WorkflowEntryValidationIssue["field"],
): void => {
  issues.push({ reasonCode, field, sequence: issues.length });
};

export const validateWorkflowEntryRequest = (
  request: WorkflowEntryExecutionRequest,
): WorkflowEntryValidationResult => {
  const issues: WorkflowEntryValidationIssue[] = [];
  const { envelope, context } = request;
  if (envelope.envelopeVersion !== "1.0" || envelope.request.requestVersion !== "1.0" ||
    envelope.request.requestId.length === 0) issue(issues, "invalid-request", "request");
  if (envelope.selection.selectionVersion !== "1.0" ||
    envelope.selection.workflow.workflowId.length === 0 ||
    envelope.selection.workflow.workflowVersion.length === 0) issue(issues, "invalid-selection", "selection");
  if (envelope.input.inputVersion !== "1.0") issue(issues, "invalid-input", "input");
  const metadataNames = envelope.metadata.map((field) => field.name);
  if (metadataNames.some((name) => name.length === 0) || new Set(metadataNames).size !== metadataNames.length ||
    metadataNames.some((name, index) => index > 0 && (metadataNames[index - 1] ?? "").localeCompare(name) > 0)) {
    issue(issues, "invalid-metadata", "metadata");
  }
  if (context.contextVersion !== "1.0" || context.correlationIdentity.length === 0 ||
    context.attempt.attemptVersion !== "1.0" || !Number.isSafeInteger(context.attempt.attempt) ||
    context.attempt.attempt < 0 || context.attempt.attemptIdentity.length === 0) {
    issue(issues, "invalid-context", "context");
  }
  if (envelope.idempotency.identityVersion !== "1.0" || envelope.idempotency.keyIdentity.length === 0 ||
    envelope.idempotency.requestFingerprintIdentity.length === 0) issue(issues, "invalid-idempotency", "idempotency");
  if (context.requestClassification === "resume" && request.resumeReference === undefined) {
    issue(issues, "invalid-resume-reference", "reference");
  }
  if (context.requestClassification === "reconcile" &&
    (request.resumeReference === undefined || request.resumeReference.referenceKind !== "reconciliation")) {
    issue(issues, "invalid-reconciliation-reference", "reference");
  }
  return deepFreeze(issues.length === 0 ? { status: "valid" } : { status: "invalid", issues });
};

const selectDefinition = (
  registry: WorkflowEntryRegistryCapability,
  request: WorkflowEntryExecutionRequest,
): WorkflowDefinition | undefined => {
  const selection = request.envelope.selection;
  if (selection.mode === "exact") return registry.getByIdentity(selection.workflow);
  return registry.snapshot().definitions
    .filter((definition) => definition.identity.workflowId === selection.workflow.workflowId)
    .sort((left, right) => right.identity.workflowVersion.localeCompare(left.identity.workflowVersion))[0];
};

const safeError = (
  classification: WorkflowEntryErrorClassification["classification"],
  reasonCode: string,
  retryable = false,
): WorkflowEntryErrorClassification => ({ classification, reasonCode, retryable });

export class ReferenceWorkflowEntryRuntime {
  readonly #registry: WorkflowEntryRegistryCapability;
  readonly #workflowRuntime: WorkflowEntryRuntimeCapability;

  constructor(dependencies: WorkflowEntryRuntimeDependencies) {
    this.#registry = dependencies.registry;
    this.#workflowRuntime = dependencies.workflowRuntime;
  }

  async execute(request: WorkflowEntryExecutionRequest): Promise<WorkflowEntryResult<WorkflowEntryValue>> {
    const entries: WorkflowEntryAuditEntry[] = [];
    const addAudit = (stage: WorkflowEntryAuditEntry["stage"], outcome: string, reasonCode: string): void => {
      entries.push({ entryVersion: "1.0", sequence: entries.length, stage, outcome, reasonCode });
    };
    const audit = (workflow = request.envelope.selection.workflow): WorkflowEntryAudit => deepFreeze({
      auditVersion: "1.0",
      request: { ...request.envelope.request },
      workflow: { ...workflow },
      entries: entries.map((entry) => ({ ...entry })),
      reasonCodes: entries.map((entry) => entry.reasonCode),
    });
    const base = (workflow = request.envelope.selection.workflow) => ({
      resultVersion: "1.0" as const,
      request: { ...request.envelope.request },
      workflow: { ...workflow },
      audit: audit(workflow),
    });

    const validation = validateWorkflowEntryRequest(request);
    if (validation.status === "invalid") {
      addAudit("validation", "rejected", "entry-validation-failed");
      return deepFreeze({ ...base(), status: "failed", errors: [safeError("invalid", "entry-validation-failed")] });
    }
    addAudit("validation", "accepted", "entry-validation-succeeded");
    if (request.authorization.decision !== "allow") {
      addAudit("authorization", "rejected", request.authorization.reasonCode);
      return deepFreeze({
        ...base(),
        status: "rejected",
        authorization: { ...request.authorization },
        errors: [safeError("unauthorized", "entry-authorization-rejected")],
      });
    }
    addAudit("authorization", "accepted", "entry-authorization-allowed");
    if (request.envelope.idempotency.replayClassification === "semantic-conflict") {
      addAudit("selection", "rejected", "entry-semantic-conflict");
      return deepFreeze({ ...base(), status: "failed", errors: [safeError("conflict", "entry-semantic-conflict")] });
    }

    const definition = selectDefinition(this.#registry, request);
    if (definition === undefined) {
      const reasonCode = request.envelope.selection.mode === "exact"
        ? "workflow-version-not-found"
        : "workflow-not-found";
      addAudit("selection", "not-found", reasonCode);
      return deepFreeze({ ...base(), status: "failed", errors: [safeError("not-found", reasonCode)] });
    }
    addAudit("selection", "selected", request.envelope.idempotency.replayClassification === "replay"
      ? "workflow-replay-selected"
      : "workflow-selected");
    if (request.context.cancellation.status === "requested") {
      addAudit("projection", "cancelled", request.context.cancellation.reasonCode);
      return deepFreeze({ ...base(definition.identity), status: "cancelled", reasonCode: "entry-cancelled" });
    }

    addAudit("invocation", "started", "workflow-invocation-started");
    const workflowResult = await this.#workflowRuntime.execute(definition, {
      invocationVersion: "1.0",
      workflow: { ...definition.identity },
      input: copyRecord(request.envelope.input.payload),
      correlationIdentity: request.context.correlationIdentity,
      attempt: { ...request.context.attempt },
      cancellation: { ...request.context.cancellation },
    });
    addAudit("invocation", "completed", `workflow-${workflowResult.status}`);

    if (workflowResult.status === "completed") {
      addAudit("projection", "completed", "entry-completed");
      return deepFreeze({ ...base(definition.identity), status: "completed", output: copyValue(workflowResult.output.payload) });
    }
    if (workflowResult.status === "partial") {
      addAudit("projection", "partial", "entry-partial");
      return deepFreeze({
        ...base(definition.identity),
        status: "partial",
        output: copyValue(workflowResult.output.payload),
        issues: workflowResult.failedStageIds.map(() => safeError("unavailable", "workflow-optional-stage-failed", true)),
      });
    }
    if (workflowResult.status === "cancelled") {
      addAudit("projection", "cancelled", "entry-cancelled");
      return deepFreeze({ ...base(definition.identity), status: "cancelled", reasonCode: "entry-cancelled" });
    }
    if (workflowResult.status === "recovery-required") {
      const recommendation: WorkflowEntryReconciliationRequest = {
        requestVersion: "1.0",
        identity: {
          resumeVersion: "1.0",
          referenceIdentity: request.resumeReference?.referenceIdentity ?? request.context.correlationIdentity,
          referenceKind: "reconciliation",
        },
        recommendation: workflowResult.reconciliation.recommendation === "manual-review" ? "manual-review" : "reconcile",
        reasonCode: workflowResult.reconciliation.recommendation === "manual-review" ? "corrupted" : "outcome-unknown",
      };
      addAudit("projection", "recovery-required", "entry-recovery-required");
      return deepFreeze({ ...base(definition.identity), status: "recovery-required", reconciliation: recommendation });
    }
    addAudit("projection", "failed", "entry-workflow-failed");
    return deepFreeze({
      ...base(definition.identity),
      status: "failed",
      errors: [safeError(
        workflowResult.retry.recommendation === "do-not-retry" ? "internal" : "unavailable",
        "entry-workflow-failed",
        workflowResult.retry.recommendation !== "do-not-retry",
      )],
    });
  }
}
