import type { WorkflowApiCommand, WorkflowApiRequest } from "@/lib/workflowApi/types";
import { isPlainObject, validateRequest, validIdempotencyKey } from "@/lib/workflowApi/workflowApiUtils";
import type {
  ProductionWorkflowApiBoundaryFailure,
  ProductionWorkflowApiRequestBoundaryResult,
} from "./productionWorkflowApiBoundaryTypes";

const START_ABSOLUTE_LIMIT = 524_288;
const START_STANDARD_LIMIT = 131_072;
const COMMAND_LIMIT = 8_192;
const HEADER_CONTROL = /[\u0000-\u001f\u007f]/u;

const reject = (
  statusCode: ProductionWorkflowApiBoundaryFailure["statusCode"],
  code: ProductionWorkflowApiBoundaryFailure["code"],
): ProductionWorkflowApiBoundaryFailure => Object.freeze({ status: "rejected", statusCode, code });

function singleHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  if (value === null || value.length === 0 || value !== value.trim() || value.includes(",") || HEADER_CONTROL.test(value)) return undefined;
  return value;
}

function validContentType(headers: Headers): boolean {
  const value = singleHeader(headers, "content-type");
  if (!value) return false;
  const parts = value.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") return false;
  return parts.length === 0 || (parts.length === 1 && /^charset=(?:utf-8|"utf-8")$/iu.test(parts[0]));
}

function declaredLength(headers: Headers): number | undefined | "invalid" {
  const raw = headers.get("content-length");
  if (raw === null) return undefined;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) return "invalid";
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : "invalid";
}

async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array | "invalid" | "too-large"> {
  if (!request.body) return "invalid";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array)) return "invalid";
      if (chunk.byteLength > limit - bytes) {
        await reader.cancel().catch(() => undefined);
        return "too-large";
      }
      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return "invalid";
  } finally {
    reader.releaseLock();
  }
  if (bytes === 0) return "invalid";
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function commandMatches(command: WorkflowApiCommand, request: WorkflowApiRequest): boolean {
  return command === "start" ? "operation" in request : "command" in request && request.command === command;
}

export async function readProductionWorkflowApiRequest(
  request: Request,
  command: WorkflowApiCommand,
): Promise<ProductionWorkflowApiRequestBoundaryResult> {
  if (!validContentType(request.headers)) return reject(415, "request-invalid");
  const idempotencyKey = singleHeader(request.headers, "idempotency-key");
  if (!idempotencyKey || !validIdempotencyKey(idempotencyKey)) return reject(400, "request-invalid");
  const absoluteLimit = command === "start" ? START_ABSOLUTE_LIMIT : COMMAND_LIMIT;
  const length = declaredLength(request.headers);
  if (length === "invalid") return reject(400, "request-invalid");
  if (length !== undefined && length > absoluteLimit) return reject(413, "request-invalid");
  const bytes = await readBoundedBody(request, absoluteLimit);
  if (bytes === "too-large") return reject(413, "request-invalid");
  if (bytes === "invalid") return reject(400, "request-invalid");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return reject(400, "request-invalid");
  }
  if (text.charCodeAt(0) === 0xfeff) return reject(400, "request-invalid");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reject(400, "request-invalid");
  }
  if (!isPlainObject(body) || "idempotencyKey" in body || "command" in body) return reject(400, "request-invalid");
  if (command === "start" && body.operation !== "generate-mv" && bytes.byteLength > START_STANDARD_LIMIT) {
    return reject(413, "request-invalid");
  }
  const candidate = command === "start" ? { ...body, idempotencyKey } : { ...body, command, idempotencyKey };
  const validated = validateRequest(candidate);
  if (validated.status !== "valid") {
    return validated.code === "operation-unsupported"
      ? reject(422, validated.code)
      : reject(400, validated.code);
  }
  if (!commandMatches(command, validated.value)) return reject(400, "request-invalid");
  return Object.freeze({
    status: "accepted",
    bytes: bytes.byteLength,
    idempotencyKey,
    request: validated.value,
  });
}
