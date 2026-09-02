import { validateErrorDto, validateRequest, validateResultDto } from "@/lib/workflowApi/workflowApiUtils";
import type { WorkflowApiErrorDTO, WorkflowApiRequest, WorkflowApiServiceResult } from "@/lib/workflowApi/types";
import { copyWorkflowUi, validateWorkflowUiServiceResult } from "@/lib/workflowUi/workflowUiUtils";
import type { WorkflowUiApiClientResult } from "@/lib/workflowUi/types";
import type { WorkflowFetchClient, WorkflowFetchClientResult, WorkflowFetchCommandInput, WorkflowFetchCsrfProvider, WorkflowFetchRequestOptions, WorkflowFetchTimeoutController, WorkflowFetchTransport, WorkflowFetchTransportResponse, WorkflowUiFetchClientAdapter } from "./types";
import { DEFAULT_TIMEOUTS, ENDPOINTS, RESPONSE_BYTE_LIMIT, abortedResult, decodeJson, networkResult, requestLimit, serializeRequest, validCsrf, validJsonContentType, validKey } from "./workflowFetchClientUtils";

type Method = keyof typeof ENDPOINTS;
const commands = Object.freeze({ pollUpload:"poll-upload", pollGeneration:"poll-generation", queryResult:"result", cancel:"cancel" } as const);
const expectedErrors: Readonly<Record<string, readonly number[]>> = Object.freeze({ "request-invalid":[400,413,415], "request-version-unsupported":[400], "operation-unsupported":[422], unauthenticated:[401], unauthorized:[403], "reference-unavailable":[404], "reference-expired":[410], "idempotency-conflict":[409], "workflow-conflict":[409], "workflow-failed":[500], "workflow-cancelled":[200], "rate-limited":[429], "temporarily-unavailable":[503], timeout:[504], "reconciliation-required":[202], "internal-error":[500] });

function validCommandRequest(method: Method, input: WorkflowFetchCommandInput): boolean {
  if ("command" in input.request || "idempotencyKey" in input.request) return false;
  const candidate: WorkflowApiRequest = method === "start"
    ? { ...input.request, idempotencyKey: input.idempotencyKey } as WorkflowApiRequest
    : { ...input.request, command: commands[method], idempotencyKey: input.idempotencyKey } as WorkflowApiRequest;
  const checked = validateRequest(candidate);
  if (checked.status !== "valid") return false;
  return method === "start"
    ? "operation" in checked.value
    : "command" in checked.value && checked.value.command === commands[method];
}

function normalize(response: WorkflowFetchTransportResponse): WorkflowUiApiClientResult {
  const length = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-length")?.[1];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > RESPONSE_BYTE_LIMIT)) return networkResult("response-invalid");
  if (!validJsonContentType(response.headers)) return networkResult("response-invalid");
  const raw = decodeJson(response.body);
  if (!raw) return networkResult("response-invalid");
  const result = validateResultDto(raw);
  if (result.status === "valid") {
    const expected = result.value.status === "pending-upload" || result.value.status === "pending-generation" ? 202 : 200;
    if (response.status !== expected) return networkResult("response-invalid");
    const service: WorkflowApiServiceResult = { status:"success", http:{ statusCode:response.status, headers:[] }, body:result.value };
    return validateWorkflowUiServiceResult(service).status === "valid" ? { status:"response", result:copyWorkflowUi(service) } : networkResult("response-invalid");
  }
  const error = validateErrorDto(raw);
  if (error.status !== "valid" || !expectedErrors[error.value.code]?.includes(response.status)) return networkResult("response-invalid");
  const service: WorkflowApiServiceResult = { status:"error", http:{ statusCode:response.status, headers:[] }, body:error.value as WorkflowApiErrorDTO };
  if (validateWorkflowUiServiceResult(service).status !== "valid") return networkResult("response-invalid");
  if (response.status === 503) return networkResult("service-unavailable");
  return { status:"response", result:copyWorkflowUi(service) };
}

export function createWorkflowFetchClient(deps: { transport: WorkflowFetchTransport; csrfProvider: WorkflowFetchCsrfProvider; timeoutController: WorkflowFetchTimeoutController }): WorkflowFetchClient {
  const call = async (method: Method, input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult> => {
    if (options && (options.optionsVersion !== "1.0" || options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 120000))) return networkResult("response-invalid");
    if (options?.signal?.aborted) return abortedResult();
    if (!validKey(input.idempotencyKey) || !validCommandRequest(method, input)) return networkResult("response-invalid");
    const csrf = deps.csrfProvider.getToken();
    if (csrf.status !== "available" || !validCsrf(csrf.token) || csrf.token === input.idempotencyKey) return networkResult("response-invalid");
    const serialized = serializeRequest(input.request);
    if (serialized.status !== "serialized" || serialized.bytes > requestLimit(method, input.request)) return networkResult("response-invalid");
    const controller = new AbortController();
    let cause: "caller" | "timeout" | undefined;
    const onAbort = () => { if (!cause) { cause = "caller"; controller.abort(); } };
    options?.signal?.addEventListener("abort", onAbort, { once:true });
    const timer = deps.timeoutController.schedule(options?.timeoutMs ?? DEFAULT_TIMEOUTS[method], () => { if (!cause) { cause = "timeout"; controller.abort(); } });
    const request = Object.freeze({ url:ENDPOINTS[method], method:"POST" as const, headers:Object.freeze({ "Content-Type":"application/json", Accept:"application/json", "Idempotency-Key":input.idempotencyKey, "X-CSRF-Token":csrf.token }), body:serialized.body, credentials:"same-origin" as const, cache:"no-store" as const, signal:controller.signal });
    let settleBoundary: ((value: "caller" | "timeout") => void) | undefined;
    const boundary = new Promise<"caller" | "timeout">((resolve) => { settleBoundary = resolve; });
    const boundaryAbort = () => settleBoundary?.(cause ?? "caller");
    controller.signal.addEventListener("abort", boundaryAbort, { once:true });
    try {
      const execution = Promise.resolve().then(() => deps.transport.execute(request)).then((response) => ({ kind:"response" as const, response }), () => ({ kind:"failure" as const }));
      const outcome = await Promise.race([execution, boundary.then((reason) => ({ kind:"boundary" as const, reason }))]);
      if (outcome.kind === "boundary") return outcome.reason === "caller" ? abortedResult() : networkResult("request-timeout");
      if (outcome.kind === "failure") return networkResult("network-unavailable");
      return normalize({ status:outcome.response.status, headers:Object.freeze({ ...outcome.response.headers }), body:new Uint8Array(outcome.response.body) });
    } finally {
      timer.cancel();
      controller.signal.removeEventListener("abort", boundaryAbort);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  };
  const client: WorkflowFetchClient = { start:(i,o)=>call("start",i,o), pollUpload:(i,o)=>call("pollUpload",i,o), pollGeneration:(i,o)=>call("pollGeneration",i,o), queryResult:(i,o)=>call("queryResult",i,o), cancel:(i,o)=>call("cancel",i,o) };
  return Object.freeze(client);
}

export function createWorkflowUiFetchClientAdapter(client: WorkflowFetchClient): WorkflowUiFetchClientAdapter {
  return Object.freeze({ start:(i)=>client.start(i,{optionsVersion:"1.0",timeoutMs:DEFAULT_TIMEOUTS.start}), pollUpload:(i)=>client.pollUpload(i,{optionsVersion:"1.0",timeoutMs:DEFAULT_TIMEOUTS.pollUpload}), pollGeneration:(i)=>client.pollGeneration(i,{optionsVersion:"1.0",timeoutMs:DEFAULT_TIMEOUTS.pollGeneration}), queryResult:(i)=>client.queryResult(i,{optionsVersion:"1.0",timeoutMs:DEFAULT_TIMEOUTS.queryResult}), cancel:(i)=>client.cancel(i,{optionsVersion:"1.0",timeoutMs:DEFAULT_TIMEOUTS.cancel}) });
}
