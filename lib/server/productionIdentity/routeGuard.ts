import "server-only";

import { withFirebaseAdminAuth } from "./firebaseAdmin";
import { createAuthenticatedRouteGuard } from "./routeGuardCore";

export { SESSION_COOKIE_NAME } from "./routeGuardCore";

export const requireAuthenticatedRequest = async (request: Request) => {
  try {
    return await withFirebaseAdminAuth((auth) => createAuthenticatedRouteGuard(auth)(request));
  } catch {
    return createAuthenticatedRouteGuard({
      async verifyIdToken() { throw new Error("authentication-unavailable"); },
      async verifySessionCookie() { throw new Error("authentication-unavailable"); },
    })(request);
  }
};
