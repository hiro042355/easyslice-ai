import type { AuthenticatedContext } from "../productionIdentity/types";
import { getProductionWorkflowApiCsrfRuntime } from "../workflowApi/productionWorkflowApiCsrfRuntime";
import { digestParsedProductionWorkflowApiCsrfToken, parseProductionWorkflowApiCsrfToken } from "../workflowApi/productionWorkflowApiCsrfToken";

export async function validateAssetImportCsrf(request: Request, context: AuthenticatedContext): Promise<boolean> {
  const raw = request.headers.get("x-csrf-token");
  if (!raw || raw !== raw.trim() || raw.includes(",")) return false;
  const parsed = parseProductionWorkflowApiCsrfToken(raw);
  if (parsed.status !== "parsed") return false;
  const runtime = await getProductionWorkflowApiCsrfRuntime();
  if (runtime.status !== "ready") return false;
  const result = await runtime.runtime.authority.validate({ sessionId: context.identity.sessionId,
    tokenId: parsed.value.tokenId, digest: digestParsedProductionWorkflowApiCsrfToken(parsed.value), now: Date.now() });
  return result.status === "valid";
}
