import type { MultiCutReplayPostgresqlQueryOnlyClientV3 } from "../multiCutReplayPostgresqlAdapter";
import type { MultiCutReplayCompleteParticipationRequestV2, MultiCutReplayCompleteParticipationResultV2 } from "./typesV2";
import type { MultiCutReplayCompleteParticipationFailureEvidenceV3 } from "./completeEvidenceV3";

export type MultiCutReplayCompleteQueryExecutionPortV3 = MultiCutReplayPostgresqlQueryOnlyClientV3;
export type MultiCutReplayCompleteParticipationResultV3 = Exclude<MultiCutReplayCompleteParticipationResultV2, { status: "execution-failure" }> | Readonly<{ resultVersion: "3.0"; status: "execution-failure"; classification: "execution-failure"; failure: MultiCutReplayCompleteParticipationFailureEvidenceV3; queryMetadata: Extract<MultiCutReplayCompleteParticipationResultV2, { status: "execution-failure" }>["queryMetadata"]; rollbackRequired: true }>;
export type MultiCutReplayCompleteTransactionParticipantV3 = Readonly<{ participantVersion: "3.0"; executeComplete(query: MultiCutReplayCompleteQueryExecutionPortV3, request: MultiCutReplayCompleteParticipationRequestV2): Promise<MultiCutReplayCompleteParticipationResultV3> }>;
