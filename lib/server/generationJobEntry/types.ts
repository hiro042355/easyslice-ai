export type GenerationJobVersion = string;

export type GenerationJobIdentity = Readonly<{
  jobId: string;
  jobVersion: GenerationJobVersion;
}>;

export type GenerationJobPriority = "background" | "normal" | "expedited";

export type GenerationJobSchedulingClassification =
  | "immediate-eligible"
  | "deferred-eligible"
  | "external-state-required"
  | "manual-review-required";

export type GenerationJobSelection = Readonly<{
  selectionVersion: "1.0";
  workflowId: string;
  workflowVersion: string;
  capabilityId: string;
  capabilityVersion: string;
  mode: "exact" | "latest-compatible";
}>;

export type GenerationJobMetadata = Readonly<{
  metadataVersion: "1.0";
  fields: readonly Readonly<{
    name: string;
    value: string;
    declarationOrder: number;
  }>[];
}>;

export type GenerationJobResumeReference = Readonly<{
  referenceVersion: "1.0";
  referenceIdentity: string;
  referenceKind: "job" | "workflow" | "stage" | "reconciliation";
}>;

export type GenerationJobCancellationReference =
  | Readonly<{ status: "not-requested" }>
  | Readonly<{
      status: "requested";
      referenceVersion: "1.0";
      referenceIdentity: string;
      scope: "job" | "workflow";
      reasonCode: "caller-cancelled" | "policy-cancelled";
    }>;

export type GenerationJobContext = Readonly<{
  contextVersion: "1.0";
  correlationIdentity: string;
  attemptIdentity: string;
  attempt: number;
  callerClassification: "authenticated-user" | "internal-service" | "system";
  executionClassification: "interactive" | "service" | "maintenance";
  cancellation: GenerationJobCancellationReference;
}>;

export type GenerationJobRequest<TPublicInput> = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  job: GenerationJobIdentity;
  selection: GenerationJobSelection;
  input: Readonly<TPublicInput>;
  context: GenerationJobContext;
  metadata: GenerationJobMetadata;
  priority: GenerationJobPriority;
  scheduling: GenerationJobSchedulingClassification;
  resume?: GenerationJobResumeReference;
}>;

export type GenerationJobValidationIssue = Readonly<{
  reasonCode:
    | "invalid-request"
    | "invalid-job-identity"
    | "invalid-selection"
    | "invalid-context"
    | "invalid-metadata"
    | "invalid-resume-reference"
    | "invalid-cancellation-reference";
  field: "request" | "identity" | "selection" | "context" | "metadata" | "resume" | "cancellation";
  sequence: number;
}>;

export type GenerationJobValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly GenerationJobValidationIssue[];
    }>;

export type GenerationJobFailureClassification = Readonly<{
  classification:
    | "invalid"
    | "unauthorized"
    | "not-found"
    | "conflict"
    | "unavailable"
    | "cancelled"
    | "internal";
  reasonCode: string;
  safeMessageClassification: "request" | "selection" | "policy" | "dependency" | "availability" | "internal";
}>;

export type GenerationJobAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "selection" | "admission" | "projection";
  outcome: string;
  reasonCode: string;
}>;

export type GenerationJobAudit = Readonly<{
  auditVersion: "1.0";
  job: GenerationJobIdentity;
  entries: readonly GenerationJobAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type GenerationJobAcceptedResult = Readonly<{
  resultVersion: "1.0";
  status: "accepted";
  job: GenerationJobIdentity;
  scheduling: GenerationJobSchedulingClassification;
  audit: GenerationJobAudit;
}>;

export type GenerationJobCompletedResult<TOutput> = Readonly<{
  resultVersion: "1.0";
  status: "completed";
  job: GenerationJobIdentity;
  output: Readonly<TOutput>;
  audit: GenerationJobAudit;
}>;

export type GenerationJobPartialResult<TOutput> = Readonly<{
  resultVersion: "1.0";
  status: "partial";
  job: GenerationJobIdentity;
  output: Readonly<TOutput>;
  failures: readonly GenerationJobFailureClassification[];
  audit: GenerationJobAudit;
}>;

export type GenerationJobFailedResult = Readonly<{
  resultVersion: "1.0";
  status: "failed";
  job: GenerationJobIdentity;
  failures: readonly GenerationJobFailureClassification[];
  audit: GenerationJobAudit;
}>;

export type GenerationJobCancelledResult = Readonly<{
  resultVersion: "1.0";
  status: "cancelled";
  job: GenerationJobIdentity;
  reasonCode: string;
  audit: GenerationJobAudit;
}>;

export type GenerationJobRecoveryRequiredResult = Readonly<{
  resultVersion: "1.0";
  status: "recovery-required";
  job: GenerationJobIdentity;
  reference: GenerationJobResumeReference;
  reasonCode: "outcome-unknown" | "authority-conflict" | "corrupted";
  audit: GenerationJobAudit;
}>;

export type GenerationJobRejectedResult = Readonly<{
  resultVersion: "1.0";
  status: "rejected";
  job: GenerationJobIdentity;
  failures: readonly GenerationJobFailureClassification[];
  audit: GenerationJobAudit;
}>;

export type GenerationJobResultProjection<TOutput> =
  | GenerationJobAcceptedResult
  | GenerationJobCompletedResult<TOutput>
  | GenerationJobPartialResult<TOutput>
  | GenerationJobFailedResult
  | GenerationJobCancelledResult
  | GenerationJobRecoveryRequiredResult
  | GenerationJobRejectedResult;
