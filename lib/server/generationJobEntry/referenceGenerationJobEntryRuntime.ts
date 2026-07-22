import type {
  ServerCapabilityIdentity,
  ServerCompositionIdentity,
  ServerCompositionResult,
} from "../composition/types";
import type {
  WorkflowEntryContext,
  WorkflowEntryInputEnvelope,
  WorkflowEntryResult,
} from "../workflowEntry/types";
import type {
  GenerationJobAudit,
  GenerationJobAuditEntry,
  GenerationJobFailureClassification,
  GenerationJobRequest,
  GenerationJobResultProjection,
  GenerationJobValidation,
  GenerationJobValidationIssue,
} from "./types";

export type GenerationJobEntryValue =
  | null
  | boolean
  | number
  | string
  | readonly GenerationJobEntryValue[]
  | Readonly<{ [key: string]: GenerationJobEntryValue }>;

export type GenerationJobWorkflowEntryInvocation = Readonly<{
  invocationVersion: "1.0";
  envelope: WorkflowEntryInputEnvelope<Readonly<{ [key: string]: GenerationJobEntryValue }>>;
  context: WorkflowEntryContext;
  resumeReference?: Readonly<{
    referenceIdentity: string;
    referenceKind: "workflow" | "stage" | "reconciliation";
  }>;
}>;

export type GenerationJobWorkflowEntryCapability = Readonly<{
  identity: ServerCapabilityIdentity;
  execute(input: GenerationJobWorkflowEntryInvocation): Promise<WorkflowEntryResult<GenerationJobEntryValue>>;
}>;

export type ReferenceGenerationJobEntryDependencies = Readonly<{
  compositionIdentity: ServerCompositionIdentity;
  composition: ServerCompositionResult;
  workflowEntry: GenerationJobWorkflowEntryCapability;
}>;

const METADATA_ALLOWLIST = Object.freeze(["locale", "source-classification", "trace-classification"] as const);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copyValue = (value: GenerationJobEntryValue): GenerationJobEntryValue => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));
  }
  return value;
};

const copyRecord = (
  value: Readonly<{ [key: string]: GenerationJobEntryValue }>,
): Readonly<{ [key: string]: GenerationJobEntryValue }> =>
  Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));

const validationIssue = (
  issues: GenerationJobValidationIssue[],
  reasonCode: GenerationJobValidationIssue["reasonCode"],
  field: GenerationJobValidationIssue["field"],
): void => {
  issues.push({ reasonCode, field, sequence: issues.length });
};

export const validateGenerationJobEntryRequest = (
  request: GenerationJobRequest<Readonly<{ [key: string]: GenerationJobEntryValue }>>,
): GenerationJobValidation => {
  const issues: GenerationJobValidationIssue[] = [];
  if (request.requestVersion !== "1.0" || request.requestIdentity.length === 0 ||
    request.input === null || Array.isArray(request.input) || typeof request.input !== "object") {
    validationIssue(issues, "invalid-request", "request");
  }
  if (request.job.jobId.length === 0 || request.job.jobVersion.length === 0) {
    validationIssue(issues, "invalid-job-identity", "identity");
  }
  if (request.selection.selectionVersion !== "1.0" || request.selection.workflowId.length === 0 ||
    request.selection.workflowVersion.length === 0 || request.selection.capabilityId.length === 0 ||
    request.selection.capabilityVersion.length === 0) {
    validationIssue(issues, "invalid-selection", "selection");
  }
  if (request.context.contextVersion !== "1.0" || request.context.correlationIdentity.length === 0 ||
    request.context.attemptIdentity.length === 0 || !Number.isSafeInteger(request.context.attempt) ||
    request.context.attempt < 0) validationIssue(issues, "invalid-context", "context");
  const metadata = [...request.metadata.fields].sort((left, right) => left.declarationOrder - right.declarationOrder);
  const names = metadata.map((field) => field.name);
  if (request.metadata.metadataVersion !== "1.0" || names.some((name) => !METADATA_ALLOWLIST.includes(name as never)) ||
    new Set(names).size !== names.length || metadata.some((field, index) => field.declarationOrder !== index)) {
    validationIssue(issues, "invalid-metadata", "metadata");
  }
  if (!(["background", "normal", "expedited"] as const).includes(request.priority) ||
    !(["immediate-eligible", "deferred-eligible", "external-state-required", "manual-review-required"] as const)
      .includes(request.scheduling)) validationIssue(issues, "invalid-request", "request");
  if (request.resume !== undefined && (request.resume.referenceVersion !== "1.0" ||
    request.resume.referenceIdentity.length === 0 ||
    (request.resume.referenceKind === "job" && request.resume.referenceIdentity !== request.job.jobId))) {
    validationIssue(issues, "invalid-resume-reference", "resume");
  }
  if (request.context.cancellation.status === "requested" &&
    (request.context.cancellation.referenceVersion !== "1.0" ||
      request.context.cancellation.referenceIdentity.length === 0 ||
      request.context.cancellation.referenceIdentity !== request.job.jobId)) {
    validationIssue(issues, "invalid-cancellation-reference", "cancellation");
  }
  return deepFreeze(issues.length === 0 ? { status: "valid" } : { status: "invalid", issues });
};

const safeFailure = (
  classification: GenerationJobFailureClassification["classification"],
  reasonCode: string,
  safeMessageClassification: GenerationJobFailureClassification["safeMessageClassification"],
): GenerationJobFailureClassification => ({ classification, reasonCode, safeMessageClassification });

const sameIdentity = (left: ServerCapabilityIdentity, right: ServerCapabilityIdentity): boolean =>
  left.capabilityId === right.capabilityId && left.capabilityVersion === right.capabilityVersion;

export class ReferenceGenerationJobEntryRuntime {
  readonly #compositionIdentity: ServerCompositionIdentity;
  readonly #composition: ServerCompositionResult;
  readonly #workflowEntry: GenerationJobWorkflowEntryCapability;

  constructor(dependencies: ReferenceGenerationJobEntryDependencies) {
    this.#compositionIdentity = deepFreeze({ ...dependencies.compositionIdentity });
    this.#composition = dependencies.composition;
    this.#workflowEntry = dependencies.workflowEntry;
  }

  async execute(
    request: GenerationJobRequest<Readonly<{ [key: string]: GenerationJobEntryValue }>>,
  ): Promise<GenerationJobResultProjection<GenerationJobEntryValue>> {
    const entries: GenerationJobAuditEntry[] = [];
    const addAudit = (stage: GenerationJobAuditEntry["stage"], outcome: string, reasonCode: string): void => {
      entries.push({ entryVersion: "1.0", sequence: entries.length, stage, outcome, reasonCode });
    };
    const audit = (): GenerationJobAudit => deepFreeze({
      auditVersion: "1.0",
      job: { ...request.job },
      entries: entries.map((entry) => ({ ...entry })),
      reasonCodes: entries.map((entry) => entry.reasonCode),
    });
    const failed = (
      classification: GenerationJobFailureClassification["classification"],
      reasonCode: string,
      safeMessage: GenerationJobFailureClassification["safeMessageClassification"],
    ): GenerationJobResultProjection<GenerationJobEntryValue> => deepFreeze({
      resultVersion: "1.0",
      status: "failed",
      job: { ...request.job },
      failures: [safeFailure(classification, reasonCode, safeMessage)],
      audit: audit(),
    });

    const validation = validateGenerationJobEntryRequest(request);
    if (validation.status === "invalid") {
      addAudit("validation", "invalid", "generation-job-request-invalid");
      return failed("invalid", "generation-job-request-invalid", "request");
    }
    addAudit("validation", "valid", "generation-job-request-valid");
    if (request.context.cancellation.status === "requested") {
      addAudit("admission", "cancelled", "generation-job-cancelled");
      return deepFreeze({ resultVersion: "1.0", status: "cancelled", job: { ...request.job }, reasonCode: "generation-job-cancelled", audit: audit() });
    }
    if (this.#composition.identity.compositionId !== this.#compositionIdentity.compositionId ||
      this.#composition.identity.compositionVersion !== this.#compositionIdentity.compositionVersion ||
      this.#composition.status === "unavailable") {
      addAudit("selection", "unavailable", "server-composition-unavailable");
      return failed("unavailable", "server-composition-unavailable", "dependency");
    }
    if (this.#composition.status === "degraded" &&
      this.#composition.failures.some((failure) => failure.classification === "policy-rejected")) {
      addAudit("selection", "rejected", "server-composition-rejected");
      return deepFreeze({
        resultVersion: "1.0",
        status: "rejected",
        job: { ...request.job },
        failures: [safeFailure("unauthorized", "server-composition-rejected", "policy")],
        audit: audit(),
      });
    }
    const exposed = this.#composition.capabilities.workflowEntry;
    if (exposed.status === "unavailable" || !sameIdentity(exposed.identity, this.#workflowEntry.identity) ||
      exposed.identity.capabilityId !== request.selection.capabilityId ||
      exposed.identity.capabilityVersion !== request.selection.capabilityVersion) {
      addAudit("selection", "unavailable", "workflow-entry-capability-unavailable");
      return failed("unavailable", "workflow-entry-capability-unavailable", "dependency");
    }
    addAudit("selection", "selected", "workflow-entry-capability-selected");
    const metadata = [...request.metadata.fields]
      .sort((left, right) => left.declarationOrder - right.declarationOrder)
      .map((field) => ({ name: field.name, value: field.value }));
    const invocation: GenerationJobWorkflowEntryInvocation = deepFreeze({
      invocationVersion: "1.0",
      envelope: {
        envelopeVersion: "1.0",
        request: { requestId: request.requestIdentity, requestVersion: "1.0" },
        selection: {
          selectionVersion: "1.0",
          workflow: { workflowId: request.selection.workflowId, workflowVersion: request.selection.workflowVersion },
          mode: request.selection.mode,
        },
        input: { inputVersion: "1.0", payload: copyRecord(request.input) },
        metadata,
        idempotency: {
          identityVersion: "1.0",
          keyIdentity: request.job.jobId,
          requestFingerprintIdentity: request.requestIdentity,
          replayClassification: "new",
        },
      },
      context: {
        contextVersion: "1.0",
        callerClassification: request.context.callerClassification,
        requestClassification: request.resume === undefined ? "start" : request.resume.referenceKind === "reconciliation" ? "reconcile" : "resume",
        executionMode: request.context.executionClassification === "interactive" ? "synchronous" : "asynchronous",
        correlationIdentity: request.context.correlationIdentity,
        attempt: {
          attemptVersion: "1.0",
          attempt: request.context.attempt,
          attemptIdentity: request.context.attemptIdentity,
        },
        cancellation: { status: "not-requested" },
      },
      ...(request.resume === undefined ? {} : {
        resumeReference: {
          referenceIdentity: request.resume.referenceIdentity,
          referenceKind: request.resume.referenceKind === "job" ? "workflow" : request.resume.referenceKind,
        },
      }),
    });

    let dependencyResult: unknown;
    try {
      dependencyResult = await this.#workflowEntry.execute(invocation);
    } catch {
      addAudit("projection", "failed", "workflow-entry-dependency-failed");
      return failed("unavailable", "workflow-entry-dependency-failed", "dependency");
    }
    if (dependencyResult === null || typeof dependencyResult !== "object" || !("status" in dependencyResult)) {
      addAudit("projection", "failed", "workflow-entry-result-unsupported");
      return failed("internal", "workflow-entry-result-unsupported", "internal");
    }
    const result = dependencyResult as WorkflowEntryResult<GenerationJobEntryValue>;
    if (result.status === "accepted") {
      addAudit("projection", "accepted", "generation-job-accepted");
      return deepFreeze({ resultVersion: "1.0", status: "accepted", job: { ...request.job }, scheduling: request.scheduling, audit: audit() });
    }
    if (result.status === "completed") {
      addAudit("projection", "completed", "generation-job-completed");
      return deepFreeze({ resultVersion: "1.0", status: "completed", job: { ...request.job }, output: copyValue(result.output), audit: audit() });
    }
    if (result.status === "partial") {
      addAudit("projection", "partial", "generation-job-partial");
      return deepFreeze({
        resultVersion: "1.0",
        status: "partial",
        job: { ...request.job },
        output: copyValue(result.output),
        failures: result.issues.map((issue) => safeFailure(issue.classification, issue.reasonCode, "dependency")),
        audit: audit(),
      });
    }
    if (result.status === "cancelled") {
      addAudit("projection", "cancelled", "generation-job-cancelled");
      return deepFreeze({ resultVersion: "1.0", status: "cancelled", job: { ...request.job }, reasonCode: "generation-job-cancelled", audit: audit() });
    }
    if (result.status === "recovery-required") {
      addAudit("projection", "recovery-required", "generation-job-recovery-required");
      return deepFreeze({
        resultVersion: "1.0",
        status: "recovery-required",
        job: { ...request.job },
        reference: {
          referenceVersion: "1.0",
          referenceIdentity: result.reconciliation.identity.referenceIdentity,
          referenceKind: result.reconciliation.identity.referenceKind,
        },
        reasonCode: result.reconciliation.reasonCode,
        audit: audit(),
      });
    }
    if (result.status === "rejected") {
      addAudit("projection", "rejected", "generation-job-rejected");
      return deepFreeze({
        resultVersion: "1.0",
        status: "rejected",
        job: { ...request.job },
        failures: result.errors.map((error) => safeFailure(error.classification, error.reasonCode, "policy")),
        audit: audit(),
      });
    }
    if (result.status === "failed") {
      addAudit("projection", "failed", "generation-job-failed");
      return deepFreeze({
        resultVersion: "1.0",
        status: "failed",
        job: { ...request.job },
        failures: result.errors.map((error) => safeFailure(error.classification, error.reasonCode, "dependency")),
        audit: audit(),
      });
    }
    addAudit("projection", "failed", "workflow-entry-result-unsupported");
    return failed("internal", "workflow-entry-result-unsupported", "internal");
  }
}
