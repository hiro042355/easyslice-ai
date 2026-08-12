import { NextResponse } from "next/server";
import { withFirebaseAdminAuth } from "@/lib/server/productionIdentity/firebaseAdmin";
import { SESSION_COOKIE_NAME } from "@/lib/server/productionIdentity/routeGuard";
import { SESSION_MAX_AGE_SECONDS, validateSameOriginMutation } from "@/lib/server/productionIdentity/sessionSecurity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validateSameOriginMutation(request)) return NextResponse.json({ success: false, error: "origin-rejected" }, { status: 403 });
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
  if (!idToken) return NextResponse.json({ success: false, error: "authentication-required" }, { status: 401 });
  try {
    const sessionCookie = await withFirebaseAdminAuth(async (auth) => {
      await auth.verifyIdToken(idToken, true);
      return auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
    });
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ success: false, error: "authentication-rejected" }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  if (!validateSameOriginMutation(request)) return NextResponse.json({ success: false, error: "origin-rejected" }, { status: 403 });
  const rawCookie = request.headers.get("cookie") ?? "";
  const sessionCookie = rawCookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
  if (sessionCookie) {
    try {
      await withFirebaseAdminAuth(async (auth) => {
        const decoded = await auth.verifySessionCookie(decodeURIComponent(sessionCookie), true);
        await auth.revokeRefreshTokens(decoded.uid);
      });
    } catch {
      // Clearing an expired or already-revoked cookie remains idempotent.
    }
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
