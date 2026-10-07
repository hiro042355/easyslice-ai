// LOGIN-1 routing foundation only. Ignores all input, performs no OAuth effects.
export const runtime = "nodejs";
export function GET() {
  return Response.json({ success: false, error: "tiktok-oauth-not-implemented" }, {
    status: 501,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
