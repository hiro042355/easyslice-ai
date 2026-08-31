import type { StartWorkflowRequest } from "@/lib/workflowApi/types";
import type { ReferenceWorkflowStartFixtureBootstrapRequest, ReferenceWorkflowStartFixtureId, ReferenceWorkflowStartFixtureOperation } from "@/lib/workflowApi/referenceWorkflowStartFixtureBootstrapTypes";
import { copy, isPlainObject, validateRequest } from "@/lib/workflowApi/workflowApiUtils";
import type { WorkflowFetchCsrfProvider, WorkflowFetchTimeoutController, WorkflowFetchTransport } from "./types";
import { validCsrf, validJsonContentType } from "./workflowFetchClientUtils";

export type ReferenceWorkflowStartFixtureBootstrapRequestOptions = { optionsVersion: "1.0"; signal?: AbortSignal; timeoutMs?: number };
export type ReferenceWorkflowStartFixtureBootstrapClientError = { errorVersion: "1.0"; code: "unauthenticated" | "forbidden" | "unavailable" | "timeout" | "aborted" | "invalid-response" | "failed"; messageKey: "workflow.fixtureBootstrapUnavailable" };
export type ReferenceWorkflowStartFixtureBootstrapClientResult = { status: "ready"; fixtureId: ReferenceWorkflowStartFixtureId; operation: ReferenceWorkflowStartFixtureOperation; request: Omit<StartWorkflowRequest, "idempotencyKey"> } | { status: "failed"; error: ReferenceWorkflowStartFixtureBootstrapClientError };
export type ReferenceWorkflowStartFixtureBootstrapClient = { getStartFixture(input: ReferenceWorkflowStartFixtureBootstrapRequest, options?: ReferenceWorkflowStartFixtureBootstrapRequestOptions): Promise<ReferenceWorkflowStartFixtureBootstrapClientResult> };

const ENDPOINT = "/api/reference-test/workflow-start-fixture", LIMIT = 524288, DEFAULT_TIMEOUT = 15000;
const matrix: Readonly<Record<ReferenceWorkflowStartFixtureId, ReferenceWorkflowStartFixtureOperation>> = Object.freeze({ "canonical-vocal-success-v1": "generate-vocal", "canonical-music-success-v1": "generate-music", "canonical-mv-success-v1": "generate-mv" });
const ids: readonly ReferenceWorkflowStartFixtureId[] = Object.freeze(["canonical-vocal-success-v1", "canonical-music-success-v1", "canonical-mv-success-v1"]);
const isId = (value: unknown): value is ReferenceWorkflowStartFixtureId => typeof value === "string" && ids.some(id => id === value);
const projectPublicStartRequest = (value: StartWorkflowRequest): Omit<StartWorkflowRequest, "idempotencyKey"> => ({
  requestVersion: value.requestVersion,
  operation: value.operation,
  workflowInput: copy(value.workflowInput),
});
const fail = (code: ReferenceWorkflowStartFixtureBootstrapClientError["code"]): ReferenceWorkflowStartFixtureBootstrapClientResult => ({ status: "failed", error: { errorVersion: "1.0", code, messageKey: "workflow.fixtureBootstrapUnavailable" } });
const validInput = (value: unknown): value is ReferenceWorkflowStartFixtureBootstrapRequest => isPlainObject(value) && Object.keys(value).length === 3 && Object.keys(value).every(key => ["contractVersion", "fixtureId", "operation"].includes(key)) && value.contractVersion === "1.0" && isId(value.fixtureId) && matrix[value.fixtureId] === value.operation;
function validateReady(raw: unknown, expected: ReferenceWorkflowStartFixtureBootstrapRequest): ReferenceWorkflowStartFixtureBootstrapClientResult {
  if (!isPlainObject(raw) || Object.keys(raw).length !== 5 || !Object.keys(raw).every(key => ["status", "contractVersion", "fixtureId", "operation", "request"].includes(key)) || raw.status !== "ready" || raw.contractVersion !== "1.0" || raw.fixtureId !== expected.fixtureId || raw.operation !== expected.operation || !isPlainObject(raw.request)) return fail("invalid-response");
  const checked = validateRequest({ ...raw.request, idempotencyKey: "bootstrap-client-validation" });
  if (checked.status !== "valid" || !("operation" in checked.value) || checked.value.operation !== expected.operation) return fail("invalid-response");
  const request = projectPublicStartRequest(checked.value);
  return { status: "ready", fixtureId: expected.fixtureId, operation: expected.operation, request: copy(request) };
}
export function createReferenceWorkflowStartFixtureBootstrapClient(deps: { transport: WorkflowFetchTransport; csrfProvider: WorkflowFetchCsrfProvider; timeoutController: WorkflowFetchTimeoutController }): ReferenceWorkflowStartFixtureBootstrapClient {
  return Object.freeze({ async getStartFixture(input, options) {
    if (!validInput(input) || options !== undefined && (options.optionsVersion !== "1.0" || options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 120000))) return fail("invalid-response");
    if (options?.signal?.aborted) return fail("aborted");
    const csrf = deps.csrfProvider.getToken(); if (csrf.status !== "available" || !validCsrf(csrf.token)) return fail("unavailable");
    const controller = new AbortController(); let cause: "caller" | "timeout" | undefined;
    const abort = () => { if (!cause) { cause = "caller"; controller.abort(); } }; options?.signal?.addEventListener("abort", abort, { once: true });
    const timer = deps.timeoutController.schedule(options?.timeoutMs ?? DEFAULT_TIMEOUT, () => { if (!cause) { cause = "timeout"; controller.abort(); } });
    try {
      const execution = Promise.resolve().then(() => deps.transport.execute({ url: ENDPOINT, method: "POST", headers: Object.freeze({ "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrf.token }), body: JSON.stringify(copy(input)), credentials: "same-origin", cache: "no-store", signal: controller.signal })).then(response => ({ kind: "response" as const, response }), () => ({ kind: "failed" as const }));
      const boundary = new Promise<{ kind: "boundary"; reason: "caller" | "timeout" }>(resolve => controller.signal.addEventListener("abort", () => resolve({ kind: "boundary", reason: cause ?? "caller" }), { once: true }));
      const outcome = await Promise.race([execution, boundary]);
      if (outcome.kind === "boundary") return fail(outcome.reason === "caller" ? "aborted" : "timeout");
      if (outcome.kind === "failed") return fail("unavailable");
      if (outcome.response.status === 401) return fail("unauthenticated"); if (outcome.response.status === 403) return fail("forbidden"); if (outcome.response.status === 404 || outcome.response.status === 503) return fail("unavailable"); if (outcome.response.status === 400 || outcome.response.status === 422 || outcome.response.status === 500) return fail("failed");
      if (outcome.response.status !== 200 || outcome.response.body.byteLength === 0 || outcome.response.body.byteLength > LIMIT || !validJsonContentType(outcome.response.headers)) return fail("invalid-response");
      let raw: unknown; try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(outcome.response.body)); } catch { return fail("invalid-response"); }
      return validateReady(raw, input);
    } finally { timer.cancel(); options?.signal?.removeEventListener("abort", abort); }
  } });
}
