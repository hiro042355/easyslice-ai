export type OperationIdentity = Readonly<{
  operationId: string;
  operationVersion: string;
}>;

export type OperationPipelineStageId = string;

export type OperationPipelineStageDefinition = Readonly<{
  stageId: OperationPipelineStageId;
  stageVersion: "1.0";
  order: number;
  terminal: boolean;
}>;

export type OperationPipelineDependency = Readonly<{
  predecessorStageId: OperationPipelineStageId;
  successorStageId: OperationPipelineStageId;
}>;

export type OperationPipelineDefinition = Readonly<{
  contractVersion: "1.0";
  pipelineId: string;
  pipelineVersion: string;
  operation: OperationIdentity;
  stages: readonly OperationPipelineStageDefinition[];
  dependencies: readonly OperationPipelineDependency[];
}>;

export type OperationPipelineCancellationMarker =
  | Readonly<{ status: "active" }>
  | Readonly<{ status: "cancelled"; reasonCode: "operation-cancelled" }>;

export type OperationPipelineContext = Readonly<{
  contextVersion: "1.0";
  operationRef: string;
  attempt: number;
  baselineTime: string;
  cancellation: OperationPipelineCancellationMarker;
}>;

export type OperationPipelineInput<TInput> = Readonly<{
  inputVersion: "1.0";
  operation: OperationIdentity;
  initialStageId: OperationPipelineStageId;
  payload: Readonly<TInput>;
  context: OperationPipelineContext;
}>;

export type OperationPipelineState<TState> = Readonly<{
  stateVersion: "1.0";
  operation: OperationIdentity;
  currentStageId: OperationPipelineStageId;
  revision: number;
  terminal: boolean;
  value: Readonly<TState>;
}>;

export type OperationPipelineTransition = Readonly<{
  transitionVersion: "1.0";
  operation: OperationIdentity;
  fromStageId: OperationPipelineStageId;
  toStageId: OperationPipelineStageId;
  expectedRevision: number;
}>;

export type OperationPipelineValidationIssue = Readonly<{
  reasonCode:
    | "invalid-operation"
    | "invalid-stage"
    | "duplicate-stage"
    | "invalid-dependency"
    | "dependency-cycle"
    | "invalid-order"
    | "invalid-transition"
    | "terminal-preserved";
  field: "operation" | "stage" | "dependency" | "order" | "transition";
}>;

export type OperationPipelineValidationResult =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly OperationPipelineValidationIssue[];
    }>;

export type OperationPipelineRetryRecommendation =
  | Readonly<{ recommendation: "do-not-retry" }>
  | Readonly<{ recommendation: "retry"; retryClass: "transient" }>
  | Readonly<{ recommendation: "wait"; retryClass: "external-state" }>
  | Readonly<{ recommendation: "reconcile"; retryClass: "outcome-unknown" }>;

export type OperationPipelineAudit = Readonly<{
  auditVersion: "1.0";
  operation: OperationIdentity;
  pipelineId: string;
  pipelineVersion: string;
  initialStageId: OperationPipelineStageId;
  finalStageId: OperationPipelineStageId;
  visitedStageIds: readonly OperationPipelineStageId[];
  transitionCount: number;
  reasonCodes: readonly string[];
}>;

export type OperationPipelineOutput<TOutput> = Readonly<{
  outputVersion: "1.0";
  operation: OperationIdentity;
  finalStageId: OperationPipelineStageId;
  payload: Readonly<TOutput>;
  retry: OperationPipelineRetryRecommendation;
  audit: OperationPipelineAudit;
}>;

export type OperationPipelineResult<TOutput> =
  | Readonly<{ status: "completed"; output: OperationPipelineOutput<TOutput> }>
  | Readonly<{
      status: "cancelled" | "failed" | "reconciliation-required";
      finalStageId: OperationPipelineStageId;
      retry: OperationPipelineRetryRecommendation;
      audit: OperationPipelineAudit;
    }>;
