import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
} from "@/lib/server/acquisitionWorker/types";
import { AcquisitionWorkerTrustFailure } from "@/lib/server/acquisitionWorkerTrust/client";
import { invokeProductionAcquisitionWorkerAt } from "@/lib/server/acquisitionWorkerTrust/composition";
import { ENVIRONMENT_B_PROOF_DESTINATIONS } from "@/lib/server/acquisitionWorkerTrust/environmentBProof";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { validateYouTubeVideoUrl } from "@/lib/server/youtubeIngestion";

export const runtime = "nodejs";
export const maxDuration = 300;

const OWNER_CONTROLLED_URL = validateYouTubeVideoUrl("https://youtu.be/DaxWpqigjrs").canonicalUrl;
const isSameOrigin = (request: Request): boolean => request.headers.get("origin") === new URL(request.url).origin;

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });
  try {
    const invocation = await invokeProductionAcquisitionWorkerAt(ENVIRONMENT_B_PROOF_DESTINATIONS.worker, {
      requestVersion: ACQUISITION_REQUEST_VERSION,
      acquisitionId: randomUUID(),
      source: "youtube",
      sourceUrl: OWNER_CONTROLLED_URL,
      requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
      maxBytes: ACQUISITION_MAX_BYTES,
      timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
    }, request.signal);
    const result = invocation.result;
    const httpStatus = result.status === "succeeded" ? 200 : 422;
    return NextResponse.json({
      httpStatus,
      status: result.status,
      ...(result.status === "failed"
        ? { errorCode: result.errorCode, retryable: result.retryable }
        : { media: result.media }),
      ...(invocation.diagnostic ? { diagnostic: invocation.diagnostic } : {}),
    }, { status: httpStatus });
  } catch (error) {
    const errorCode = error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable";
    const httpStatus = errorCode === "worker-timeout" ? 504 : errorCode === "worker-auth-rejected" ? 403 : 502;
    return NextResponse.json({ httpStatus, status: "failed", errorCode, retryable: false }, { status: httpStatus });
  }
}
