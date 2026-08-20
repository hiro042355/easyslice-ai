import { NextResponse } from "next/server";
import { AcquisitionWorkerTrustFailure } from "../../../../lib/server/acquisitionWorkerTrust/client";
import { verifyProductionAcquisitionWorkerTrust } from "../../../../lib/server/acquisitionWorkerTrust/composition";
import { requireAuthenticatedRequest } from "../../../../lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  try {
    return NextResponse.json({ success: true, evidence: await verifyProductionAcquisitionWorkerTrust() });
  } catch (error) {
    const code = error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable";
    return NextResponse.json({ success: false, error: code }, { status: 502 });
  }
}
