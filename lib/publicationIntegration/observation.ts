import type { PublicationPrincipal } from "./principal";
import { decodePublicationRecord, type PublicationQueryClient, type PublicationRecord, type PublicationState } from "../publicationRecords/repository";
import { canTransitionPublication } from "../publicationRecords/repository";

/**
 * Observation application (CORE_R11 PROPOSED item 4).
 *
 * The adapter never writes Core state directly: it reports observations and Core
 * decides the transition. Only a `PUBLISH_PRIVATE_CONFIRMED` observation with a
 * provider publication id may reach `PUBLISHED_PRIVATE`, and the database CHECK in
 * V000028/V000035 requires that the transport of that row is `REAL_TIKTOK` and the
 * receipt says `VERIFIED`.
 */
export const TIKTOK_PUBLICATION_OBSERVATIONS = [
  "DISPATCH_ACCEPTED",
  "UPLOAD_STARTED",
  "PUBLISH_PRIVATE_CONFIRMED",
  "OUTCOME_UNKNOWN",
  "PERMANENT_FAILURE",
  "AUTH_FAILED",
] as const;

export type TikTokPublicationObservation = (typeof TIKTOK_PUBLICATION_OBSERVATIONS)[number];
export const isTikTokPublicationObservation = (value: unknown): value is TikTokPublicationObservation =>
  typeof value === "string" && (TIKTOK_PUBLICATION_OBSERVATIONS as readonly string[]).includes(value);

export type ObservationPlan =
  | Readonly<{
      code: "APPLY";
      nextState: PublicationState;
      verificationState: "UPLOAD_ACCEPTED" | "REMOTE_PUBLICATION_VERIFIED" | "REMOTE_PUBLICATION_FAILED" | "REMOTE_STATE_UNKNOWN";
      transportKind: "REAL_TIKTOK" | "NONE";
      reconciliationState: "NONE" | "REQUIRED";
    }>
  | Readonly<{ code: "REJECTED"; reason: "TERMINAL_STATE" | "OBSERVATION_NOT_ALLOWED" }>
  /**
   * The observation is strictly weaker than the stored state, so it is acknowledged
   * without a write. This is what makes the live adapter path safe: the adapter
   * reports DISPATCH_ACCEPTED after Core has already moved the row to UPLOADING, and
   * a retried grant reports UPLOAD_STARTED again. A backwards transition is still a
   * rejection; only an already-implied observation is absorbed.
   */
  | Readonly<{ code: "SUPERSEDED"; reason: "OBSERVATION_ALREADY_IMPLIED" }>;

/** Pure state machine shared by the API route, the recovery job and tests. */
export function planTikTokObservation(current: PublicationState, observation: TikTokPublicationObservation): ObservationPlan {
  if (current === "PUBLISHED_PRIVATE") {
    return Object.freeze({ code: "REJECTED" as const, reason: "TERMINAL_STATE" as const });
  }
  if (current === "CANCELLED") return Object.freeze({ code: "REJECTED" as const, reason: "TERMINAL_STATE" as const });

  const apply = (
    nextState: PublicationState,
    verificationState: Extract<ObservationPlan, { code: "APPLY" }>["verificationState"],
    reconciliationState: "NONE" | "REQUIRED" = "NONE",
    transportKind: "REAL_TIKTOK" | "NONE" = "REAL_TIKTOK",
  ): ObservationPlan => canTransitionPublication(current, nextState)
    ? Object.freeze({ code: "APPLY" as const, nextState, verificationState, transportKind, reconciliationState })
    : Object.freeze({ code: "REJECTED" as const, reason: "OBSERVATION_NOT_ALLOWED" as const });

  const superseded: ObservationPlan = Object.freeze({
    code: "SUPERSEDED" as const,
    reason: "OBSERVATION_ALREADY_IMPLIED" as const,
  });

  switch (observation) {
    case "DISPATCH_ACCEPTED":
      if (current === "QUEUED" || current === "UPLOADING" || current === "RECONCILING") return superseded;
      return apply("QUEUED", "UPLOAD_ACCEPTED", "NONE", "NONE");
    case "UPLOAD_STARTED":
      if (current === "UPLOADING") return superseded;
      return apply("UPLOADING", "REMOTE_STATE_UNKNOWN", "NONE", "REAL_TIKTOK");
    case "PUBLISH_PRIVATE_CONFIRMED":
      // An interrupted transfer must be reconciled before it can be confirmed.
      if (current === "INTERRUPTED" || current === "QUEUED") return apply("RECONCILING", "REMOTE_STATE_UNKNOWN", "REQUIRED");
      return apply("PUBLISHED_PRIVATE", "REMOTE_PUBLICATION_VERIFIED");
    case "OUTCOME_UNKNOWN":
      if (current === "INTERRUPTED") return apply("RECONCILING", "REMOTE_STATE_UNKNOWN", "REQUIRED");
      return apply("INTERRUPTED", "REMOTE_STATE_UNKNOWN", "REQUIRED");
    case "PERMANENT_FAILURE":
    case "AUTH_FAILED":
      return apply("FAILED", "REMOTE_PUBLICATION_FAILED");
    default:
      return Object.freeze({ code: "REJECTED" as const, reason: "OBSERVATION_NOT_ALLOWED" as const });
  }
}

export type ObservationCommand = Readonly<{
  principal: PublicationPrincipal;
  publicationId: string;
  expectedRevision: number;
  observationId: string;
  observation: TikTokPublicationObservation;
  provider?: Readonly<{ publishId?: string; providerStatus?: string; observedAt?: string }>;
  error?: Readonly<{ code: string; message?: string }>;
}>;

export type ObservationResult =
  | Readonly<{ code: "APPLIED"; record: PublicationRecord; duplicate: false }>
  | Readonly<{ code: "DUPLICATE"; record: PublicationRecord; duplicate: true }>
  | Readonly<{ code: "REJECTED"; reason: "TERMINAL_STATE" | "OBSERVATION_NOT_ALLOWED" | "PUBLISH_ID_REQUIRED" }>
  | Readonly<{ code: "INVALID_COMMAND" }>
  | Readonly<{ code: "NOT_FOUND" }>
  | Readonly<{ code: "CONFLICT" }>
  | Readonly<{ code: "INVALID_RECORD" }>;

const idPattern = /^[A-Za-z0-9_.:@-]{1,256}$/;

export async function applyPublicationObservation(
  client: PublicationQueryClient,
  command: ObservationCommand,
): Promise<ObservationResult> {
  if (!idPattern.test(command.publicationId) || !idPattern.test(command.observationId)
    || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1
    || !isTikTokPublicationObservation(command.observation)) {
    return Object.freeze({ code: "INVALID_COMMAND" as const });
  }
  const scoped = await client.query(
    `SELECT * FROM workflow.publication_intents
     WHERE id = $1 AND owner_uid = $2 AND tenant_id = $3 AND platform = 'tiktok'`,
    [command.publicationId, command.principal.ownerUid, command.principal.tenantId],
  );
  const row = scoped.rows[0];
  if (!row) return Object.freeze({ code: "NOT_FOUND" as const });
  const record = decodePublicationRecord(row);
  if (!record) return Object.freeze({ code: "INVALID_RECORD" as const });

  const previousObservation = typeof record.receipt?.observationId === "string" ? record.receipt.observationId : undefined;
  if (previousObservation === command.observationId) {
    return Object.freeze({ code: "DUPLICATE" as const, record, duplicate: true });
  }
  const plan = planTikTokObservation(record.state, command.observation);
  if (plan.code === "SUPERSEDED") return Object.freeze({ code: "DUPLICATE" as const, record, duplicate: true });
  if (plan.code === "REJECTED") return Object.freeze({ code: "REJECTED" as const, reason: plan.reason });
  if (plan.nextState === "PUBLISHED_PRIVATE" && !command.provider?.publishId) {
    return Object.freeze({ code: "REJECTED" as const, reason: "PUBLISH_ID_REQUIRED" as const });
  }

  const receipt = plan.nextState === "PUBLISHED_PRIVATE"
    ? Object.freeze({
        verification: "VERIFIED" as const,
        observationId: command.observationId,
        publishId: command.provider?.publishId,
        providerStatus: command.provider?.providerStatus ?? "PUBLISH_COMPLETE",
        observedAt: command.provider?.observedAt ?? new Date().toISOString(),
      })
    : null;
  const lastError = command.error
    ? `${command.error.code}${command.error.message ? `: ${command.error.message.slice(0, 1000)}` : ""}`
    : null;

  const updated = await client.query(
    `UPDATE workflow.publication_intents
     SET state = $5,
         revision = revision + 1,
         transport_kind = $6,
         verification_state = $7,
         reconciliation_state = $8,
         remote_video_id = COALESCE($9, remote_video_id),
         remote_processing_status = COALESCE($10, remote_processing_status),
         receipt = COALESCE($11::jsonb, receipt),
         last_error = COALESCE($12, last_error),
         updated_at = transaction_timestamp()
     WHERE id = $1 AND owner_uid = $2 AND tenant_id = $3 AND revision = $4
       AND state = $13 AND platform = 'tiktok'
     RETURNING *`,
    [
      command.publicationId,
      command.principal.ownerUid,
      command.principal.tenantId,
      command.expectedRevision,
      plan.nextState,
      plan.transportKind,
      plan.verificationState,
      plan.reconciliationState,
      command.provider?.publishId ?? null,
      command.provider?.providerStatus ?? null,
      receipt ? JSON.stringify(receipt) : null,
      lastError,
      record.state,
    ],
  );
  const nextRow = updated.rows[0];
  if (!nextRow) return Object.freeze({ code: "CONFLICT" as const });
  const nextRecord = decodePublicationRecord(nextRow);
  if (!nextRecord) return Object.freeze({ code: "INVALID_RECORD" as const });

  await client.query(
    `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
     VALUES ($1, $2, $3, $4)`,
    [
      nextRecord.id,
      command.principal.ownerUid,
      nextRecord.state,
      JSON.stringify({
        observation: command.observation,
        observationId: command.observationId,
        from: record.state,
        publishId: command.provider?.publishId ?? null,
        error: command.error?.code ?? null,
      }),
    ],
  );

  return Object.freeze({ code: "APPLIED" as const, record: nextRecord, duplicate: false });
}
