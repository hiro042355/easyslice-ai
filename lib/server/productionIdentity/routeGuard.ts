import "server-only";

import { withFirebaseAdminAuth } from "./firebaseAdmin";
import { requireBetaAuthorization } from "./betaAuthorization";
import { createAuthenticatedRouteGuard } from "./routeGuardCore";

export { SESSION_COOKIE_NAME } from "./routeGuardCore";

export const requireAuthenticatedRequest = async (request: Request) => {
  try {
    const authentication = await withFirebaseAdminAuth((auth) => createAuthenticatedRouteGuard(auth)(request));
    return requireBetaAuthorization(authentication, process.env.NEXCUT_BETA_ALLOWED_UIDS);
  } catch {
    return createAuthenticatedRouteGuard({
      async verifyIdToken() { throw new Error("authentication-unavailable"); },
      async verifySessionCookie() { throw new Error("authentication-unavailable"); },
    })(request);
  }
};
