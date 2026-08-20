import { NextResponse } from "next/server";
import { AcquisitionWorkerTrustFailure } from "../../../../lib/server/acquisitionWorkerTrust/client";
import { runProductionAcquisitionControlStoreProof } from "../../../../lib/server/acquisitionWorkerTrust/composition";
import { requireAuthenticatedRequest } from "../../../../lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ success: false, error: "invalid-acquisition-request" }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, evidence: await runProductionAcquisitionControlStoreProof() });
  } catch (error) {
    const code = error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable";
    return NextResponse.json({ success: false, error: code }, { status: 502 });
  }
}
