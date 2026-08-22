import { NextResponse } from "next/server";
import { verifyProductionEnvironmentBProof } from "@/lib/server/acquisitionWorkerTrust/environmentBProof";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const sameOrigin = (request: Request): boolean => request.headers.get("origin") === new URL(request.url).origin;

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "invalid-origin" }, { status: 403 });
  try {
    const proof = await verifyProductionEnvironmentBProof();
    return NextResponse.json(proof, { status: proof.success ? 200 : 503 });
  } catch {
    return NextResponse.json({ success: false, error: "environment-b-proof-failed" }, { status: 502 });
  }
}
