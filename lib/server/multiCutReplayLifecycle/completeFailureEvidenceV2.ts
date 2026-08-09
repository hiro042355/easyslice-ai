import type { MultiCutReplayCompleteParticipationFailureEvidenceV3 } from "../multiCutReplayPostgresqlTransactionParticipation/completeEvidenceV3";

export type MultiCutReplayLifecycleCompleteFailureEvidenceV2 = Readonly<{
  evidenceVersion: "2.0"; status: "unavailable"; sourceStatus: "execution-failure";
  issue: MultiCutReplayCompleteParticipationFailureEvidenceV3["issue"];
  safeReason: string; retryable: boolean;
  sqlStateClass?: MultiCutReplayCompleteParticipationFailureEvidenceV3["sqlStateClass"];
  queryConnectionDisposition: MultiCutReplayCompleteParticipationFailureEvidenceV3["queryConnectionDisposition"];
  ownerAction: "rollback-required"; commitUnknown: false;
}>;

export function projectCompleteLifecycleFailureEvidenceV2(source: MultiCutReplayCompleteParticipationFailureEvidenceV3): MultiCutReplayLifecycleCompleteFailureEvidenceV2 {
  return Object.freeze({ evidenceVersion: "2.0", status: "unavailable", sourceStatus: "execution-failure", issue: source.issue, safeReason: source.safeReason, retryable: source.retryable, ...(source.sqlStateClass === undefined ? {} : { sqlStateClass: source.sqlStateClass }), queryConnectionDisposition: source.queryConnectionDisposition, ownerAction: "rollback-required", commitUnknown: false });
}
