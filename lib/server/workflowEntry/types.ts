import type { WorkflowIdentity } from "../../workflows/types";

export type WorkflowEntryRequestIdentity = Readonly<{
  requestId: string;
  requestVersion: "1.0";
}>;

export type WorkflowEntryIdempotencyIdentity = Readonly<{
  identityVersion: "1.0";
  keyIdentity: string;
  requestFingerprintIdentity: string;
  replayClassification: "new" | "replay" | "semantic-conflict";
}>;

export type WorkflowEntryAttemptIdentity = Readonly<{
  attemptVersion: "1.0";
  attempt: number;
  attemptIdentity: string;
}>;

export type WorkflowEntryResumeIdentity = Readonly<{
  resumeVersion: "1.0";
  referenceIdentity: string;
  referenceKind: "workflow" | "stage" | "reconciliation";
}>;

export type WorkflowEntrySelection = Readonly<{
  selectionVersion: "1.0";
  workflow: WorkflowIdentity;
  mode: "exact" | "latest-compatible";
}>;

export type WorkflowEntryMetadataField = Readonly<{
  name: string;
  value: string;
}>;

export type WorkflowEntryInput<TPublicInput> = Readonly<{
  inputVersion: "1.0";
  payload: Readonly<TPublicInput>;
}>;

export type WorkflowEntryInputEnvelope<TPublicInput> = Readonly<{
  envelopeVersion: "1.0";
  request: WorkflowEntryRequestIdentity;
  selection: WorkflowEntrySelection;
  input: WorkflowEntryInput<TPublicInput>;
  metadata: readonly WorkflowEntryMetadataField[];
  idempotency: WorkflowEntryIdempotencyIdentity;
}>;

export type WorkflowEntryCancellationRequest =
  | Readonly<{ status: "not-requested" }>
  | Readonly<{
      status: "requested";
      scope: "entry" | "workflow" | "current-stage";
      reasonCode: "caller-cancelled" | "policy-cancelled";
    }>;

export type WorkflowEntryContext = Readonly<{
  contextVersion: "1.0";
  callerClassification: "anonymous" | "authenticated-user" | "internal-service" | "system";
  requestClassification: "start" | "resume" | "reconcile" | "query" | "cancel";
  executionMode: "synchronous" | "asynchronous";
  correlationIdentity: string;
  attempt: WorkflowEntryAttemptIdentity;
  cancellation: WorkflowEntryCancellationRequest;
}>;

export type WorkflowEntryValidationIssue = Readonly<{
  reasonCode:
    | "invalid-request"
    | "invalid-selection"
    | "invalid-input"
    | "invalid-metadata"
    | "invalid-context"
    | "invalid-idempotency"
    | "invalid-resume-reference"
    | "invalid-reconciliation-reference";
  field: "request" | "selection" | "input" | "metadata" | "context" | "idempotency" | "reference";
  sequence: number;
}>;

export type WorkflowEntryValidationResult =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly WorkflowEntryValidationIssue[] }>;

export type WorkflowEntryAuthorizationDecision = Readonly<{
  decisionVersion: "1.0";
  decision: "allow" | "deny" | "manual-review";
  reasonCode: string;
  policyIdentity: string;
}>;

export type WorkflowInvocationRequest<TWorkflowInput> = Readonly<{
  invocationVersion: "1.0";
  workflow: WorkflowIdentity;
  input: Readonly<TWorkflowInput>;
  correlationIdentity: string;
  attempt: WorkflowEntryAttemptIdentity;
  cancellation: WorkflowEntryCancellationRequest;
}>;

export type WorkflowEntryResumeRequest = Readonly<{
  requestVersion: "1.0";
  identity: WorkflowEntryResumeIdentity;
  recommendation: "resume" | "wait" | "manual-review";
}>;

export type WorkflowEntryReconciliationRequest = Readonly<{
  requestVersion: "1.0";
  identity: WorkflowEntryResumeIdentity;
  recommendation: "reconcile" | "wait" | "manual-review";
  reasonCode: "outcome-unknown" | "authority-conflict" | "corrupted";
}>;

export type WorkflowEntryErrorClassification = Readonly<{
  classification:
    | "invalid"
    | "unauthorized"
    | "not-found"
    | "conflict"
    | "unavailable"
    | "cancelled"
    | "internal";
  reasonCode: string;
  retryable: boolean;
}>;

export type WorkflowEntryAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "authorization" | "selection" | "invocation" | "projection";
  outcome: string;
  reasonCode: string;
}>;

export type WorkflowEntryAudit = Readonly<{
  auditVersion: "1.0";
  request: WorkflowEntryRequestIdentity;
  workflow: WorkflowIdentity;
  entries: readonly WorkflowEntryAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type WorkflowEntryResultBase = Readonly<{
  resultVersion: "1.0";
  request: WorkflowEntryRequestIdentity;
  workflow: WorkflowIdentity;
  audit: WorkflowEntryAudit;
}>;

export type WorkflowEntryAcceptedResult = WorkflowEntryResultBase & Readonly<{
  status: "accepted";
  acceptanceIdentity: string;
}>;

export type WorkflowEntryCompletedResult<TOutput> = WorkflowEntryResultBase & Readonly<{
  status: "completed";
  output: Readonly<TOutput>;
}>;

export type WorkflowEntryPartialResult<TOutput> = WorkflowEntryResultBase & Readonly<{
  status: "partial";
  output: Readonly<TOutput>;
  issues: readonly WorkflowEntryErrorClassification[];
}>;

export type WorkflowEntryFailedResult = WorkflowEntryResultBase & Readonly<{
  status: "failed";
  errors: readonly WorkflowEntryErrorClassification[];
}>;

export type WorkflowEntryCancelledResult = WorkflowEntryResultBase & Readonly<{
  status: "cancelled";
  reasonCode: string;
}>;

export type WorkflowEntryRecoveryRequiredResult = WorkflowEntryResultBase & Readonly<{
  status: "recovery-required";
  request: WorkflowEntryRequestIdentity;
  reconciliation: WorkflowEntryReconciliationRequest;
}>;

export type WorkflowEntryRejectedResult = WorkflowEntryResultBase & Readonly<{
  status: "rejected";
  authorization: WorkflowEntryAuthorizationDecision;
  errors: readonly WorkflowEntryErrorClassification[];
}>;

export type WorkflowEntryResult<TOutput> =
  | WorkflowEntryAcceptedResult
  | WorkflowEntryCompletedResult<TOutput>
  | WorkflowEntryPartialResult<TOutput>
  | WorkflowEntryFailedResult
  | WorkflowEntryCancelledResult
  | WorkflowEntryRecoveryRequiredResult
  | WorkflowEntryRejectedResult;
