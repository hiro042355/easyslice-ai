import "server-only";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { validateSameOriginMutation } from "@/lib/server/productionIdentity/sessionSecurity";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import { validateAssetImportCsrf } from "@/lib/server/assetImport/csrfGuard";
import { readAssetImportRequest } from "@/lib/server/assetImport/requestBoundary";
import { executeAssetImport } from "@/lib/server/assetImport/service";
import { assetImportError, assetImportJson } from "@/lib/server/assetImport/responseProjector";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!validateSameOriginMutation(request)) return assetImportError(403, "forbidden");
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!await validateAssetImportCsrf(request, authentication.context)) return assetImportError(403, "csrf_invalid");
  const parsed = await readAssetImportRequest(request);
  if (parsed.status === "rejected") return assetImportError(parsed.statusCode, parsed.code);
  try {
    const result = await withProductionMediaRuntime(({ pool, bucket }) => executeAssetImport({ ownerUid: authentication.context.identity.userId,
      idempotencyKey: parsed.idempotencyKey, source: parsed.source, pool, bucket, signal: request.signal }));
    return assetImportJson(result.statusCode, result.body);
  } catch { return assetImportError(500, "internal_failure"); }
}
