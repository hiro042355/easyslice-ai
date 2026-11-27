import "server-only";
import { verifyAdapterObservationSignature } from "@/lib/publicationIntegration/adapterTransport";
import { readTikTokObservationReport, TIKTOK_OBSERVATION_MAX_BODY_BYTES } from "@/lib/tiktokPublication/observationBoundary";
import {
  recordTikTokAdapterObservation,
  resolveTikTokPublicationRuntimeConfig,
} from "@/lib/server/tiktokPublication/runtime";

export const runtime = "nodejs";
export const maxDuration = 30;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: Object.freeze({ "content-type": "application/json", "cache-control": "no-store" }),
  });

const headerRecord = (headers: Headers): Record<string, string | undefined> => {
  const record: Record<string, string | undefined> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
};

/**
 * POST /api/v1/publications/tiktok/observations
 *
 * The adapter -> Core observation leg. This is a server-to-server endpoint, so the
 * caller is authenticated by the shared transport HMAC (the same rule the adapter
 * applies to Core) rather than by a user session, and no CSRF or same-origin check
 * applies. A user browser cannot sign a request, and the body can only ask Core to
 * apply an observation to a publication the stored row already owns.
 */
export async function POST(request: Request): Promise<Response> {
  const configuration = resolveTikTokPublicationRuntimeConfig();
  if (configuration.status !== "ready") {
    return json(503, { error: "tiktok_publication_not_configured", missing: configuration.missing });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { error: "observation_body_unreadable" });
  }
  if (raw.length > TIKTOK_OBSERVATION_MAX_BODY_BYTES) return json(413, { error: "observation_body_too_large" });

  const verdict = verifyAdapterObservationSignature({
    body: raw,
    headers: headerRecord(request.headers),
    secrets: Object.freeze({ [configuration.config.transportKeyId]: configuration.config.transportSecret }),
  });
  if (verdict === "UNAUTHENTICATED") return json(401, { error: "adapter_signature_invalid" });
  if (verdict === "STALE") return json(401, { error: "adapter_request_stale" });

  const parsed = await readTikTokObservationReport({
    headers: request.headers,
    text: async () => raw,
  });
  if (parsed.code === "REPORT_REJECTED") return json(parsed.status, { error: parsed.error });

  try {
    const outcome = await recordTikTokAdapterObservation(parsed.report);
    // `Readonly<>` defeats control-flow narrowing on a union, so the guard is written
    // as an exhaustive check on the one rejecting variant.
    if (outcome.code !== "REJECTED") {
      return json(200, {
        code: outcome.code,
        publicationId: outcome.record.id,
        state: outcome.record.state,
        revision: outcome.record.revision,
      });
    }
    return json(outcome.status, { code: "REJECTED", error: outcome.error });
  } catch {
    return json(500, { code: "REJECTED", error: "observation_apply_failed" });
  }
}
