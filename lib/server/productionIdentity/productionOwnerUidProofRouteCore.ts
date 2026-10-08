import { isProductionOwner } from "./productionOwnerAuthority";
import type { AuthenticatedContext } from "./types";

const HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});

const json = (status: number, body: Readonly<Record<string, unknown>>, extraHeaders?: Readonly<Record<string, string>>) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extraHeaders } });

const unavailable = (status: number, extraHeaders?: Readonly<Record<string, string>>) =>
  json(status, { status: "rejected", errorCode: "owner-proof-unavailable" }, extraHeaders);

const emptyBody = async (request: Request): Promise<boolean> => {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && !/^0+$/.test(declaredLength.trim())) return false;
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    for (let reads = 0; reads < 16; reads += 1) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      if (chunk.value.byteLength > 0) return false;
    }
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

export type ProductionOwnerUidProofDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  authenticate(request: Request): Promise<
    | Readonly<{ ok: true; context: AuthenticatedContext }>
    | Readonly<{ ok: false; response: Response }>
  >;
}>;

export const createProductionOwnerUidProofRoute = (dependencies: ProductionOwnerUidProofDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return unavailable(405, { Allow: "POST" });
    if (!(await emptyBody(request))) return unavailable(400);
    if (request.headers.get("origin") !== new URL(request.url).origin) return unavailable(403);
    if (dependencies.environment.VERCEL_ENV !== "production") return unavailable(404);

    const authentication = await dependencies.authenticate(request);
    if (!authentication.ok) {
      return authentication.response.status === 401
        ? json(401, { status: "rejected", errorCode: "authentication-required" })
        : unavailable(404);
    }
    const userId = authentication.context.identity.userId;
    if (!isProductionOwner(userId, dependencies.environment.NEXCUT_PRODUCTION_OWNER_UID)) return unavailable(404);
    return json(200, { proofVersion: "1.0", status: "verified", uid: userId });
  };
