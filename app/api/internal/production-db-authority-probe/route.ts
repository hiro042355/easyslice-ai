import { createProbeRoute } from "@/lib/server/productionDatabaseProbe/probeCore";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createProbeRoute({
  environment: process.env,
  async authenticate(request) {
    const { requireAuthenticatedRequest } = await import("@/lib/server/productionIdentity/routeGuard");
    return requireAuthenticatedRequest(request);
  },
  async probe() {
    const { executeProductionDatabaseProbe } = await import("@/lib/server/productionDatabaseProbe/probe");
    return executeProductionDatabaseProbe();
  },
});
