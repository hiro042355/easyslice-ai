import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("components/AuthenticatedAccountControl.tsx", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

test("workspace logout uses the canonical server contract before Firebase client sign-out", () => {
  assert.match(component, /fetch\("\/api\/auth\/session"/);
  assert.match(component, /method: "DELETE"/);
  assert.match(component, /credentials: "same-origin"/);
  assert.ok(component.indexOf("await fetch") < component.indexOf("await signOut"));
  assert.match(component, /window\.location\.assign\("\/auth"\)/);
  assert.doesNotMatch(component, /idToken|sessionCookie|refreshToken|user\.uid|user\.email/);
});

test("server logout revokes and clears the bounded host-only secure session cookie", () => {
  assert.match(sessionRoute, /verifySessionCookie\([^,]+, true\)/);
  assert.match(sessionRoute, /revokeRefreshTokens\(decoded\.uid\)/);
  assert.match(sessionRoute, /SESSION_COOKIE_NAME, "", \{ httpOnly: true, secure: true, sameSite: "lax", path: "\/", maxAge: 0 \}/);
  assert.doesNotMatch(sessionRoute, /domain:/i);
});
