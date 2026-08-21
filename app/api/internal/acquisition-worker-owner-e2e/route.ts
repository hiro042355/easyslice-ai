import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
} from "@/lib/server/acquisitionWorker/types";
import { AcquisitionWorkerTrustFailure } from "@/lib/server/acquisitionWorkerTrust/client";
import { invokeProductionAcquisitionWorker } from "@/lib/server/acquisitionWorkerTrust/composition";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { validateYouTubeVideoUrl } from "@/lib/server/youtubeIngestion";

export const runtime = "nodejs";
export const maxDuration = 300;

const isSameOrigin = (request: Request): boolean => request.headers.get("origin") === new URL(request.url).origin;

const readUrl = async (request: Request): Promise<unknown> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 1 || !("url" in value)) return undefined;
  return value.url;
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });
  let sourceUrl: string;
  try {
    sourceUrl = validateYouTubeVideoUrl(await readUrl(request)).canonicalUrl;
  } catch {
    return NextResponse.json({ error: "invalid-youtube-url" }, { status: 400 });
  }
  try {
    const invocation = await invokeProductionAcquisitionWorker({
      requestVersion: ACQUISITION_REQUEST_VERSION,
      acquisitionId: randomUUID(),
      source: "youtube",
      sourceUrl,
      requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
      maxBytes: ACQUISITION_MAX_BYTES,
      timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
    }, request.signal);
    const result = invocation.result;
    return NextResponse.json({
      status: result.status,
      ...(result.status === "failed"
        ? { errorCode: result.errorCode, retryable: result.retryable }
        : { media: result.media }),
      ...(invocation.diagnostic ? { diagnostic: invocation.diagnostic } : {}),
    }, { status: result.status === "succeeded" ? 200 : 422 });
  } catch (error) {
    const code = error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable";
    const status = code === "worker-timeout" ? 504 : code === "worker-auth-rejected" ? 403 : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
