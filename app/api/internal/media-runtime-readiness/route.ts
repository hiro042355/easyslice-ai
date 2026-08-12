import { authorizeProductionMediaProbe, runProductionMediaRuntimeProbe } from "../../../../lib/server/productionMediaRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unavailable = (): Response => Response.json({ status: "not-found" }, { status: 404 });

export async function POST(request: Request): Promise<Response> {
  if (!authorizeProductionMediaProbe(request.headers.get("x-nexcut-probe-secret"), process.env.MEDIA_RUNTIME_PROBE_SECRET)) return unavailable();
  try {
    return Response.json(await runProductionMediaRuntimeProbe(), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
