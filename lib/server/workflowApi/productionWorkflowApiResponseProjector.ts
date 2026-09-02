import type {
  WorkflowApiErrorCode,
  WorkflowApiErrorDTO,
  WorkflowApiResultDTO,
  WorkflowApiServiceResult,
} from "@/lib/workflowApi/types";
import { copy, isPlainObject, validateErrorDto, validateResultDto } from "@/lib/workflowApi/workflowApiUtils";
import type { ProductionWorkflowApiBoundaryFailure } from "./productionWorkflowApiBoundaryTypes";

const messages: Readonly<Record<WorkflowApiErrorCode, string>> = Object.freeze({
  "request-invalid": "The request could not be processed.",
  "request-version-unsupported": "The request version is not supported.",
  "operation-unsupported": "The operation is not supported.",
  unauthenticated: "Authentication is required.",
  unauthorized: "The operation is not permitted.",
  "reference-unavailable": "The workflow reference is unavailable.",
  "reference-expired": "The workflow reference is unavailable.",
  "idempotency-conflict": "The request conflicts with an earlier request.",
  "workflow-conflict": "The workflow state could not be updated.",
  "workflow-failed": "The workflow could not be completed.",
  "workflow-cancelled": "The workflow was cancelled.",
  "rate-limited": "Too many requests were made.",
  "temporarily-unavailable": "The workflow service is temporarily unavailable.",
  timeout: "The workflow outcome is not yet available.",
  "reconciliation-required": "The workflow outcome requires reconciliation.",
  "internal-error": "The workflow request could not be completed.",
});

const statuses: Readonly<Record<WorkflowApiErrorCode, readonly number[]>> = Object.freeze({
  "request-invalid": [400, 413, 415],
  "request-version-unsupported": [400],
  "operation-unsupported": [422],
  unauthenticated: [401],
  unauthorized: [403],
  "reference-unavailable": [404],
  "reference-expired": [410],
  "idempotency-conflict": [409],
  "workflow-conflict": [409],
  "workflow-failed": [500],
  "workflow-cancelled": [200],
  "rate-limited": [429],
  "temporarily-unavailable": [503],
  timeout: [504],
  "reconciliation-required": [202],
  "internal-error": [500],
});

const headers = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json; charset=utf-8",
});

const errorCodes = new Set<WorkflowApiErrorCode>(Object.keys(messages) as WorkflowApiErrorCode[]);

function canonicalError(code: WorkflowApiErrorCode, retryable = false, retryAfterClass?: "short" | "medium" | "long"): WorkflowApiErrorDTO {
  return {
    errorVersion: "1.0",
    code,
    message: messages[code],
    retryable,
    ...(retryAfterClass ? { retryAfterClass } : {}),
  };
}

export function createProductionWorkflowApiBoundaryFailure(
  statusCode: ProductionWorkflowApiBoundaryFailure["statusCode"],
  code: ProductionWorkflowApiBoundaryFailure["code"],
): ProductionWorkflowApiBoundaryFailure {
  return Object.freeze({ status: "rejected", statusCode, code });
}

function validErrorResult(result: Extract<WorkflowApiServiceResult, { status: "error" }>): boolean {
  const checked = validateErrorDto(result.body);
  return checked.status === "valid"
    && errorCodes.has(checked.value.code)
    && statuses[checked.value.code].includes(result.http.statusCode);
}

function canonicalResult(result: Extract<WorkflowApiServiceResult, { status: "success" }>): WorkflowApiResultDTO | undefined {
  const checked = validateResultDto(result.body);
  if (checked.status !== "valid") return undefined;
  const expected = checked.value.status === "pending-upload" || checked.value.status === "pending-generation" ? 202 : 200;
  if (result.http.statusCode !== expected) return undefined;
  if (checked.value.status !== "failed") return copy(checked.value);
  const nested = validateErrorDto(checked.value.error);
  if (nested.status !== "valid" || !errorCodes.has(nested.value.code)) return undefined;
  return { ...copy(checked.value), error: canonicalError(nested.value.code, nested.value.retryable, nested.value.retryAfterClass) };
}

function response(statusCode: number, body: WorkflowApiErrorDTO | WorkflowApiResultDTO): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: new Headers(headers) });
}

const internalFailure = () => response(500, canonicalError("internal-error"));

export function projectProductionWorkflowApiResponse(input: unknown): Response {
  try {
    if (isPlainObject(input) && input.status === "rejected") {
      const statusCode = input.statusCode;
      const code = input.code;
      if (typeof statusCode !== "number" || typeof code !== "string" || !errorCodes.has(code as WorkflowApiErrorCode)) return internalFailure();
      const typedCode = code as WorkflowApiErrorCode;
      if (!statuses[typedCode].includes(statusCode)) return internalFailure();
      return response(statusCode, canonicalError(typedCode));
    }
    if (!isPlainObject(input) || !(input.status === "success" || input.status === "error") || !isPlainObject(input.http)) {
      return internalFailure();
    }
    const result = input as unknown as WorkflowApiServiceResult;
    if (result.status === "error") {
      if (!validErrorResult(result)) return internalFailure();
      return response(result.http.statusCode, canonicalError(result.body.code, result.body.retryable, result.body.retryAfterClass));
    }
    const body = canonicalResult(result);
    return body ? response(result.http.statusCode, body) : internalFailure();
  } catch {
    return internalFailure();
  }
}
