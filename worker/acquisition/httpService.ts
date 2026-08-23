import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { validateAcquisitionRequest, validateAcquisitionResult } from "../../lib/server/acquisitionWorker/contracts";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";
import { validateAcquisitionSafeTelemetry, type AcquisitionSafeTelemetry } from "../../lib/server/acquisitionWorker/telemetry";

const MAX_REQUEST_BYTES = 16 * 1024;

export type WorkerReadiness = Readonly<{
  ready: boolean;
  ytDlpVersionMatch: boolean;
  ffmpegAvailable: boolean;
  nodeSupported: boolean;
  providerHealthy: boolean;
}>;

export type WorkerNetworkReadiness = Readonly<{
  staticEgressAuthorityConfigured: boolean;
  observedEgressMatchesReservedAuthority: boolean;
  youtubeAttemptCount: 0;
}>;

export type WorkerHttpDependencies = Readonly<{
  execute(input: unknown, signal?: AbortSignal): Promise<AcquisitionResult>;
  readiness(signal?: AbortSignal): Promise<WorkerReadiness>;
  networkReadiness?(signal?: AbortSignal): Promise<WorkerNetworkReadiness>;
  controlStoreProof?(): Promise<Readonly<Record<string, boolean | number>>>;
  log(event: Readonly<Record<string, string | number | boolean>>): void;
  telemetry?(acquisitionId: string): AcquisitionSafeTelemetry | undefined;
}>;

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new TypeError("request-too-large");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BYTES) throw new TypeError("request-too-large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export const createAcquisitionWorkerHttpService = (dependencies: WorkerHttpDependencies) => createServer(async (request, response) => {
  const startedAt = Date.now();
  const abort = new AbortController();
  request.once("aborted", () => abort.abort());
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      return sendJson(response, 200, { status: "healthy" });
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = await dependencies.readiness(abort.signal);
      return sendJson(response, readiness.ready ? 200 : 503, readiness);
    }
    if (request.method === "GET" && request.url === "/internal/network-readiness" && dependencies.networkReadiness) {
      const evidence = await dependencies.networkReadiness(abort.signal);
      const success = evidence.staticEgressAuthorityConfigured && evidence.observedEgressMatchesReservedAuthority;
      return sendJson(response, success ? 200 : 503, evidence);
    }
    if (request.method === "POST" && request.url === "/internal/control-store-proof") {
      if (!dependencies.controlStoreProof || request.headers["transfer-encoding"]
        || Number(request.headers["content-length"] ?? 0) !== 0) {
        return sendJson(response, 400, { status: "failed", errorCode: "invalid-acquisition-request" });
      }
      return sendJson(response, 200, { success: true, evidence: await dependencies.controlStoreProof() });
    }
    if (request.method === "POST" && request.url === "/v1/acquisitions") {
      if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
        return sendJson(response, 415, { status: "failed", errorCode: "invalid-acquisition-request" });
      }
      const input = validateAcquisitionRequest(await readJson(request));
      const result = validateAcquisitionResult(await dependencies.execute(input, abort.signal));
      const diagnostic = dependencies.telemetry?.(input.acquisitionId);
      dependencies.log({
        event: "acquisition-completed",
        source: input.source,
        status: result.status,
        elapsedBucket: Math.ceil((Date.now() - startedAt) / 10_000) * 10,
        ...(result.status === "failed" ? { failureCode: result.errorCode } : {}),
      });
      return sendJson(response, result.status === "succeeded" ? 200 : 422,
        diagnostic ? { ...result, diagnostic: validateAcquisitionSafeTelemetry(diagnostic) } : result);
    }
    return sendJson(response, 404, { status: "not-found" });
  } catch {
    dependencies.log({ event: "worker-request-rejected", failureCode: "invalid-acquisition-request" });
    return sendJson(response, 400, { status: "failed", errorCode: "invalid-acquisition-request" });
  }
});
