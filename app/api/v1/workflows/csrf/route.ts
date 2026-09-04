import "server-only";

import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { createProductionWorkflowApiCsrfBootstrapHandler } from "@/lib/server/workflowApi/productionWorkflowApiCsrfBootstrap";
import { getProductionWorkflowApiCsrfRuntime } from "@/lib/server/workflowApi/productionWorkflowApiCsrfRuntime";

export const runtime = "nodejs";

const handler = createProductionWorkflowApiCsrfBootstrapHandler({
  authenticate: requireAuthenticatedRequest,
  authority: async () => {
    const result = await getProductionWorkflowApiCsrfRuntime();
    return result.status === "ready" ? result.runtime.authority : undefined;
  },
  now: Date.now,
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
