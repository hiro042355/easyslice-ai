import {
  createCompleteProcessingReplayParameterValues,
} from "../multiCutReplayPersistenceParameters";
import {
  createMultiCutReplayPostgresqlQueryMappingCoreV2,
} from "../multiCutReplayPostgresqlAdapter/queryMappingCore";
import {
  createMultiCutReplayCompleteParticipationRequestV2,
} from "./contractV2";
import type {
  MultiCutReplayCompleteParticipationRequestV2,
  MultiCutReplayCompleteParticipationResultV2,
  MultiCutReplayCompleteQueryMetadataV2,
  MultiCutReplayCompleteTransactionParticipantV2,
} from "./typesV2";

const copyQueryMetadata = (
  metadata: Readonly<{
    metadataVersion: "1.0";
    retryClassification: string;
    reconciliationClassification: string;
    logicalAttemptReuse:
      | "reuse-intent-and-expectations"
      | "repeat-authoritative-read"
      | "reuse-terminal-intent";
  }>,
): MultiCutReplayCompleteQueryMetadataV2 => Object.freeze({
  metadataVersion: metadata.metadataVersion,
  retryClassification: metadata.retryClassification,
  reconciliationClassification: metadata.reconciliationClassification,
  logicalAttemptReuse: metadata.logicalAttemptReuse,
});

const mapOneRow = (
  request: MultiCutReplayCompleteParticipationRequestV2,
  row: Readonly<Record<string, unknown>>,
  command: string,
  metadata: MultiCutReplayCompleteQueryMetadataV2,
): MultiCutReplayCompleteParticipationResultV2 => {
  if (
    typeof row.revision !== "string" ||
    row.result_reference_version !== "1.0" ||
    typeof row.result_reference_identity !== "string" ||
    row.terminal_metadata_version !== "1.0" ||
    typeof row.terminal_at !== "string" ||
    row.terminal_classification !== "workflow-completed"
  ) {
    throw new Error("invalid-complete-processing-replay-row");
  }
  return Object.freeze({
    resultVersion: "2.0",
    status: "one-row",
    command,
    rowCount: 1,
    projection: Object.freeze({
      projectionVersion: "1.0",
      replayIdentity: request.authoritativeReplayIdentity,
      state: "completed",
      revision: row.revision,
      lastFencingToken: request.parameterInput.bindings.expected_fence,
      lastReservationAttempt:
        request.parameterInput.bindings.expected_ownership_evidence
          .reservation_attempt,
      resultReference: Object.freeze({
        referenceVersion: row.result_reference_version,
        resultReferenceIdentity: row.result_reference_identity,
      }),
      terminalMetadata: Object.freeze({
        metadataVersion: row.terminal_metadata_version,
        completedAt: row.terminal_at,
        completionClassification: row.terminal_classification,
      }),
    }),
    queryMetadata: metadata,
    ownerAction: "continue-transaction",
    durableCompletion: false,
  });
};

export const createMultiCutReplayCompleteTransactionParticipantV2 = ():
  MultiCutReplayCompleteTransactionParticipantV2 => Object.freeze({
  async executeComplete(query, request) {
    const validated = createMultiCutReplayCompleteParticipationRequestV2({
      authoritativeReplayIdentity: request.authoritativeReplayIdentity,
      parameterInput: request.parameterInput,
    });
    if (validated.status === "invalid") {
      throw new Error(`invalid-complete-participation-request:${validated.reason}`);
    }
    const isolatedRequest = validated.request;
    const core = createMultiCutReplayPostgresqlQueryMappingCoreV2(query);
    const result = await core.execute(
      createCompleteProcessingReplayParameterValues(
        isolatedRequest.parameterInput,
      ),
    );
    const metadata = copyQueryMetadata(result.metadata);
    switch (result.status) {
      case "mapped":
        return mapOneRow(
          isolatedRequest,
          result.row,
          result.command,
          metadata,
        );
      case "zero-row":
        return Object.freeze({
          resultVersion: "2.0",
          status: "zero-row",
          command: result.command,
          rowCount: 0,
          zeroRowClassification: result.classification,
          lookupRequired: result.lookupRequired,
          reconciliationRequired: result.reconciliationRequired,
          queryMetadata: metadata,
          ownerAction: "do-not-commit",
          rollbackRequired: true,
        });
      case "cardinality-failure":
        return Object.freeze({
          resultVersion: "2.0",
          status: "cardinality-violation",
          expectedRowCount: 1,
          actualRowCount: result.rowCount,
          classification: result.classification,
          queryMetadata: metadata,
          ownerAction: "rollback-required",
          rollbackRequired: true,
        });
      case "execution-failure":
        return Object.freeze({
          resultVersion: "2.0",
          status: "execution-failure",
          transactionPhase: "query",
          classification: result.classification,
          issue: result.issue,
          safeReason: result.safeReason,
          ...(result.sqlStateClass
            ? { sqlStateClass: result.sqlStateClass }
            : {}),
          ...(result.queryConnectionDisposition
            ? {
                queryConnectionDisposition:
                  result.queryConnectionDisposition,
              }
            : {}),
          queryMetadata: metadata,
          ownerAction: "rollback-required",
          rollbackRequired: true,
        });
    }
  },
});
