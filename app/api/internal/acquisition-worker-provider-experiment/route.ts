import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { invokeProductionAcquisitionWorkerAt } from "@/lib/server/acquisitionWorkerTrust/composition";
import { createProviderExperimentBoundary } from "@/lib/server/acquisitionWorkerTrust/providerExperimentBoundary";

export const runtime = "nodejs";
export const maxDuration = 300;

const handler = createProviderExperimentBoundary({
  environment: process.env,
  async authenticate(request) {
    const result = await requireAuthenticatedRequest(request);
    return result.ok ? { ok: true, userId: result.context.identity.userId } : result;
  },
  invokeAt: invokeProductionAcquisitionWorkerAt,
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
