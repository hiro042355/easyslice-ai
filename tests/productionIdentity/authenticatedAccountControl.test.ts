import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("components/AuthenticatedAccountControl.tsx", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

test("workspace logout uses the canonical server contract before Firebase client sign-out", () => {
  assert.match(component, /fetch\("\/api\/auth\/session"/);
  assert.match(component, /method: "DELETE"/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(component, /const logout = async \(\) => \{[\s\S]*await fetch[\s\S]*await signOut/);
  assert.match(component, /window\.location\.assign\("\/auth"\)/);
  assert.doesNotMatch(component, /idToken|sessionCookie|refreshToken|user\.uid|user\.email/);
});

test("workspace signed-in state is gated by the canonical server session", () => {
  assert.match(component, /fetch\("\/api\/auth\/session", \{ credentials: "same-origin" \}\)/);
  assert.match(component, /if \(response\.ok\) \{\s*setStatus\("idle"\)/);
  assert.match(component, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(component, /window\.location\.replace\("\/auth"\)/);
  assert.match(component, /status === "idle" \|\| status === "working" \? "Signed in" : "Checking session…"/);
  assert.doesNotMatch(component, /useAuthState|currentUser\?\.uid|localStorage|sessionStorage/);
});

test("session status endpoint delegates to the canonical protected guard without exposing identity", () => {
  const getHandler = sessionRoute.slice(sessionRoute.indexOf("export async function GET"), sessionRoute.indexOf("export async function POST"));
  assert.match(getHandler, /export async function GET\(request: Request\)/);
  assert.match(getHandler, /requireAuthenticatedRequest\(request\)/);
  assert.match(getHandler, /if \(!authentication\.ok\) return authentication\.response/);
  assert.match(getHandler, /NextResponse\.json\(\{ success: true \}\)/);
  assert.doesNotMatch(getHandler, /decoded\.uid|userId|email/);
});

test("server logout revokes and clears the bounded host-only secure session cookie", () => {
  assert.match(sessionRoute, /verifySessionCookie\([^,]+, true\)/);
  assert.match(sessionRoute, /revokeRefreshTokens\(decoded\.uid\)/);
  assert.match(sessionRoute, /SESSION_COOKIE_NAME, "", \{ httpOnly: true, secure: true, sameSite: "lax", path: "\/", maxAge: 0 \}/);
  assert.doesNotMatch(sessionRoute, /domain:/i);
});
