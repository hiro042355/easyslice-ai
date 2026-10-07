import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const component = readFileSync("components/AuthenticatedAccountControl.tsx", "utf8");
const route = readFileSync("app/api/auth/session/route.ts", "utf8");
const core = readFileSync("lib/server/productionIdentity/sessionRouteCore.ts", "utf8");

test("production route wires the executable session core to canonical Admin and beta guard", () => {
  assert.match(route, /authenticate: requireAuthenticatedRequest, withAuth: withFirebaseAdminAuth/);
  for (const method of ["GET", "POST", "DELETE"]) assert.ok(route.includes(`export const ${method} = handlers.${method}`));
  assert.match(core, /dependencies.authenticate\(request\)/);
});
test("workspace waits for Firebase restoration only through bounded server session recovery", () => {
  assert.match(component, /restoreServerSession/);
  assert.match(component, /await auth.authStateReady\(\)/);
  assert.match(component, /cache: "no-store"/);
  assert.match(component, /result === "authenticated"/);
  assert.match(component, /status === "idle" \? "Signed in"/);
  assert.match(component, /addEventListener\("focus", check\)/);
  assert.match(component, /clearInterval\(timer\)/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|console\./);
});
test("logout drains session recovery before DELETE then client signout", () => {
  assert.match(component, /loggingOut.current = true[\s\S]*await pending.current[\s\S]*method: "DELETE"[\s\S]*await signOut/);
  assert.match(component, /window.location.assign\("\/auth"\)/);
});
