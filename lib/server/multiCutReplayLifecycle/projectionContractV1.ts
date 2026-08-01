import type { MultiCutReplayCompleteParticipationResultV2 } from "../multiCutReplayPostgresqlTransactionParticipation/typesV2";
import type {
  MultiCutReplayLifecycleProjectionResultV1,
  MultiCutReplayLifecycleProjectionTableV1,
  MultiCutReplayLifecycleProjectionValidationResultV1,
} from "./projectionTypesV1";

export const MULTI_CUT_REPLAY_LIFECYCLE_PROJECTION_TABLE_V1:
  MultiCutReplayLifecycleProjectionTableV1 = Object.freeze({
  "one-row": "completed-candidate",
  "zero-row": "not-applied",
  "cardinality-violation": "internal-invariant-violation",
  "execution-failure": "unavailable",
});

const copyIdentity = (
  identity: Extract<MultiCutReplayCompleteParticipationResultV2, { status: "one-row" }>["projection"]["replayIdentity"],
) => Object.freeze({
  identityVersion: identity.identityVersion,
  protectedScope: Object.freeze({
    scopeVersion: identity.protectedScope.scopeVersion,
    replayNamespace: identity.protectedScope.replayNamespace,
    tenant: Object.freeze({ ...identity.protectedScope.tenant }),
    operationIdentity: identity.protectedScope.operationIdentity,
  }),
  resolvedIdentity: Object.freeze({ ...identity.resolvedIdentity }),
});

const copyMetadata = <Metadata extends Readonly<{
  metadataVersion: "1.0";
  retryClassification: string;
  reconciliationClassification: string;
  logicalAttemptReuse: "reuse-intent-and-expectations" | "repeat-authoritative-read" | "reuse-terminal-intent";
}>>(metadata: Metadata): Metadata => Object.freeze({ ...metadata });

const copyParticipationResult = (
  result: MultiCutReplayCompleteParticipationResultV2,
): MultiCutReplayCompleteParticipationResultV2 => {
  switch (result.status) {
    case "one-row":
      return Object.freeze({
        ...result,
        projection: Object.freeze({
          ...result.projection,
          replayIdentity: copyIdentity(result.projection.replayIdentity),
          resultReference: Object.freeze({ ...result.projection.resultReference }),
          terminalMetadata: Object.freeze({ ...result.projection.terminalMetadata }),
        }),
        queryMetadata: copyMetadata(result.queryMetadata),
      });
    case "zero-row":
    case "cardinality-violation":
    case "execution-failure":
      return Object.freeze({
        ...result,
        queryMetadata: copyMetadata(result.queryMetadata),
      });
  }
  const unreachable: never = result;
  return unreachable;
};

export const projectMultiCutReplayCompleteParticipationResultToLifecycleV1 = (
  result: MultiCutReplayCompleteParticipationResultV2,
): MultiCutReplayLifecycleProjectionResultV1 => {
  const participationEvidence = copyParticipationResult(result);
  switch (participationEvidence.status) {
    case "one-row":
      return Object.freeze({
        schemaVersion: "1.0",
        sourceStatus: "one-row",
        status: "completed-candidate",
        lifecycleResult: Object.freeze({
          resultVersion: "4.0",
          status: "completed",
          state: "completed",
          replayIdentity: participationEvidence.projection.replayIdentity,
          resultReference: participationEvidence.projection.resultReference,
          revision: participationEvidence.projection.revision,
        }),
        participationEvidence,
      });
    case "zero-row":
      return Object.freeze({
        schemaVersion: "1.0",
        sourceStatus: "zero-row",
        status: "not-applied",
        classification: "ambiguous-concurrency-miss",
        projectionReason: participationEvidence.zeroRowClassification,
        lookupRequired: participationEvidence.lookupRequired,
        reconciliationRequired: participationEvidence.reconciliationRequired,
        ownerAction: participationEvidence.ownerAction,
        rollbackRequired: true,
        participationEvidence,
      });
    case "cardinality-violation":
      return Object.freeze({
        schemaVersion: "1.0",
        sourceStatus: "cardinality-violation",
        status: "internal-invariant-violation",
        classification: participationEvidence.classification,
        expectedRowCount: participationEvidence.expectedRowCount,
        actualRowCount: participationEvidence.actualRowCount,
        ownerAction: participationEvidence.ownerAction,
        rollbackRequired: true,
        reconciliationRequired: true,
        participationEvidence,
      });
    case "execution-failure":
      return Object.freeze({
        schemaVersion: "1.0",
        sourceStatus: "execution-failure",
        status: "unavailable",
        classification: participationEvidence.classification,
        safeReason: participationEvidence.safeReason,
        ...(participationEvidence.sqlStateClass
          ? { sqlStateClass: participationEvidence.sqlStateClass }
          : {}),
        ...(participationEvidence.queryConnectionDisposition
          ? { queryConnectionDisposition: participationEvidence.queryConnectionDisposition }
          : {}),
        retryMetadata: participationEvidence.queryMetadata.retryClassification,
        reconciliationMetadata:
          participationEvidence.queryMetadata.reconciliationClassification,
        ownerAction: participationEvidence.ownerAction,
        rollbackRequired: true,
        participationEvidence,
      });
  }
  const unreachable: never = participationEvidence;
  return unreachable;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLifecycleProjectionResultV1 = (
  value: unknown,
): value is MultiCutReplayLifecycleProjectionResultV1 => {
  if (!isRecord(value) || value.schemaVersion !== "1.0") return false;
  if (!isRecord(value.participationEvidence)) return false;
  return (
    (value.sourceStatus === "one-row" &&
      value.status === "completed-candidate" &&
      value.participationEvidence.status === "one-row" &&
      isRecord(value.lifecycleResult) &&
      value.lifecycleResult.status === "completed") ||
    (value.sourceStatus === "zero-row" &&
      value.status === "not-applied" &&
      value.participationEvidence.status === "zero-row") ||
    (value.sourceStatus === "cardinality-violation" &&
      value.status === "internal-invariant-violation" &&
      value.participationEvidence.status === "cardinality-violation") ||
    (value.sourceStatus === "execution-failure" &&
      value.status === "unavailable" &&
      value.participationEvidence.status === "execution-failure")
  );
};

export const validateMultiCutReplayLifecycleProjectionResultV1 = (
  value: unknown,
): MultiCutReplayLifecycleProjectionValidationResultV1 => {
  if (!isRecord(value)) {
    return Object.freeze({ resultVersion: "1.0", status: "invalid", reason: "invalid-projection" });
  }
  if (value.schemaVersion !== "1.0") {
    return Object.freeze({ resultVersion: "1.0", status: "invalid", reason: "unsupported-version" });
  }
  if (!isLifecycleProjectionResultV1(value)) {
    return Object.freeze({ resultVersion: "1.0", status: "invalid", reason: "invalid-projection" });
  }
  return Object.freeze({
    resultVersion: "1.0",
    status: "valid",
    value,
  });
};
