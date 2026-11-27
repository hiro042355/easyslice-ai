import type { PublicationRecord } from "../publicationRecords/repository";

/**
 * Principal Bridge (CORE_R11 PROPOSED item 1, implementation form).
 *
 * Identity can only come from the authenticated server session. Request data may
 * *name* an owner but can never select one: a mismatching client-supplied owner is a
 * rejection, not a hint. This module returns identity data only; it does not read
 * sessions, issue tokens or prove that a session was verified by the transport.
 */
export const PUBLICATION_PRINCIPAL_BRIDGE_VERSION = "publication-principal-bridge-v1" as const;

const identifier = /^[A-Za-z0-9_.:@-]{1,256}$/;
const allowedKeys = new Set(["ownerUid", "tenantId", "channelId", "requestedOwnerUid"]);

export type PublicationPrincipal = Readonly<{
  bridgeVersion: typeof PUBLICATION_PRINCIPAL_BRIDGE_VERSION;
  ownerUid: string;
  tenantId: string;
  channelId?: string;
  source: "server-session";
}>;

export type PrincipalResolution =
  | Readonly<{ code: "PRINCIPAL_BOUND"; principal: PublicationPrincipal }>
  | Readonly<{ code: "PRINCIPAL_INVALID" }>
  | Readonly<{ code: "PRINCIPAL_MISMATCH" }>;

const invalid = Object.freeze({ code: "PRINCIPAL_INVALID" } as const);

/**
 * @param value.ownerUid canonical owner UID obtained from the verified session.
 * @param value.requestedOwnerUid optional owner named by the request; it may only
 * repeat the session owner.
 */
export function resolvePublicationPrincipal(value: unknown): PrincipalResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.some(key => !allowedKeys.has(key))) return invalid;
  const record = value as Record<string, unknown>;
  const ownerUid = record.ownerUid;
  const tenantId = record.tenantId;
  const channelId = record.channelId;
  const requestedOwnerUid = record.requestedOwnerUid;
  if (typeof ownerUid !== "string" || !identifier.test(ownerUid)) return invalid;
  if (typeof tenantId !== "string" || !identifier.test(tenantId)) return invalid;
  if (channelId !== undefined && (typeof channelId !== "string" || !identifier.test(channelId))) {
    return invalid;
  }
  if (requestedOwnerUid !== undefined && requestedOwnerUid !== null && requestedOwnerUid !== ownerUid) {
    return Object.freeze({ code: "PRINCIPAL_MISMATCH" } as const);
  }
  return Object.freeze({
    code: "PRINCIPAL_BOUND" as const,
    principal: Object.freeze({
      bridgeVersion: PUBLICATION_PRINCIPAL_BRIDGE_VERSION,
      ownerUid,
      tenantId,
      ...(typeof channelId === "string" ? { channelId } : {}),
      source: "server-session" as const,
    }),
  });
}

/**
 * Owner and tenant scoping for a stored intent. A record identifier obtained from a
 * client is never sufficient authority on its own.
 */
export const principalOwnsPublication = (
  principal: PublicationPrincipal,
  ownerUid: string | null | undefined,
  record: Pick<PublicationRecord, "tenantId">,
): boolean => ownerUid === principal.ownerUid && record.tenantId === principal.tenantId;
