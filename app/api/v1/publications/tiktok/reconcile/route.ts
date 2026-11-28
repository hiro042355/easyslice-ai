import "server-only";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { validateSameOriginMutation } from "@/lib/server/productionIdentity/sessionSecurity";
import { validateAssetImportCsrf } from "@/lib/server/assetImport/csrfGuard";
import { readTikTokReconciliationRequest } from "@/lib/tiktokPublication/requestBoundary";
import {
  projectTikTokReconciliation,
  tiktokPublicationError,
  tiktokPublicationJson,
} from "@/lib/tiktokPublication/responseProjector";
import {
  reconcileTikTokPublicationRecord,
  resolveTikTokPublicationRuntimeConfig,
} from "@/lib/server/tiktokPublication/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/publications/tiktok/reconcile
 *
 * Asks the adapter what it recorded for a publication Core lost track of. It reuses
 * the same guards as the publication route (same-origin, session, CSRF) and is safe
 * to call repeatedly: the adapter read is idempotent and Core applies the answer with
 * deterministic observation ids. It never dispatches a new TikTok post.
 */
export async function POST(request: Request): Promise<Response> {
  if (!validateSameOriginMutation(request)) return tiktokPublicationError(403, "forbidden");
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!await validateAssetImportCsrf(request, authentication.context)) {
    return tiktokPublicationError(403, "csrf_invalid");
  }
  const parsed = await readTikTokReconciliationRequest(request);
  if (parsed.code === "REQUEST_REJECTED") return tiktokPublicationError(parsed.status, parsed.error);

  const configuration = resolveTikTokPublicationRuntimeConfig();
  if (configuration.status !== "ready") {
    return tiktokPublicationJson(503, Object.freeze({
      error: "tiktok_publication_not_configured",
      missing: configuration.missing,
    }));
  }

  try {
    const result = await reconcileTikTokPublicationRecord(
      authentication.context.identity.userId,
      parsed.publicationId,
      configuration.config,
    );
    const projected = projectTikTokReconciliation(result);
    return tiktokPublicationJson(projected.status, projected.body, projected.headers);
  } catch {
    // Reconciliation can be retried by the operator; it never resends the publication.
    return tiktokPublicationError(500, "publication_reconciliation_failed");
  }
}
