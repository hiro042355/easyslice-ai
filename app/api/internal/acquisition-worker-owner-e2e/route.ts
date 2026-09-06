import { lookupProductionAcquisitionWorker, invokeProductionAcquisitionWorker } from "@/lib/server/acquisitionWorkerTrust/composition";
import { createProductionValidationBoundary } from "@/lib/server/acquisitionWorkerTrust/productionValidationBoundary";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";
export const maxDuration = 300;

const handler = createProductionValidationBoundary({
  environment: process.env,
  async authenticate(request) {
    const result = await requireAuthenticatedRequest(request);
    return result.ok ? { ok: true, userId: result.context.identity.userId } : result;
  },
  invoke: invokeProductionAcquisitionWorker,
  lookup: lookupProductionAcquisitionWorker,
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
