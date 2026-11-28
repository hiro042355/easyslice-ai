import { createHash, randomUUID } from "node:crypto";
import { admitPublicationAsset, type AssetOwnershipLookup } from "../publicationIntegration/assetAdmission";
import { issuePublicationGrant } from "../publicationIntegration/grant";
import { sendTikTokPublication, type AdapterCallOutcome, type AdapterPublicationResult } from "../publicationIntegration/adapterTransport";
import { applyPublicationObservation, type TikTokPublicationObservation } from "../publicationIntegration/observation";
import { resolvePublicationPrincipal } from "../publicationIntegration/principal";
import {
  createPublicationRepository,
  type PublicationQueryClient,
  type PublicationRecord,
} from "../publicationRecords/repository";
import { validatePublicationRights, type RightsRegistry } from "../rightsRegistry/gate";
import {
  createAdapterRateLimiter,
  type AdapterRateLimitPolicy,
  type AdapterRateLimiter,
} from "./adapterRateLimit";
import type { TikTokPublicationCommand } from "./requestBoundary";

/**
 * Core TikTok publication execution.
 *
 * This is the module the API route actually calls. It is the only place that walks
 * the durable publication record from creation to a provider observation, so the
 * state machine cannot be re-implemented (and diverged) by a caller.
 *
 * Ordering rules that must not be relaxed:
 *   1. Principal, ownership, revision/digest and rights are decided *before* a row
 *      exists, so a rejected request leaves nothing behind.
 *   2. The record is QUEUED (with the rights snapshot) before a grant is signed.
 *   3. UPLOADING is recorded before the adapter is called, so a crash between the
 *      call and the response is visible as an interrupted transfer.
 *   4. The adapter is called at most once per execution. There is no retry loop: an
 *      ambiguous answer becomes OUTCOME_UNKNOWN and reconciliation, never a resend.
 *
 * Upload sessions stay out of Core: the adapter owns the resume token, Core keeps
 * only the publication record, so `publication_upload_sessions_transport_ck` keeps
 * admitting FAKE_DETERMINISTIC sessions only.
 */
export type TikTokPublicationAdapterConfig = Readonly<{
  /** Adapter origin, e.g. http://127.0.0.1:8787 (no trailing slash required). */
  endpoint: string;
  /** Core -> adapter HMAC identity. */
  transportKeyId: string;
  transportSecret: string;
  /** Grant signing identity; the adapter holds the matching public verification key. */
  grantKeyId: string;
  grantSigningKey: string;
}>;

export type TikTokPublicationServiceDependencies = Readonly<{
  client: PublicationQueryClient;
  ownership: AssetOwnershipLookup;
  rights: RightsRegistry | undefined;
  adapter: TikTokPublicationAdapterConfig;
  tenantId: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
  newGrantId?: () => string;
  /** Durable per-tenant budget and in-flight lease; defaults to the PostgreSQL limiter. */
  rateLimiter?: AdapterRateLimiter;
  rateLimitPolicy?: Partial<AdapterRateLimitPolicy>;
}>;

export type TikTokPublicationExecutionInput = Readonly<{
  ownerUid: string;
  idempotencyKey: string;
  command: TikTokPublicationCommand;
}>;

export type TikTokPublicationExecution =
  | Readonly<{ code: "PUBLICATION_CONFIRMED"; record: PublicationRecord }>
  | Readonly<{ code: "PUBLICATION_IN_PROGRESS"; record: PublicationRecord; outcomeUnknown: boolean }>
  | Readonly<{ code: "PUBLICATION_FAILED"; record: PublicationRecord }>
  | Readonly<{ code: "PUBLICATION_IDEMPOTENCY_CONFLICT" }>
  | Readonly<{ code: "PUBLICATION_RATE_LIMITED"; retryAfterSeconds: number }>
  | Readonly<{ code: "PUBLICATION_REJECTED"; status: number; error: string }>;

const rejected = (status: number, error: string): TikTokPublicationExecution =>
  Object.freeze({ code: "PUBLICATION_REJECTED" as const, status, error });

const observationIdFor = (publicationId: string, label: string, publishId?: string): string =>
  `obs-${createHash("sha256").update(`${publicationId}:${label}:${publishId ?? ""}`, "utf8").digest("hex")}`;

export type PlannedResultObservation = Readonly<{
  observation: TikTokPublicationObservation;
  provider?: Readonly<{ publishId?: string; providerStatus?: string; observedAt?: string }>;
  error?: Readonly<{ code: string; message?: string }>;
}>;

const UNKNOWN: PlannedResultObservation = Object.freeze({
  observation: "OUTCOME_UNKNOWN" as const,
  error: Object.freeze({ code: "ADAPTER_OUTCOME_UNKNOWN" }),
});

/**
 * Pure adapter-result -> Core-observation mapping.
 *
 * Any answer that does not prove "TikTok published nothing" is OUTCOME_UNKNOWN.
 * In particular a rejected or unreadable transport, a mismatched publication id and
 * a `CORE_STATE_REJECTED` answer from the adapter may all follow a request that did
 * reach TikTok, so none of them may be recorded as a failure that invites a resend.
 */
export function planTikTokAdapterResult(
  publicationId: string,
  outcome: AdapterCallOutcome,
): PlannedResultObservation {
  if (outcome.code === "TRANSPORT_FAILURE") {
    return Object.freeze({
      observation: "OUTCOME_UNKNOWN" as const,
      error: Object.freeze({ code: `ADAPTER_TRANSPORT_${outcome.reason}` }),
    });
  }
  if (outcome.code === "MALFORMED_RESPONSE") {
    return Object.freeze({
      observation: "OUTCOME_UNKNOWN" as const,
      error: Object.freeze({ code: "ADAPTER_RESPONSE_MALFORMED" }),
    });
  }
  const result: AdapterPublicationResult = outcome.result;
  if ("publicationId" in result && result.publicationId !== publicationId) {
    return Object.freeze({
      observation: "OUTCOME_UNKNOWN" as const,
      error: Object.freeze({ code: "ADAPTER_PUBLICATION_MISMATCH" }),
    });
  }
  switch (result.code) {
    case "PUBLISHED_PRIVATE":
      return Object.freeze({
        observation: "PUBLISH_PRIVATE_CONFIRMED" as const,
        provider: Object.freeze({ publishId: result.publishId, providerStatus: "PUBLISH_COMPLETE" }),
      });
    case "DUPLICATE_PUBLICATION":
      return result.publishId
        ? Object.freeze({
            observation: "PUBLISH_PRIVATE_CONFIRMED" as const,
            provider: Object.freeze({ publishId: result.publishId, providerStatus: "DUPLICATE_PUBLICATION" }),
          })
        : UNKNOWN;
    case "PROVIDER_REJECTED":
      return Object.freeze({
        observation: "PERMANENT_FAILURE" as const,
        error: Object.freeze({ code: "PROVIDER_REJECTED", message: result.providerCode.slice(0, 200) }),
      });
    case "AUTH_FAILED":
      return Object.freeze({
        observation: "AUTH_FAILED" as const,
        error: Object.freeze({ code: "ADAPTER_AUTH_FAILED" }),
      });
    case "GRANT_REJECTED":
      return Object.freeze({
        observation: "PERMANENT_FAILURE" as const,
        error: Object.freeze({ code: "ADAPTER_GRANT_REJECTED", message: result.reason.slice(0, 200) }),
      });
    case "ASSET_REJECTED":
      return Object.freeze({
        observation: "PERMANENT_FAILURE" as const,
        error: Object.freeze({ code: "ADAPTER_ASSET_REJECTED", message: result.reason.slice(0, 200) }),
      });
    case "ACCOUNT_NOT_BOUND":
      return Object.freeze({
        observation: "PERMANENT_FAILURE" as const,
        error: Object.freeze({ code: "ADAPTER_ACCOUNT_NOT_BOUND" }),
      });
    case "CORE_STATE_REJECTED":
    case "OUTCOME_UNKNOWN":
    default:
      return UNKNOWN;
  }
}

const classify = (record: PublicationRecord): TikTokPublicationExecution => {
  switch (record.state) {
    case "PUBLISHED_PRIVATE":
      return Object.freeze({ code: "PUBLICATION_CONFIRMED" as const, record });
    case "FAILED":
    case "CANCELLED":
      return Object.freeze({ code: "PUBLICATION_FAILED" as const, record });
    default:
      return Object.freeze({ code: "PUBLICATION_IN_PROGRESS" as const, record, outcomeUnknown: record.state === "INTERRUPTED" });
  }
};

export async function executeTikTokPublication(
  deps: TikTokPublicationServiceDependencies,
  input: TikTokPublicationExecutionInput,
): Promise<TikTokPublicationExecution> {
  const now = deps.now ?? (() => Date.now());
  const repository = createPublicationRepository(deps.client);

  const principalResult = resolvePublicationPrincipal({ ownerUid: input.ownerUid, tenantId: deps.tenantId });
  if (principalResult.code !== "PRINCIPAL_BOUND") return rejected(401, "principal_unavailable");
  const principal = principalResult.principal;

  // Budget and the in-flight lease are consumed before any row is written, so a 429
  // leaves nothing behind and the same idempotency key can be retried later. A replay
  // of a key that already has a record never reaches the adapter, so it does not spend
  // budget and cannot be rate limited.
  const limiter = deps.rateLimiter ?? createAdapterRateLimiter(deps.client, deps.rateLimitPolicy);
  const leaseId = `pub-${createHash("sha256")
    .update(`${principal.tenantId}:${principal.ownerUid}:${input.idempotencyKey}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
  const existing = await deps.client.query<{ id: string }>(
    `SELECT id FROM workflow.publication_intents
     WHERE owner_uid = $1 AND tenant_id = $2 AND idempotency_key = $3 AND platform = 'tiktok'`,
    [principal.ownerUid, principal.tenantId, input.idempotencyKey],
  );
  const isReplay = existing.rows.length > 0;
  if (!isReplay) {
    const budget = await limiter.consume(principal.tenantId, "PUBLISH");
    if (budget.code === "LIMITED") {
      return Object.freeze({ code: "PUBLICATION_RATE_LIMITED" as const, retryAfterSeconds: budget.retryAfterSeconds });
    }
    const lease = await limiter.acquireLease(principal.tenantId, leaseId);
    if (lease.code === "LIMITED") {
      return Object.freeze({ code: "PUBLICATION_RATE_LIMITED" as const, retryAfterSeconds: lease.retryAfterSeconds });
    }
  }

  try {
    const admission = await admitPublicationAsset({
      principal,
      intent: input.command.intent,
      declaration: input.command.declaration,
      ownership: deps.ownership,
    });
    if (admission.code !== "ASSET_ADMITTED") {
      const status = admission.reason === "ASSET_NOT_OWNED" ? 403 : 422;
      return rejected(status, `asset_${admission.reason.toLowerCase()}`);
    }

    const rights = await validatePublicationRights(
      deps.rights,
      principal.ownerUid,
      input.command.rightsKey,
      now(),
      "tiktok",
    );
    if (!rights.ok) return rejected(403, `rights_${rights.code.toLowerCase()}`);

    const created = await repository.create({
      ownerUid: principal.ownerUid,
      tenantId: principal.tenantId,
      intent: admission.intent,
      metadata: input.command.metadata,
      channelId: input.command.channelId,
      rightsEvidenceRef: rights.snapshot.evidenceRef,
    });
    if (created.code === "CONFLICT") return Object.freeze({ code: "PUBLICATION_IDEMPOTENCY_CONFLICT" as const });
    if (created.code === "INVALID_RECORD") return rejected(422, "publication_record_invalid");
    if (created.code !== "APPLIED" && created.code !== "EXISTING") return rejected(409, "publication_create_conflict");

    // A replay of the same idempotency key never re-sends: the stored outcome is the answer.
    if (created.code === "EXISTING") return classify(created.record);

    let current = created.record;
    if (current.state === "AWAITING_CONFIRMATION") {
      const queued = await repository.transition(
        principal.ownerUid,
        current.id,
        current.revision,
        "QUEUED",
        "tiktok publication admitted and rights snapshot captured",
        rights.snapshot,
      );
      if (queued.code !== "APPLIED") {
        if (queued.code === "CONFLICT" && queued.record) return classify(queued.record);
        return rejected(409, "publication_queue_conflict");
      }
      current = queued.record;
    }

    const grant = issuePublicationGrant({
      principal,
      publicationId: current.id,
      admission,
      contentFormat: input.command.metadata.contentFormat,
      signingKey: deps.adapter.grantSigningKey,
      keyId: deps.adapter.grantKeyId,
      grantId: (deps.newGrantId ?? randomUUID)(),
      now: now(),
    });
    if (grant.code !== "GRANT_ISSUED") {
      await repository.transition(principal.ownerUid, current.id, current.revision, "FAILED", `grant_issue_${grant.reason}`);
      const failed = await repository.get(principal.ownerUid, current.id);
      return failed ? classify(failed) : rejected(409, "publication_grant_unavailable");
    }

    const started = await applyPublicationObservation(deps.client, {
      principal,
      publicationId: current.id,
      expectedRevision: current.revision,
      observationId: observationIdFor(current.id, "UPLOAD_STARTED"),
      observation: "UPLOAD_STARTED",
    });
    if (started.code !== "APPLIED" && started.code !== "DUPLICATE") {
      return rejected(409, "publication_dispatch_state_conflict");
    }
    current = started.record;

    const outcome = await sendTikTokPublication({
      grant: grant.token,
      endpoint: deps.adapter.endpoint,
      keyId: deps.adapter.transportKeyId,
      secret: deps.adapter.transportSecret,
      now: now(),
      fetchImpl: deps.fetchImpl,
    });
    const planned = planTikTokAdapterResult(current.id, outcome);

    const applied = await applyPublicationObservation(deps.client, {
      principal,
      publicationId: current.id,
      expectedRevision: current.revision,
      observationId: observationIdFor(current.id, planned.observation, planned.provider?.publishId),
      observation: planned.observation,
      provider: planned.provider,
      error: planned.error,
    });
    if (applied.code === "APPLIED" || applied.code === "DUPLICATE") return classify(applied.record);
    // The adapter answered but Core could not record it here. That is expected when the
    // adapter already reported the same outcome over the observation leg, which moves the
    // revision Core was holding. A terminal row is the authoritative answer; anything else
    // is genuinely unknown and must be reconciled, never re-sent.
    const reconciled = await repository.get(principal.ownerUid, current.id);
    if (reconciled && (reconciled.state === "PUBLISHED_PRIVATE" || reconciled.state === "FAILED")) {
      return classify(reconciled);
    }
    return Object.freeze({
      code: "PUBLICATION_IN_PROGRESS" as const,
      record: reconciled ?? current,
      outcomeUnknown: true,
    });
  } finally {
    if (!isReplay) await limiter.releaseLease(principal.tenantId, leaseId);
  }
}
