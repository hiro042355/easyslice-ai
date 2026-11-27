import "server-only";
import { createDurableMediaOwnershipRepository } from "@/lib/server/durableMediaOwnership";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import { createRightsRegistry } from "@/lib/rightsRegistry/repository";
import { createPublicationRepository, type PublicationRecord } from "@/lib/publicationRecords/repository";
import type { PublicationEvent } from "@/lib/publicationRecords/repository";
import { executeTikTokPublication, type TikTokPublicationExecution } from "@/lib/tiktokPublication/execution";
import type { TikTokPublicationCommand } from "@/lib/tiktokPublication/requestBoundary";
import { applyAdapterObservation, type AdapterObservationOutcome } from "@/lib/tiktokPublication/observationApplication";
import type { AdapterObservationReport } from "@/lib/tiktokPublication/observationBoundary";

/**
 * Server wiring for the TikTok publication route.
 *
 * `lib/tiktokPublication/*` holds the testable logic and carries no `server-only`
 * marker. This module is the only place that reads credentials and opens the pool, so
 * the route cannot be imported into a client component and keys never leave the server.
 *
 * Configuration is explicit and all-or-nothing: a half-configured adapter identity
 * must fail closed instead of signing with an undefined secret.
 */
export type TikTokPublicationRuntimeConfig = Readonly<{
  adapterUrl: string;
  transportKeyId: string;
  transportSecret: string;
  grantKeyId: string;
  grantSigningKey: string;
  tenantId: string;
}>;

export type TikTokPublicationRuntimeState =
  | Readonly<{ status: "ready"; config: TikTokPublicationRuntimeConfig }>
  | Readonly<{ status: "unconfigured"; missing: readonly string[] }>;

const required = (env: NodeJS.ProcessEnv): readonly [string, string | undefined][] => Object.freeze([
  ["NEXCUT_TIKTOK_ADAPTER_URL", env.NEXCUT_TIKTOK_ADAPTER_URL],
  ["NEXCUT_TIKTOK_ADAPTER_TRANSPORT_KEY_ID", env.NEXCUT_TIKTOK_ADAPTER_TRANSPORT_KEY_ID],
  ["NEXCUT_TIKTOK_ADAPTER_TRANSPORT_SECRET", env.NEXCUT_TIKTOK_ADAPTER_TRANSPORT_SECRET],
  ["NEXCUT_TIKTOK_GRANT_KEY_ID", env.NEXCUT_TIKTOK_GRANT_KEY_ID],
  ["NEXCUT_TIKTOK_GRANT_SIGNING_KEY", env.NEXCUT_TIKTOK_GRANT_SIGNING_KEY],
] as const);

export function resolveTikTokPublicationRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): TikTokPublicationRuntimeState {
  const missing = required(env)
    .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
    .map(([name]) => name);
  const adapterUrl = env.NEXCUT_TIKTOK_ADAPTER_URL?.trim();
  if (!missing.length && adapterUrl && !/^https?:\/\//.test(adapterUrl)) {
    return Object.freeze({ status: "unconfigured" as const, missing: Object.freeze(["NEXCUT_TIKTOK_ADAPTER_URL"]) });
  }
  if (missing.length) return Object.freeze({ status: "unconfigured" as const, missing: Object.freeze(missing) });
  return Object.freeze({
    status: "ready" as const,
    config: Object.freeze({
      adapterUrl: (adapterUrl ?? "").replace(/\/+$/, ""),
      transportKeyId: env.NEXCUT_TIKTOK_ADAPTER_TRANSPORT_KEY_ID as string,
      transportSecret: env.NEXCUT_TIKTOK_ADAPTER_TRANSPORT_SECRET as string,
      grantKeyId: env.NEXCUT_TIKTOK_GRANT_KEY_ID as string,
      grantSigningKey: env.NEXCUT_TIKTOK_GRANT_SIGNING_KEY as string,
      tenantId: env.NEXCUT_PUBLICATION_TENANT_ID?.trim() || "local-tenant",
    }),
  });
}

export async function dispatchTikTokPublication(
  ownerUid: string,
  idempotencyKey: string,
  command: TikTokPublicationCommand,
  config: TikTokPublicationRuntimeConfig,
): Promise<TikTokPublicationExecution> {
  return withProductionMediaRuntime(async ({ pool }) => executeTikTokPublication({
    client: pool,
    ownership: createDurableMediaOwnershipRepository(pool),
    rights: createRightsRegistry(pool),
    adapter: {
      endpoint: config.adapterUrl,
      transportKeyId: config.transportKeyId,
      transportSecret: config.transportSecret,
      grantKeyId: config.grantKeyId,
      grantSigningKey: config.grantSigningKey,
    },
    tenantId: config.tenantId,
  }, { ownerUid, idempotencyKey, command }));
}

export type TikTokPublicationRead = Readonly<{
  record: PublicationRecord;
  events: readonly PublicationEvent[];
}>;

/**
 * Core side of the Publication Observation contract. The adapter reports what it
 * observed over the signed observation leg; Core owns the transition.
 */
export async function recordTikTokAdapterObservation(
  report: AdapterObservationReport,
): Promise<AdapterObservationOutcome> {
  return withProductionMediaRuntime(async ({ pool }) => applyAdapterObservation(pool, report));
}

export async function readTikTokPublication(
  ownerUid: string,
  publicationId: string,
): Promise<TikTokPublicationRead | undefined> {
  return withProductionMediaRuntime(async ({ pool }) => {
    const repository = createPublicationRepository(pool);
    const record = await repository.get(ownerUid, publicationId);
    if (!record || record.platform !== "tiktok") return undefined;
    return Object.freeze({ record, events: await repository.events(ownerUid, publicationId) });
  });
}
