import { isOwnershipRuntimeProbeAuthorized } from "@/lib/server/productionMediaRuntime/ownershipRuntimeProbeAccess";
import { runProductionOwnershipRuntimeReadiness } from "@/lib/server/productionMediaRuntime/ownershipRuntimeReadiness";

export const runtime = "nodejs";

const notFound = (): Response => new Response(null, { status: 404 });

export async function POST(request: Request): Promise<Response> {
  if (!isOwnershipRuntimeProbeAuthorized(request.headers.get("x-nexcut-probe-secret"))) return notFound();
  try {
    await runProductionOwnershipRuntimeReadiness();
    return Response.json({ status: "ready", job: "pass", media: "pass", export: "pass", ownership: "pass" });
  } catch {
    return notFound();
  }
}
