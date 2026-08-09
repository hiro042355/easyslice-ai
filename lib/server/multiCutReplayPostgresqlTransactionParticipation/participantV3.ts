import { createCompleteProcessingReplayParameterValues } from "../multiCutReplayPersistenceParameters";
import { createMultiCutReplayPostgresqlQueryMappingCoreV3 } from "../multiCutReplayPostgresqlAdapter";
import { createCompleteParticipationFailureEvidenceV3 } from "./completeEvidenceV3";
import type { MultiCutReplayCompleteTransactionParticipantV3 } from "./typesV3";

export const createMultiCutReplayCompleteTransactionParticipantV3 = (): MultiCutReplayCompleteTransactionParticipantV3 => Object.freeze({ participantVersion: "3.0", async executeComplete(query, request) {
  const core = createMultiCutReplayPostgresqlQueryMappingCoreV3(query);
  const mapped = await core.execute(createCompleteProcessingReplayParameterValues(request.parameterInput));
  if (mapped.status === "execution-failure") {
    const failure = createCompleteParticipationFailureEvidenceV3(mapped);
    if (!failure) throw new TypeError("incomplete-participation-failure-evidence");
    return Object.freeze({ resultVersion: "3.0", status: "execution-failure", classification: "execution-failure", failure, queryMetadata: Object.freeze({ metadataVersion: mapped.metadata.metadataVersion, retryClassification: mapped.metadata.retryClassification, reconciliationClassification: mapped.metadata.reconciliationClassification, logicalAttemptReuse: mapped.metadata.logicalAttemptReuse }), rollbackRequired: true });
  }
  const queryMetadata = Object.freeze({ metadataVersion: mapped.metadata.metadataVersion, retryClassification: mapped.metadata.retryClassification, reconciliationClassification: mapped.metadata.reconciliationClassification, logicalAttemptReuse: mapped.metadata.logicalAttemptReuse });
  if (mapped.status === "zero-row") return Object.freeze({ resultVersion: "2.0", status: "zero-row", command: mapped.command, rowCount: 0, zeroRowClassification: mapped.classification, lookupRequired: mapped.lookupRequired, reconciliationRequired: mapped.reconciliationRequired, queryMetadata, ownerAction: "do-not-commit", rollbackRequired: true });
  if (mapped.status === "cardinality-failure") return Object.freeze({ resultVersion: "2.0", status: "cardinality-violation", expectedRowCount: 1, actualRowCount: mapped.rowCount, classification: mapped.classification, queryMetadata, ownerAction: "rollback-required", rollbackRequired: true });
  const row = mapped.row;
  if (typeof row.revision !== "string" || row.result_reference_version !== "1.0" || typeof row.result_reference_identity !== "string" || row.terminal_metadata_version !== "1.0" || typeof row.terminal_at !== "string" || row.terminal_classification !== "workflow-completed") throw new TypeError("invalid-complete-processing-replay-row");
  return Object.freeze({ resultVersion: "2.0", status: "one-row", command: mapped.command, rowCount: 1, projection: Object.freeze({ projectionVersion: "1.0", replayIdentity: request.authoritativeReplayIdentity, state: "completed", revision: row.revision, lastFencingToken: request.parameterInput.bindings.expected_fence, lastReservationAttempt: request.parameterInput.bindings.expected_ownership_evidence.reservation_attempt, resultReference: Object.freeze({ referenceVersion: row.result_reference_version, resultReferenceIdentity: row.result_reference_identity }), terminalMetadata: Object.freeze({ metadataVersion: row.terminal_metadata_version, completedAt: row.terminal_at, completionClassification: row.terminal_classification }) }), queryMetadata, ownerAction: "continue-transaction", durableCompletion: false });
} });
