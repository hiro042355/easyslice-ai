import "server-only";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import {
  projectTikTokPublicationRead,
  tiktokPublicationError,
} from "@/lib/tiktokPublication/responseProjector";
import { readTikTokPublication } from "@/lib/server/tiktokPublication/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/publications/[publicationId] - the caller's own TikTok publication. */
export async function GET(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
): Promise<Response> {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const { publicationId } = await context.params;
  try {
    const read = await readTikTokPublication(authentication.context.identity.userId, publicationId);
    if (!read) return tiktokPublicationError(404, "publication_not_found");
    return projectTikTokPublicationRead(read);
  } catch {
    return tiktokPublicationError(500, "publication_read_failed");
  }
}
