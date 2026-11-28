import "server-only";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { validateSameOriginMutation } from "@/lib/server/productionIdentity/sessionSecurity";
import { validateAssetImportCsrf } from "@/lib/server/assetImport/csrfGuard";
import { readTikTokPublicationRequest } from "@/lib/tiktokPublication/requestBoundary";
import {
  projectTikTokPublicationExecution,
  tiktokPublicationError,
  tiktokPublicationJson,
} from "@/lib/tiktokPublication/responseProjector";
import {
  dispatchTikTokPublication,
  resolveTikTokPublicationRuntimeConfig,
} from "@/lib/server/tiktokPublication/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:@-]{1,128}$/;

/**
 * POST /api/v1/publications/tiktok
 *
 * The Core-side entry point for publishing one asset to TikTok through the adapter.
 * It reuses the existing request protections in order: same-origin, authenticated
 * session, CSRF, idempotency key. No new authentication scheme is introduced.
 */
export async function POST(request: Request): Promise<Response> {
  if (!validateSameOriginMutation(request)) return tiktokPublicationError(403, "forbidden");
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!await validateAssetImportCsrf(request, authentication.context)) {
    return tiktokPublicationError(403, "csrf_invalid");
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return tiktokPublicationError(400, "idempotency_key_invalid");
  }
  const parsed = await readTikTokPublicationRequest(request, idempotencyKey);
  if (parsed.code === "REQUEST_REJECTED") return tiktokPublicationError(parsed.status, parsed.error);

  const configuration = resolveTikTokPublicationRuntimeConfig();
  if (configuration.status !== "ready") {
    // Fail closed and name the missing settings; never publish with a partial identity.
    return tiktokPublicationJson(503, Object.freeze({
      error: "tiktok_publication_not_configured",
      missing: configuration.missing,
    }));
  }

  try {
    const execution = await dispatchTikTokPublication(
      authentication.context.identity.userId,
      idempotencyKey,
      parsed.command,
      configuration.config,
    );
    const projected = projectTikTokPublicationExecution(execution);
    return tiktokPublicationJson(projected.status, projected.body, projected.headers);
  } catch {
    // A failure here may follow a dispatched request, so no retry is suggested.
    return tiktokPublicationError(500, "publication_execution_failed");
  }
}
