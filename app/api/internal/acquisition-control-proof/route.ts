import { NextResponse } from "next/server";
import { runProductionAcquisitionControlStoreProof } from "@/lib/server/acquisitionWorkerTrust/composition";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";
export const maxDuration = 150;

const sameOrigin = (request: Request): boolean => request.headers.get("origin") === new URL(request.url).origin;

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "invalid-origin" }, { status: 403 });
  if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
    return NextResponse.json({ success: false, error: "invalid-acquisition-request" }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, evidence: await runProductionAcquisitionControlStoreProof() });
  } catch {
    return NextResponse.json({ success: false, error: "control-store-proof-failed" }, { status: 502 });
  }
}
