const HEADERS = Object.freeze({ "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" });

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ status: "retired", code: "internal-acquisition-route-retired" }),
    { status: 410, headers: HEADERS });
}
