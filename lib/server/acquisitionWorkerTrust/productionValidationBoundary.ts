import { validateAcquisitionRequest, type ValidatedAcquisitionRequest } from "../acquisitionWorker/contracts";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
  type AcquisitionResult,
} from "../acquisitionWorker/types";
import { validateAcquisitionSafeTelemetry, type AcquisitionSafeTelemetry } from "../acquisitionWorker/telemetry";
import { AcquisitionWorkerTrustFailure, type AcquisitionWorkerInvocationResult } from "./client";

export const PRODUCTION_VALIDATION_BODY_LIMIT_BYTES = 256;
const OPERATIONS = new Set(["initial", "status", "replay"] as const);
type ValidationOperation = "initial" | "status" | "replay";

const isJsonContentType = (value: string | null): boolean =>
  value !== null && /^\s*application\/json\s*(?:;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?$/i.test(value);

type AuthenticationResult =
  | Readonly<{ ok: true; userId: string }>
  | Readonly<{ ok: false; response: Response }>;

export type ProductionValidationBoundaryDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  authenticate(request: Request): Promise<AuthenticationResult>;
  invoke(request: ValidatedAcquisitionRequest, signal?: AbortSignal): Promise<AcquisitionWorkerInvocationResult>;
  lookup(acquisitionId: string, signal?: AbortSignal): Promise<AcquisitionResult | undefined>;
}>;

const headers = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});

const json = (status: number, body: Readonly<Record<string, unknown>>): Response =>
  new Response(JSON.stringify(body), { status, headers });

const readBoundedJson = async (request: Request): Promise<unknown> => {
  if (!request.body) throw new TypeError("invalid-request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > PRODUCTION_VALIDATION_BODY_LIMIT_BYTES) throw new TypeError("request-too-large");
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
};

const readOperation = (input: unknown): ValidationOperation => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-request");
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "operation" || keys[1] !== "requestVersion"
    || value.requestVersion !== "1.0" || typeof value.operation !== "string"
    || !OPERATIONS.has(value.operation as ValidationOperation)) throw new TypeError("invalid-request");
  return value.operation as ValidationOperation;
};

const readFrozenRequest = (environment: Readonly<Record<string, string | undefined>>): ValidatedAcquisitionRequest =>
  validateAcquisitionRequest({
    requestVersion: ACQUISITION_REQUEST_VERSION,
    acquisitionId: environment.NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ID,
    source: "youtube",
    sourceUrl: environment.NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_SOURCE_URL,
    requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
    maxBytes: ACQUISITION_MAX_BYTES,
    timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
  });

const project = (
  operation: ValidationOperation,
  acquisitionId: string,
  result: AcquisitionResult | undefined,
  diagnostic?: AcquisitionSafeTelemetry,
): Readonly<Record<string, unknown>> => {
  if (!result) return Object.freeze({ responseVersion: "1.0", operation, acquisitionId, status: "not-found" });
  if (result.status === "failed") return Object.freeze({
    responseVersion: "1.0", operation, acquisitionId, status: "failed",
    errorCode: result.errorCode, retryable: result.retryable,
    ...(diagnostic ? { diagnostic: validateAcquisitionSafeTelemetry(diagnostic) } : {}),
  });
  return Object.freeze({
    responseVersion: "1.0", operation, acquisitionId, status: "succeeded",
    artifactReference: result.artifactReference,
    sha256: result.handoff.sha256,
    byteSize: result.handoff.byteSize,
    contentType: result.handoff.contentType,
    durationSeconds: result.handoff.workerObservedDurationSeconds,
    videoPresent: result.handoff.videoPresent,
    audioPresent: result.handoff.audioPresent,
    expiresAt: result.handoff.expiresAt,
  });
};

export const createProductionValidationBoundary = (dependencies: ProductionValidationBoundaryDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { status: "rejected", errorCode: "method-not-allowed" });
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > PRODUCTION_VALIDATION_BODY_LIMIT_BYTES) {
      return json(413, { status: "rejected", errorCode: "request-too-large" });
    }
    if (!isJsonContentType(request.headers.get("content-type"))) {
      return json(415, { status: "rejected", errorCode: "unsupported-media-type" });
    }
    const authentication = await dependencies.authenticate(request);
    if (!authentication.ok) return authentication.response;
    const environment = dependencies.environment;
    const ownerUid = environment.NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_OWNER_UID;
    if (!ownerUid || authentication.userId !== ownerUid) return json(403, { status: "rejected", errorCode: "owner-authorization-required" });
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return json(403, { status: "rejected", errorCode: "invalid-origin" });
    }
    if (environment.VERCEL_ENV !== "production") return json(404, { status: "disabled", errorCode: "validation-boundary-disabled" });
    if (environment.NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ENABLED !== "true") {
      return json(404, { status: "disabled", errorCode: "validation-boundary-disabled" });
    }
    let operation: ValidationOperation;
    let frozenRequest: ValidatedAcquisitionRequest;
    try {
      operation = readOperation(await readBoundedJson(request));
      frozenRequest = readFrozenRequest(environment);
    } catch {
      return json(400, { status: "rejected", errorCode: "invalid-validation-request" });
    }
    try {
      if (operation === "status") {
        const result = await dependencies.lookup(frozenRequest.acquisitionId, request.signal);
        return json(200, project(operation, frozenRequest.acquisitionId, result));
      }
      const invocation = await dependencies.invoke(frozenRequest, request.signal);
      const response = project(operation, frozenRequest.acquisitionId, invocation.result,
        invocation.result.status === "failed" ? invocation.diagnostic : undefined);
      return json(invocation.result.status === "succeeded" ? 200 : 422, response);
    } catch (error) {
      const errorCode = error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable";
      const status = errorCode === "worker-timeout" ? 504 : errorCode === "worker-auth-rejected" ? 403 : 502;
      return json(status, { responseVersion: "1.0", operation, acquisitionId: frozenRequest.acquisitionId,
        status: "failed", errorCode });
    }
  };
