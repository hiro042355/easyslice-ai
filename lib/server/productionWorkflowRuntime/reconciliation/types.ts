import type { WorkflowUtcTimestamp } from "../types";

export type ReconciliationRequestState =
  | "pending-observation" | "claimed" | "observing" | "retry-wait"
  | "resolved" | "still-unknown" | "corrupted" | "manual-repair-required" | "cancelled";
export type ReconciliationSourceResult = "committed" | "not-committed" | "corrupted" | "unavailable";
export type ReconciliationEscalation = "manual-repair" | "operator-review";
export type ReconciliationDelayClass = "immediate" | "short" | "standard" | "long";
export type ReconciliationDeadlineClass = "within-policy" | "policy-exhausted";
export type ReconciliationAttemptRemainingClass = "remaining" | "last-attempt" | "exhausted";
export type ReconciliationRequiredSource = "writer-authoritative-store" | "provider-formal-lookup" | "safe-journal" | "terminal-store";

export type ReconciliationTemporalPolicy = Readonly<{
  policyVersion: "1.0";
  maxAttempts: number;
  maxElapsedMilliseconds: number;
  leaseDurationMilliseconds: number;
  heartbeatIntervalMilliseconds: number;
  delayClass: ReconciliationDelayClass;
  exhaustionEscalation: ReconciliationEscalation;
}>;

export type ReconciliationLease = Readonly<{
  owner: string;
  fence: number;
  acquiredAtMilliseconds: number;
  expiresAtMilliseconds: number;
}>;

export type ReconciliationRequest = Readonly<{
  requestVersion: "1.0";
  requestId: string;
  triggerClass: "database-commit-unknown" | "provider-submit-unknown" | "provider-poll-unknown" | "output-ingestion-unknown" | "cancellation-unknown" | "webhook-scheduler-race" | "outbox-delivery-unknown";
  state: ReconciliationRequestState;
  revision: number;
  attempt: number;
  observationCount: number;
  createdAtMilliseconds: number;
  policy: ReconciliationTemporalPolicy;
  lease?: ReconciliationLease;
}>;

export type ReconciliationObservation = Readonly<{
  observationVersion: "1.0";
  sequence: number;
  attempt: number;
  source: ReconciliationRequiredSource;
  result: ReconciliationSourceResult;
  observedAt: WorkflowUtcTimestamp;
}>;

export type SafeReconciliationRetryAdvice = Readonly<{
  delayClass: ReconciliationDelayClass;
  deadlineClass: ReconciliationDeadlineClass;
  attemptRemainingClass: ReconciliationAttemptRemainingClass;
  requiredSource: ReconciliationRequiredSource;
}>;

export type WorkflowReconciliationResult =
  | Readonly<{ status: "resolved"; outcome: "committed" | "not-committed" | "provider-job-found" | "provider-job-not-found" | "terminal-preserved" | "cancelled" }>
  | Readonly<{ status: "pending"; nextAction: "retry-later"; retryAdvice: SafeReconciliationRetryAdvice }>
  | Readonly<{ status: "still-unknown"; escalation: ReconciliationEscalation }>
  | Readonly<{ status: "corrupted"; escalation: "manual-repair" }>
  | Readonly<{ status: "unavailable"; retryable: boolean }>;

export type ReconciliationResolutionDecision = Readonly<{
  nextState: ReconciliationRequestState;
  result: WorkflowReconciliationResult;
  appendOutbox: boolean;
  routeManualRepair: boolean;
}>;

export type ReconciliationClaimResult =
  | Readonly<{ status: "claimed"; request: ReconciliationRequest }>
  | Readonly<{ status: "busy" | "stale-fence" | "terminal" | "unavailable" }>;
export type ReconciliationWriteResult =
  | Readonly<{ status: "committed"; request: ReconciliationRequest }>
  | Readonly<{ status: "conflict" | "stale-fence" | "unavailable" | "commit-unknown" }>;

export type ReconciliationPersistence = Readonly<{
  persistenceVersion: "1.0";
  productionReady: false;
  claim(request: ReconciliationRequest, owner: string, nowMilliseconds: number): Promise<ReconciliationClaimResult>;
  heartbeat(request: ReconciliationRequest, lease: ReconciliationLease, nowMilliseconds: number): Promise<ReconciliationClaimResult>;
  appendObservation(request: ReconciliationRequest, lease: ReconciliationLease, observation: ReconciliationObservation): Promise<ReconciliationWriteResult>;
  complete(request: ReconciliationRequest, lease: ReconciliationLease, decision: ReconciliationResolutionDecision): Promise<ReconciliationWriteResult>;
  release(request: ReconciliationRequest, lease: ReconciliationLease): Promise<ReconciliationWriteResult>;
  lookupResolution(request: ReconciliationRequest): Promise<ReconciliationSourceResult>;
}>;

export type ReconciliationObservationSource = Readonly<{
  sourceVersion: "1.0";
  source: ReconciliationRequiredSource;
  sideEffectFree: true;
  observe(request: ReconciliationRequest): Promise<ReconciliationSourceResult>;
}>;

export type ReconciliationSchedulerDecision = Readonly<{
  status: "due" | "not-due" | "terminal";
  requiredSource?: ReconciliationRequiredSource;
}>;
export type ReconciliationScheduler = Readonly<{
  schedulerVersion: "1.0";
  implementation: "interface-only";
  decide(request: ReconciliationRequest, nowMilliseconds: number): ReconciliationSchedulerDecision;
}>;

export type ReconciliationRuntimeDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id: "workflow-reconciliation-runtime-foundation-v1";
  serverOnly: true;
  durable: false;
  timerImplementation: false;
  providerImplementation: false;
  runtimeBundleRegistered: false;
  productionReady: false;
}>;

export type ReconciliationRuntime = Readonly<{
  descriptor: ReconciliationRuntimeDescriptor;
  reconcile(request: ReconciliationRequest, owner: string, source: ReconciliationObservationSource, nowMilliseconds: number, observedAt: WorkflowUtcTimestamp): Promise<WorkflowReconciliationResult>;
  heartbeat(request: ReconciliationRequest, lease: ReconciliationLease, nowMilliseconds: number): Promise<ReconciliationClaimResult>;
}>;

export type ReconciliationValidationIssue =
  | "not-an-object" | "descriptor-invalid" | "reconcile-missing" | "heartbeat-missing";
export type ReconciliationValidationResult = Readonly<{ status: "valid" }> | Readonly<{ status: "invalid"; issues: readonly ReconciliationValidationIssue[] }>;
