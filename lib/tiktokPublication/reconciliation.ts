import { createHash } from "node:crypto";
import {
  queryTikTokPublicationStatus,
  type AdapterPublicationStatusView,
} from "../publicationIntegration/adapterTransport";
import { applyPublicationObservation } from "../publicationIntegration/observation";
import { principalOwnsPublication, resolvePublicationPrincipal } from "../publicationIntegration/principal";
import { createPublicationRepository, type PublicationQueryClient, type PublicationRecord } from "../publicationRecords/repository";
import {
  createAdapterRateLimiter,
  type AdapterRateLimitPolicy,
  type AdapterRateLimiter,
} from "./adapterRateLimit";

/**
 * OUTCOME_UNKNOWN reconciliation.
 *
 * This is a read-only recovery path: it asks the adapter what it recorded, then
 * applies that answer through the same observation state machine the API uses.
 * It never calls the publication endpoint and never decides on its own that a
 * retry is safe. When the adapter has no ledger entry, or the answer is not a
 * settled outcome, Core keeps OUTCOME_UNKNOWN and asks again later.
 */
export type TikTokReconciliationDependencies = Readonly<{
  client: PublicationQueryClient;
  adapter: Readonly<{
    endpoint: string;
    transportKeyId: string;
    transportSecret: string;
  }>;
  tenantId: string;
  rateLimiter?: AdapterRateLimiter;
  policy?: Partial<AdapterRateLimitPolicy>;
  now?: () => number;
  fetchImpl?: typeof fetch;
}>;

export type TikTokReconciliationResult =
  | Readonly<{
      code: "PUBLICATION_CONFIRMED";
      record: PublicationRecord;
      adapterState: AdapterPublicationStatusView["adapterState"];
    }>
  | Readonly<{
      code: "PUBLICATION_FAILED";
      record: PublicationRecord;
      adapterState: AdapterPublicationStatusView["adapterState"];
    }>
  | Readonly<{
      code: "PUBLICATION_STILL_UNKNOWN";
      record: PublicationRecord;
      adapterState: AdapterPublicationStatusView["adapterState"] | "ADAPTER_UNREACHABLE";
      retryAfterSeconds: number;
      nextCheckAt: string;
    }>
  | Readonly<{ code: "PUBLICATION_NOT_RECONCILABLE"; record: PublicationRecord }>
  | Readonly<{ code: "PUBLICATION_NOT_FOUND" }>
  | Readonly<{ code: "PUBLICATION_RATE_LIMITED"; retryAfterSeconds: number; nextCheckAt: string }>
  | Readonly<{ code: "PUBLICATION_PRINCIPAL_REJECTED" }>;

/** States where Core itself has no settled answer. */
const RECONCILABLE_STATES: ReadonlySet<PublicationRecord["state"]> = new Set(["INTERRUPTED", "RECONCILING"]);

const PROCESSING_RETRY_SECONDS = 30;
const NO_EVIDENCE_RETRY_SECONDS = 300;

const nextCheck = (nowMs: number, retryAfterSeconds: number): string =>
  new Date(nowMs + retryAfterSeconds * 1000).toISOString();

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Deterministic id so replaying the same reconciliation is a duplicate, not a new fact. */
const reconciliationObservationId = (
  publicationId: string,
  label: string,
  publishId?: string,
  suffix = "",
): string => `obs-${sha256Hex(`${publicationId}:RECONCILIATION:${label}:${publishId ?? ""}${suffix}`).slice(0, 40)}`;

type AttemptOutcome = Readonly<{
  adapterState: string;
  result: string;
  errorCategory?: string | null;
}>;

const recordAttempt = async (
  client: PublicationQueryClient,
  publicationId: string,
  ownerUid: string,
  attempt: AttemptOutcome,
): Promise<void> => {
  try {
    await client.query(
      `INSERT INTO workflow.publication_reconciliation_attempts
         (publication_id, owner_uid, attempt, adapter_state, result, error_category)
       SELECT $1, $2,
              COALESCE((SELECT MAX(attempt) FROM workflow.publication_reconciliation_attempts
                         WHERE publication_id = $1 AND owner_uid = $2), 0) + 1,
              $3, $4, $5
       ON CONFLICT (publication_id, attempt) DO NOTHING`,
      [publicationId, ownerUid, attempt.adapterState, attempt.result, attempt.errorCategory ?? null],
    );
  } catch {
    // Attempt logging is auxiliary evidence. A logging failure must never change the
    // recovery decision or mask the adapter's answer.
  }
};

export async function reconcileTikTokPublication(
  deps: TikTokReconciliationDependencies,
  input: Readonly<{ ownerUid: string; publicationId: string }>,
): Promise<TikTokReconciliationResult> {
  const now = deps.now ?? Date.now;
  const resolution = resolvePublicationPrincipal({
    ownerUid: input.ownerUid,
    tenantId: deps.tenantId,
  });
  if (resolution.code !== "PRINCIPAL_BOUND") {
    return Object.freeze({ code: "PUBLICATION_PRINCIPAL_REJECTED" as const });
  }
  const principal = resolution.principal;
  const limiter = deps.rateLimiter ?? createAdapterRateLimiter(deps.client, deps.policy);

  const budget = await limiter.consume(principal.tenantId, "STATUS");
  if (budget.code === "LIMITED") {
    return Object.freeze({
      code: "PUBLICATION_RATE_LIMITED" as const,
      retryAfterSeconds: budget.retryAfterSeconds,
      nextCheckAt: nextCheck(now(), budget.retryAfterSeconds),
    });
  }

  const repository = createPublicationRepository(deps.client);
  const record = await repository.get(principal.ownerUid, input.publicationId);
  if (!record || record.platform !== "tiktok" || !principalOwnsPublication(principal, principal.ownerUid, record)) {
    // Owner/tenant scoping happens in the query itself, so a foreign identifier is
    // indistinguishable from a missing one.
    return Object.freeze({ code: "PUBLICATION_NOT_FOUND" as const });
  }
  if (!RECONCILABLE_STATES.has(record.state)) {
    return Object.freeze({ code: "PUBLICATION_NOT_RECONCILABLE" as const, record });
  }

  const outcome = await queryTikTokPublicationStatus({
    publicationId: record.id,
    tenantId: principal.tenantId,
    endpoint: deps.adapter.endpoint,
    keyId: deps.adapter.transportKeyId,
    secret: deps.adapter.transportSecret,
    now: now(),
    fetchImpl: deps.fetchImpl,
  });

  if (outcome.code === "RATE_LIMITED") {
    await recordAttempt(deps.client, record.id, principal.ownerUid, {
      adapterState: "RATE_LIMITED",
      result: "RATE_LIMITED",
      errorCategory: "ADAPTER_RATE_LIMITED",
    });
    return Object.freeze({
      code: "PUBLICATION_RATE_LIMITED" as const,
      retryAfterSeconds: outcome.retryAfterSeconds,
      nextCheckAt: nextCheck(now(), outcome.retryAfterSeconds),
    });
  }

  if (outcome.code === "TRANSPORT_FAILURE" || outcome.code === "MALFORMED_RESPONSE") {
    const retryAfterSeconds = PROCESSING_RETRY_SECONDS;
    await recordAttempt(deps.client, record.id, principal.ownerUid, {
      adapterState: "ADAPTER_UNREACHABLE",
      result: outcome.code,
      errorCategory: outcome.code === "TRANSPORT_FAILURE" ? `ADAPTER_${outcome.reason}` : "ADAPTER_MALFORMED_RESPONSE",
    });
    const current = (await repository.get(principal.ownerUid, record.id)) ?? record;
    return Object.freeze({
      code: "PUBLICATION_STILL_UNKNOWN" as const,
      record: current,
      adapterState: "ADAPTER_UNREACHABLE" as const,
      retryAfterSeconds,
      nextCheckAt: nextCheck(now(), retryAfterSeconds),
    });
  }

  const status = outcome.status;
  const attempt = (result: string, errorCategory?: string | null): Promise<void> =>
    recordAttempt(deps.client, record.id, principal.ownerUid, {
      adapterState: status.adapterState,
      result,
      errorCategory: errorCategory ?? status.errorCategory,
    });

  if (status.adapterState === "PUBLISHED_PRIVATE" && status.settled) {
    if (!status.remotePublicationId) {
      // A settled success without the remote id is not enough evidence to confirm.
      const retryAfterSeconds = NO_EVIDENCE_RETRY_SECONDS;
      await attempt("UNKNOWN_NO_REMOTE_ID");
      const current = (await repository.get(principal.ownerUid, record.id)) ?? record;
      return Object.freeze({
        code: "PUBLICATION_STILL_UNKNOWN" as const,
        record: current,
        adapterState: status.adapterState,
        retryAfterSeconds,
        nextCheckAt: nextCheck(now(), retryAfterSeconds),
      });
    }
    // Captured once: the narrowing from the guard above does not survive into the
    // retry closure.
    const remotePublicationId = status.remotePublicationId;
    const observationId = reconciliationObservationId(
      record.id,
      "PUBLISH_PRIVATE_CONFIRMED",
      remotePublicationId,
    );
    const provider = Object.freeze({
      publishId: remotePublicationId,
      providerStatus: status.providerStatus ?? undefined,
      observedAt: status.updatedAt ?? undefined,
    });
    // INTERRUPTED -> RECONCILING records the evidence; a second, distinct
    // observation confirms it. Both steps reuse the existing transition table.
    const confirmObservation = async (from: PublicationRecord): Promise<PublicationRecord> => {
      const confirmed = await applyPublicationObservation(deps.client, {
        principal,
        publicationId: record.id,
        expectedRevision: from.revision,
        observationId: reconciliationObservationId(
          record.id,
          "PUBLISH_PRIVATE_CONFIRMED",
          remotePublicationId,
          ":confirm",
        ),
        observation: "PUBLISH_PRIVATE_CONFIRMED",
        provider,
      });
      if (confirmed.code === "APPLIED" || confirmed.code === "DUPLICATE") return confirmed.record;
      return (await repository.get(principal.ownerUid, record.id)) ?? from;
    };
    const first = await applyPublicationObservation(deps.client, {
      principal,
      publicationId: record.id,
      expectedRevision: record.revision,
      observationId,
      observation: "PUBLISH_PRIVATE_CONFIRMED",
      provider,
    });
    if (first.code === "APPLIED" || first.code === "DUPLICATE") {
      let current = first.record;
      if (current.state === "RECONCILING") current = await confirmObservation(current);
      if (current.state === "PUBLISHED_PRIVATE") {
        await attempt("CONFIRMED");
        return Object.freeze({
          code: "PUBLICATION_CONFIRMED" as const,
          record: current,
          adapterState: status.adapterState,
        });
      }
    }
    const retryAfterSeconds = PROCESSING_RETRY_SECONDS;
    await attempt("CONFIRMATION_NOT_APPLIED");
    // A concurrent reconciliation may have applied the same evidence while this call
    // was holding an older revision. The durable row, not this call's revision, is the
    // answer: finish the confirmation it started rather than reporting a stale unknown.
    let current = (await repository.get(principal.ownerUid, record.id)) ?? record;
    if (current.state === "RECONCILING") current = await confirmObservation(current);
    if (current.state === "PUBLISHED_PRIVATE") {
      await attempt("CONFIRMED");
      return Object.freeze({
        code: "PUBLICATION_CONFIRMED" as const,
        record: current,
        adapterState: status.adapterState,
      });
    }
    return Object.freeze({
      code: "PUBLICATION_STILL_UNKNOWN" as const,
      record: current,
      adapterState: status.adapterState,
      retryAfterSeconds,
      nextCheckAt: nextCheck(now(), retryAfterSeconds),
    });
  }

  if (status.adapterState === "FAILED" && status.settled) {
    const applied = await applyPublicationObservation(deps.client, {
      principal,
      publicationId: record.id,
      expectedRevision: record.revision,
      observationId: reconciliationObservationId(record.id, "PERMANENT_FAILURE"),
      observation: "PERMANENT_FAILURE",
      error: { code: `ADAPTER_${status.errorCategory ?? "PUBLICATION_FAILED"}` },
    });
    if (applied.code === "APPLIED" || applied.code === "DUPLICATE") {
      await attempt("FAILED");
      return Object.freeze({
        code: "PUBLICATION_FAILED" as const,
        record: applied.record,
        adapterState: status.adapterState,
      });
    }
    const current = (await repository.get(principal.ownerUid, record.id)) ?? record;
    return Object.freeze({ code: "PUBLICATION_NOT_RECONCILABLE" as const, record: current });
  }

  // DISPATCHING / UPLOADING / PUBLISHING / RECONCILIATION_PENDING / UNKNOWN /
  // NOT_FOUND: the adapter has no settled answer. NOT_FOUND only means "no ledger
  // entry", which is not proof that TikTok has no post. Never treat it as unused.
  const retryAfterSeconds = status.adapterState === "NOT_FOUND" || status.adapterState === "UNKNOWN"
    ? NO_EVIDENCE_RETRY_SECONDS
    : PROCESSING_RETRY_SECONDS;
  await attempt("STILL_UNKNOWN");
  const current = (await repository.get(principal.ownerUid, record.id)) ?? record;
  return Object.freeze({
    code: "PUBLICATION_STILL_UNKNOWN" as const,
    record: current,
    adapterState: status.adapterState,
    retryAfterSeconds,
    nextCheckAt: nextCheck(now(), retryAfterSeconds),
  });
}
