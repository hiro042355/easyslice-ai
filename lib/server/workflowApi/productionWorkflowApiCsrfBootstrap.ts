import type { AuthenticatedContext } from "../productionIdentity/types";
import { validateSameOriginMutation } from "../productionIdentity/sessionSecurity";
import {
  createProductionWorkflowApiCsrfMaterial,
  nodeProductionWorkflowApiCsrfRandomAuthority,
} from "./productionWorkflowApiCsrfToken";
import type { ProductionWorkflowApiCsrfAuthority } from "./productionWorkflowApiCsrfTypes";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

type AuthenticationResult =
  | Readonly<{ ok: true; context: AuthenticatedContext }>
  | Readonly<{ ok: false; response: Response }>;

export type ProductionWorkflowApiCsrfBootstrapDependencies = Readonly<{
  authenticate(request: Request): Promise<AuthenticationResult>;
  authority(): Promise<ProductionWorkflowApiCsrfAuthority | undefined>;
  now(): number;
}>;

const json = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });

const error = (status: 400 | 403 | 503, code: "request-invalid" | "unauthorized" | "temporarily-unavailable") =>
  json(status, {
    errorVersion: "1.0",
    code,
    message: code === "request-invalid"
      ? "The request could not be processed."
      : code === "unauthorized"
        ? "The operation is not permitted."
        : "The workflow service is temporarily unavailable.",
    retryable: code === "temporarily-unavailable",
  });

async function emptyBody(request: Request): Promise<boolean> {
  const declared = request.headers.get("content-length");
  if (declared !== null && declared !== "0") return false;
  if (!request.body) return true;
  if (request.body.locked || request.bodyUsed) return false;
  const reader = request.body.getReader();
  try {
    // Only EOF proves emptiness. Even an empty first chunk is inconclusive:
    // fail closed instead of consuming an attacker-controlled number of chunks.
    return (await reader.read()).done === true;
  } catch {
    return false;
  } finally {
    // Do not wait for an untrusted stream's cancellation callback.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createProductionWorkflowApiCsrfBootstrapHandler(
  dependencies: ProductionWorkflowApiCsrfBootstrapDependencies,
) {
  return async (request: Request): Promise<Response> => {
    if (!validateSameOriginMutation(request)) return error(403, "unauthorized");
    if (!await emptyBody(request)) return error(400, "request-invalid");
    const authentication = await dependencies.authenticate(request);
    if (!authentication.ok) {
      const body = await authentication.response.json().catch(() => ({ success: false, error: "authentication-rejected" }));
      return json(authentication.response.status, body as object);
    }
    const now = dependencies.now();
    const material = createProductionWorkflowApiCsrfMaterial({
      sessionId: authentication.context.identity.sessionId,
      issuedAt: now,
      sessionExpiresAt: authentication.context.identity.expiresAt,
      randomAuthority: nodeProductionWorkflowApiCsrfRandomAuthority,
    });
    if (material.status !== "created") return error(503, "temporarily-unavailable");
    const authority = await dependencies.authority();
    if (!authority) return error(503, "temporarily-unavailable");
    const issued = await authority.issueWithAtomicCeiling(material.material);
    if (issued.status !== "issued" || issued.tokenId !== material.material.tokenId || issued.expiresAt !== material.material.expiresAt) {
      return error(503, "temporarily-unavailable");
    }
    return json(200, { responseVersion: "1.0", token: material.token, expiresAt: issued.expiresAt });
  };
}
