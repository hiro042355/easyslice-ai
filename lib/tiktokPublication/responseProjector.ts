import type { PublicationEvent, PublicationRecord } from "../publicationRecords/repository";
import type { TikTokPublicationExecution } from "./execution";

/**
 * Response projection for the TikTok publication API.
 *
 * The wire body is a small, stable view of the durable record. It never contains a
 * grant token, transport secret, owner uid, tenant id, rights snapshot or provider
 * credential, and every response is `private, no-store` because the body is scoped to
 * the authenticated caller.
 */
const NO_STORE = "private, no-store";

export type TikTokPublicationView = Readonly<{
  publicationId: string;
  platform: "tiktok";
  state: string;
  revision: number;
  verificationState: string;
  transportKind: string;
  outcomeUnknown: boolean;
  publishId: string | null;
  lastError: string | null;
  updatedAt: string;
}>;

export function projectTikTokPublicationRecord(
  record: PublicationRecord,
  outcomeUnknown = record.state === "INTERRUPTED",
): TikTokPublicationView {
  const receiptPublishId = record.receipt?.publishId;
  return Object.freeze({
    publicationId: record.id,
    platform: "tiktok" as const,
    state: record.state,
    revision: record.revision,
    verificationState: record.verificationState,
    transportKind: record.transportKind,
    outcomeUnknown,
    publishId: typeof receiptPublishId === "string" ? receiptPublishId : record.remoteVideoId,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  });
}

export function tiktokPublicationJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.freeze({ "content-type": "application/json", "cache-control": NO_STORE }),
  });
}

export function tiktokPublicationError(status: number, error: string): Response {
  return tiktokPublicationJson(status, Object.freeze({ error }));
}

export function projectTikTokPublicationExecution(
  execution: TikTokPublicationExecution,
): Readonly<{ status: number; body: unknown }> {
  switch (execution.code) {
    case "PUBLICATION_CONFIRMED":
      return Object.freeze({ status: 200, body: Object.freeze({ publication: projectTikTokPublicationRecord(execution.record) }) });
    case "PUBLICATION_FAILED":
      return Object.freeze({ status: 502, body: Object.freeze({ publication: projectTikTokPublicationRecord(execution.record) }) });
    case "PUBLICATION_IN_PROGRESS":
      return Object.freeze({
        status: 202,
        body: Object.freeze({
          publication: projectTikTokPublicationRecord(execution.record, execution.outcomeUnknown),
          recovery: execution.outcomeUnknown ? "RECONCILE_PUBLICATION_BEFORE_RETRY" : "OBSERVE_SAME_PUBLICATION",
        }),
      });
    case "PUBLICATION_IDEMPOTENCY_CONFLICT":
      return Object.freeze({ status: 409, body: Object.freeze({ error: "idempotency_key_conflict" }) });
    case "PUBLICATION_REJECTED":
    default:
      return Object.freeze({ status: execution.status, body: Object.freeze({ error: execution.error }) });
  }
}

export function projectTikTokPublicationRead(
  read: Readonly<{ record: PublicationRecord; events: readonly PublicationEvent[] }>,
): Response {
  return tiktokPublicationJson(200, Object.freeze({
    publication: projectTikTokPublicationRecord(read.record),
    events: read.events.map((event) => Object.freeze({
      eventId: event.eventId,
      toState: event.toState,
      detail: event.detail,
      createdAt: event.createdAt,
    })),
  }));
}
