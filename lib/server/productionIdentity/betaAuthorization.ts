import { NextResponse } from "next/server";
import type { RouteAuthenticationResult } from "./routeGuardCore";
import type { UserId } from "./types";

export type BetaAuthorizationDecision = "allowed" | "denied";

export const parseBetaAllowedUids = (value: string | undefined): ReadonlySet<string> => {
  if (value === undefined) return new Set<string>();
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry.length === 0)) return new Set<string>();
  return new Set(entries);
};

export const authorizeBetaUid = (
  userId: UserId,
  configuredAllowedUids: string | undefined,
): BetaAuthorizationDecision =>
  parseBetaAllowedUids(configuredAllowedUids).has(userId) ? "allowed" : "denied";

export const requireBetaAuthorization = (
  authentication: RouteAuthenticationResult,
  configuredAllowedUids: string | undefined,
): RouteAuthenticationResult => {
  if (!authentication.ok) return authentication;
  if (authorizeBetaUid(authentication.context.identity.userId, configuredAllowedUids) === "allowed") {
    return authentication;
  }
  return Object.freeze({
    ok: false,
    response: NextResponse.json({ success: false, error: "beta-authorization-required" }, { status: 403 }),
  });
};
