export type MultiCutReplayPostgresqlStatementId =
  | "resolve-new-reservation"
  | "resolve-existing-replay"
  | "lookup-authoritative-replay"
  | "renew-processing-reservation"
  | "complete-processing-replay"
  | "fail-processing-replay"
  | "release-processing-replay"
  | "takeover-stale-processing-replay";

export type MultiCutReplayPostgresqlStatementOwner =
  | "resolution"
  | "recovery"
  | "lifecycle";

export type MultiCutReplayPostgresqlOperationKind =
  | "resolve-new"
  | "resolve-existing"
  | "lookup"
  | "renew"
  | "complete"
  | "fail"
  | "release"
  | "takeover";

export type MultiCutReplayPostgresqlStatementAccessMode = "read" | "write";

export type MultiCutReplayPostgresqlTransactionRequirement =
  | "required"
  | "read-consistent"
  | "workflow-completion-transaction";

export type MultiCutReplayPostgresqlMutationClassification =
  | "none"
  | "reservation-create"
  | "reservation-refresh"
  | "terminal-transition"
  | "ownership-takeover";

export type MultiCutReplayPostgresqlCommitUnknownStrategy =
  | "authoritative-lookup"
  | "reservation-reconciliation"
  | "workflow-completion-recovery"
  | "not-applicable";

export type MultiCutReplayPostgresqlFollowUpRequirement =
  | "required"
  | "conditional"
  | "none";

export type MultiCutReplayPostgresqlReconciliationRequirement =
  | "none"
  | "reservation-mutation";

export type MultiCutReplayPostgresqlStatementCatalogEntry<
  StatementId extends MultiCutReplayPostgresqlStatementId =
    MultiCutReplayPostgresqlStatementId,
> = Readonly<{
  statementId: StatementId;
  capabilityOwner: MultiCutReplayPostgresqlStatementOwner;
  operationKind: MultiCutReplayPostgresqlOperationKind;
  accessMode: MultiCutReplayPostgresqlStatementAccessMode;
  transactionRequirement: MultiCutReplayPostgresqlTransactionRequirement;
  mutationClassification: MultiCutReplayPostgresqlMutationClassification;
  commitUnknownStrategy: MultiCutReplayPostgresqlCommitUnknownStrategy;
  authoritativeFollowUpRequirement:
    MultiCutReplayPostgresqlFollowUpRequirement;
  reconciliationRequirement:
    MultiCutReplayPostgresqlReconciliationRequirement;
}>;

export type MultiCutReplayPostgresqlStatementCatalog = Readonly<{
  readonly [StatementId in MultiCutReplayPostgresqlStatementId]:
    MultiCutReplayPostgresqlStatementCatalogEntry<StatementId>;
}>;
