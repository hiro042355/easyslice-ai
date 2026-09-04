const HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({
    responseVersion: "1.0",
    status: "retired",
    code: "legacy-youtube-route-retired",
  }), { status: 410, headers: HEADERS });
}
