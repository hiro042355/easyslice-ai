import type { PublicationRightsSnapshot, RightsValidation } from "./contracts";

export type RightsRegistry = Readonly<{
  requireActive(
    ownerUid: string,
    rightsKey: string,
    platform: "youtube" | "tiktok" | "bilibili",
    nowMs?: number,
  ): Promise<RightsValidation>;
}>;

export type RightsGateResult =
  | Readonly<{ ok: true; snapshot: PublicationRightsSnapshot }>
  | Readonly<{ ok: false; code: string }>;

/**
 * Application boundary for every transition that grants publication authority.
 * The legacy reference alone is not proof; the durable revision must be ACTIVE,
 * unexpired, platform-permitted and PUBLICATION-permitted.
 */
export async function validatePublicationRights(
  registry: RightsRegistry | undefined,
  ownerUid: string,
  rightsKey: string,
  nowMs = Date.now(),
  /** Destination the caller is about to publish to. Defaults to the YouTube path. */
  platform: "youtube" | "tiktok" | "bilibili" = "youtube",
): Promise<RightsGateResult> {
  if (!registry) return Object.freeze({ ok: false, code: "RIGHTS_REGISTRY_UNAVAILABLE" });
  const result = await registry.requireActive(ownerUid, rightsKey, platform, nowMs);
  return result.allowed
    ? Object.freeze({ ok: true, snapshot: result.snapshot })
    : Object.freeze({ ok: false, code: result.code });
}
