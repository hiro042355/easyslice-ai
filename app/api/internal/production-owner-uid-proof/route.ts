import { createProductionOwnerUidProofRoute } from "./core";

export const runtime = "nodejs";

const handler = createProductionOwnerUidProofRoute({
  environment: process.env,
  async authenticate(request) {
    const { requireAuthenticatedRequest } = await import("@/lib/server/productionIdentity/routeGuard");
    return requireAuthenticatedRequest(request);
  },
});

export const POST = handler;
export const GET = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
