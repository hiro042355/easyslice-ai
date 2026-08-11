import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { projectVerifiedIdentity, type FirebaseCredentialVerifier } from "./firebaseIdentityAdapter";
import type { AuthenticatedContext } from "./types";

export const SESSION_COOKIE_NAME = "__Host-nexcut_session";

export type RouteAuthenticationResult =
  | Readonly<{ ok: true; context: AuthenticatedContext }>
  | Readonly<{ ok: false; response: NextResponse }>;

const bearer = (request: Request): string | undefined => {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
};

const cookie = (request: Request): string | undefined => {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
};

export const createAuthenticatedRouteGuard = (verifier: FirebaseCredentialVerifier) => async (
  request: Request,
): Promise<RouteAuthenticationResult> => {
  const sessionCookie = cookie(request);
  const idToken = sessionCookie ? undefined : bearer(request);
  const credential = sessionCookie ?? idToken;
  if (!credential) return Object.freeze({
    ok: false,
    response: NextResponse.json({ success: false, error: "authentication-required" }, { status: 401 }),
  });
  try {
    const decoded = sessionCookie
      ? await verifier.verifySessionCookie(sessionCookie, true)
      : await verifier.verifyIdToken(idToken!, true);
    return Object.freeze({
      ok: true,
      context: Object.freeze({ contextVersion: "1.0", requestId: randomUUID(), identity: projectVerifiedIdentity(decoded, credential) }),
    });
  } catch {
    return Object.freeze({
      ok: false,
      response: NextResponse.json({ success: false, error: "authentication-rejected" }, { status: 401 }),
    });
  }
};
