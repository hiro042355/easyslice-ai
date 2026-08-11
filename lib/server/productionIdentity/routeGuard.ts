import "server-only";

import { firebaseAdminAuth } from "./firebaseAdmin";
import { createAuthenticatedRouteGuard } from "./routeGuardCore";

export { SESSION_COOKIE_NAME } from "./routeGuardCore";

export const requireAuthenticatedRequest = createAuthenticatedRouteGuard(firebaseAdminAuth);
