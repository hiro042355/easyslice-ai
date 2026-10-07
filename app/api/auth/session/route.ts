import { withFirebaseAdminAuth } from "@/lib/server/productionIdentity/firebaseAdmin";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { createSessionHandlers } from "@/lib/server/productionIdentity/sessionRouteCore";

export const runtime = "nodejs";
const handlers = createSessionHandlers({ authenticate: requireAuthenticatedRequest, withAuth: withFirebaseAdminAuth });
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
