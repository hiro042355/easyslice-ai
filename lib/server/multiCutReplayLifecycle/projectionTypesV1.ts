import type { PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";
import type { MultiCutReplayCompleteParticipationResultV2 } from "../multiCutReplayPostgresqlTransactionParticipation/typesV2";
import type { MultiCutReplayLifecycleResultV4 } from "./typesV4";

export type MultiCutReplayLifecycleProjectionSchemaVersionV1 = "1.0";

type ParticipationResult<Status extends MultiCutReplayCompleteParticipationResultV2["status"]> =
  Extract<MultiCutReplayCompleteParticipationResultV2, { status: Status }>;

export type MultiCutReplayLifecycleCompletedProjectionV1 = Readonly<{
  schemaVersion: MultiCutReplayLifecycleProjectionSchemaVersionV1;
  sourceStatus: "one-row";
  status: "completed-candidate";
  lifecycleResult: Extract<MultiCutReplayLifecycleResultV4, { status: "completed" }>;
  participationEvidence: ParticipationResult<"one-row">;
}>;

export type MultiCutReplayLifecycleZeroRowProjectionV1 = Readonly<{
  schemaVersion: MultiCutReplayLifecycleProjectionSchemaVersionV1;
  sourceStatus: "zero-row";
  status: "not-applied";
  classification: "ambiguous-concurrency-miss";
  projectionReason: ParticipationResult<"zero-row">["zeroRowClassification"];
  lookupRequired: ParticipationResult<"zero-row">["lookupRequired"];
  reconciliationRequired: ParticipationResult<"zero-row">["reconciliationRequired"];
  ownerAction: ParticipationResult<"zero-row">["ownerAction"];
  rollbackRequired: true;
  participationEvidence: ParticipationResult<"zero-row">;
}>;

export type MultiCutReplayLifecycleCardinalityProjectionV1 = Readonly<{
  schemaVersion: MultiCutReplayLifecycleProjectionSchemaVersionV1;
  sourceStatus: "cardinality-violation";
  status: "internal-invariant-violation";
  classification: ParticipationResult<"cardinality-violation">["classification"];
  expectedRowCount: 1;
  actualRowCount: number;
  ownerAction: ParticipationResult<"cardinality-violation">["ownerAction"];
  rollbackRequired: true;
  reconciliationRequired: true;
  participationEvidence: ParticipationResult<"cardinality-violation">;
}>;

export type MultiCutReplayLifecycleExecutionFailureProjectionV1 = Readonly<{
  schemaVersion: MultiCutReplayLifecycleProjectionSchemaVersionV1;
  sourceStatus: "execution-failure";
  status: "unavailable";
  classification: ParticipationResult<"execution-failure">["classification"];
  safeReason: string;
  sqlStateClass?: ParticipationResult<"execution-failure">["sqlStateClass"];
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
  retryMetadata: ParticipationResult<"execution-failure">["queryMetadata"]["retryClassification"];
  reconciliationMetadata: ParticipationResult<"execution-failure">["queryMetadata"]["reconciliationClassification"];
  ownerAction: ParticipationResult<"execution-failure">["ownerAction"];
  rollbackRequired: true;
  participationEvidence: ParticipationResult<"execution-failure">;
}>;

export type MultiCutReplayLifecycleProjectionResultV1 =
  | MultiCutReplayLifecycleCompletedProjectionV1
  | MultiCutReplayLifecycleZeroRowProjectionV1
  | MultiCutReplayLifecycleCardinalityProjectionV1
  | MultiCutReplayLifecycleExecutionFailureProjectionV1;

export type MultiCutReplayLifecycleProjectionValidationResultV1 =
  | Readonly<{
      resultVersion: "1.0";
      status: "valid";
      value: MultiCutReplayLifecycleProjectionResultV1;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "invalid";
      reason: "invalid-projection" | "unsupported-version";
    }>;

export type MultiCutReplayLifecycleProjectionTableV1 = Readonly<{
  "one-row": "completed-candidate";
  "zero-row": "not-applied";
  "cardinality-violation": "internal-invariant-violation";
  "execution-failure": "unavailable";
}>;
