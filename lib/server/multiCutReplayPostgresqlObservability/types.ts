export type ReplayPostgresqlOperation =
  | "reserve"
  | "lookup"
  | "renew"
  | "complete"
  | "fail"
  | "release"
  | "takeover"
  | "transaction-begin"
  | "transaction-commit"
  | "transaction-rollback"
  | "acquire"
  | "release-connection"
  | "discard-connection"
  | "shutdown";

export type ReplayPostgresqlSafeSqlStateClass =
  | "08"
  | "23"
  | "25"
  | "40"
  | "42"
  | "57";

type ReplayPostgresqlObservabilityEventBase = Readonly<{
  schemaVersion: "1.0";
  operation: ReplayPostgresqlOperation;
}>;

export type ReplayPostgresqlExecutionFailureEvent =
  ReplayPostgresqlObservabilityEventBase &
    Readonly<{
      eventType: "replay-postgresql-execution-failed";
      lifecyclePhase: "execution";
      classification: "retryable" | "non-retryable" | "commit-unknown";
      retryMetadata: "retryable" | "non-retryable" | "commit-unknown";
      safeReason: string;
      sqlStateClass?: ReplayPostgresqlSafeSqlStateClass;
      outcome: "failed";
    }>;

export type ReplayPostgresqlRollbackFailureEvent =
  ReplayPostgresqlObservabilityEventBase &
    Readonly<{
      eventType: "replay-postgresql-rollback-failed";
      lifecyclePhase: "transaction";
      transactionPhase: "rollback";
      classification: "non-retryable";
      retryMetadata: "non-retryable";
      safeReason: string;
      sqlStateClass?: ReplayPostgresqlSafeSqlStateClass;
      connectionDisposition: "released" | "release-failed";
      outcome: "failed";
    }>;

export type ReplayPostgresqlConnectionDiscardedEvent =
  ReplayPostgresqlObservabilityEventBase &
    Readonly<{
      eventType: "replay-postgresql-connection-discarded";
      lifecyclePhase: "connection";
      reasonCategory:
        | "active-transaction"
        | "commit-unknown"
        | "rollback-failure";
      connectionDisposition: "discarded";
      outcome: "completed";
    }>;

export type ReplayPostgresqlPoolLifecycleEvent =
  ReplayPostgresqlObservabilityEventBase &
    Readonly<{
      eventType:
        | "replay-postgresql-pool-draining"
        | "replay-postgresql-pool-drained"
        | "replay-postgresql-pool-drain-timeout"
        | "replay-postgresql-pool-closed";
      lifecyclePhase: "pool";
      outcome: "started" | "completed" | "failed";
      safeReason: string;
      connectionDisposition?: "released" | "discarded";
    }>;

export type ReplayPostgresqlObservabilityEvent =
  | ReplayPostgresqlExecutionFailureEvent
  | ReplayPostgresqlRollbackFailureEvent
  | ReplayPostgresqlConnectionDiscardedEvent
  | ReplayPostgresqlPoolLifecycleEvent;

export type ReplayPostgresqlObservabilityPort = Readonly<{
  emit(event: ReplayPostgresqlObservabilityEvent): void;
}>;
