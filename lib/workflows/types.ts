export type WorkflowVersion = string;

export type WorkflowIdentity = Readonly<{
  workflowId: string;
  workflowVersion: WorkflowVersion;
}>;

export type WorkflowStageIdentity = Readonly<{
  workflow: WorkflowIdentity;
  stageId: string;
  stageVersion: string;
}>;

export type WorkflowPipelineReference = Readonly<{
  referenceVersion: "1.0";
  pipelineId: string;
  pipelineVersion: string;
  operationId: string;
  operationVersion: string;
  bindingId: string;
  bindingVersion: string;
}>;

export type WorkflowStageDefinition = Readonly<{
  identity: WorkflowStageIdentity;
  order: number;
  requirement: "required" | "optional";
  terminal: boolean;
  pipeline: WorkflowPipelineReference;
}>;

export type WorkflowStageDependency = Readonly<{
  predecessorStageId: string;
  successorStageId: string;
}>;

export type WorkflowDefinition = Readonly<{
  contractVersion: "1.0";
  identity: WorkflowIdentity;
  stages: readonly WorkflowStageDefinition[];
  dependencies: readonly WorkflowStageDependency[];
}>;

export type WorkflowCancellationMarker =
  | Readonly<{ status: "not-requested" }>
  | Readonly<{
      status: "requested";
      scope: "workflow" | "current-stage" | "remaining-stages";
      reasonCode: "workflow-cancelled" | "caller-cancelled" | "policy-cancelled";
    }>;

export type WorkflowContext = Readonly<{
  contextVersion: "1.0";
  workflowRef: string;
  attempt: number;
  baselineTime: string;
  cancellation: WorkflowCancellationMarker;
}>;

export type WorkflowInput<TInput> = Readonly<{
  inputVersion: "1.0";
  workflow: WorkflowIdentity;
  payload: Readonly<TInput>;
  context: WorkflowContext;
}>;

export type WorkflowStageInput<TInput> = Readonly<{
  inputVersion: "1.0";
  stage: WorkflowStageIdentity;
  payload: Readonly<TInput>;
  context: WorkflowContext;
}>;

export type WorkflowStageOutput<TOutput> = Readonly<{
  outputVersion: "1.0";
  stage: WorkflowStageIdentity;
  payload: Readonly<TOutput>;
}>;

export type WorkflowOutput<TOutput> = Readonly<{
  outputVersion: "1.0";
  workflow: WorkflowIdentity;
  payload: Readonly<TOutput>;
}>;

export type WorkflowStageState =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"
  | "recovery-required";

export type WorkflowNonTerminalState = "pending" | "running";

export type WorkflowTerminalState =
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "recovery-required";

export type WorkflowState = Readonly<{
  stateVersion: "1.0";
  workflow: WorkflowIdentity;
  lifecycle: WorkflowNonTerminalState | WorkflowTerminalState;
  revision: number;
  currentStageId?: string;
  completedStageIds: readonly string[];
  failedStageIds: readonly string[];
  skippedStageIds: readonly string[];
  stageStates: readonly Readonly<{
    stageId: string;
    state: WorkflowStageState;
  }>[];
}>;

export type WorkflowTransition = Readonly<{
  transitionVersion: "1.0";
  workflow: WorkflowIdentity;
  stageId: string;
  priorState: WorkflowStageState;
  nextState: WorkflowStageState;
  reasonCode: string;
  sequence: number;
  expectedWorkflowRevision: number;
}>;

export type WorkflowRetryRecommendation =
  | Readonly<{ recommendation: "do-not-retry" }>
  | Readonly<{ recommendation: "retry"; retryClass: "transient" }>
  | Readonly<{ recommendation: "wait"; retryClass: "external-state" }>;

export type WorkflowReconciliationRecommendation =
  | Readonly<{ recommendation: "none" }>
  | Readonly<{ recommendation: "reconcile"; reasonCode: "outcome-unknown" | "authority-conflict" }>
  | Readonly<{ recommendation: "manual-review"; reasonCode: "corrupted" | "policy-required" }>;

export type WorkflowValidationIssue = Readonly<{
  reasonCode:
    | "invalid-workflow"
    | "invalid-stage"
    | "duplicate-stage"
    | "invalid-dependency"
    | "dependency-cycle"
    | "invalid-order"
    | "invalid-pipeline-reference"
    | "invalid-transition"
    | "terminal-preserved";
  field: "workflow" | "stage" | "dependency" | "order" | "pipeline-reference" | "transition";
  sequence: number;
}>;

export type WorkflowValidationResult =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly WorkflowValidationIssue[];
    }>;

export type WorkflowAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stageId: string;
  state: WorkflowStageState;
  reasonCode: string;
}>;

export type WorkflowAudit = Readonly<{
  auditVersion: "1.0";
  workflow: WorkflowIdentity;
  initialStageId: string;
  finalStageId: string;
  entries: readonly WorkflowAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type WorkflowResultBase = Readonly<{
  resultVersion: "1.0";
  workflow: WorkflowIdentity;
  retry: WorkflowRetryRecommendation;
  reconciliation: WorkflowReconciliationRecommendation;
  audit: WorkflowAudit;
}>;

export type WorkflowCompletedResult<TOutput> = WorkflowResultBase & Readonly<{
  status: "completed";
  output: WorkflowOutput<TOutput>;
}>;

export type WorkflowPartialResult<TOutput> = WorkflowResultBase & Readonly<{
  status: "partial";
  output: WorkflowOutput<TOutput>;
  failedStageIds: readonly string[];
  skippedStageIds: readonly string[];
}>;

export type WorkflowFailedResult = WorkflowResultBase & Readonly<{
  status: "failed";
  failedStageId: string;
}>;

export type WorkflowCancelledResult = WorkflowResultBase & Readonly<{
  status: "cancelled";
  cancelledStageId?: string;
}>;

export type WorkflowRecoveryRequiredResult = WorkflowResultBase & Readonly<{
  status: "recovery-required";
  recoveryStageId: string;
}>;

export type WorkflowResult<TOutput> =
  | WorkflowCompletedResult<TOutput>
  | WorkflowPartialResult<TOutput>
  | WorkflowFailedResult
  | WorkflowCancelledResult
  | WorkflowRecoveryRequiredResult;
