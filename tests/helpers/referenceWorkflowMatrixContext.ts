import { createReferenceWorkflowController } from "@/lib/workflowUi/referenceWorkflowController";
import { createReferenceWorkflowIdempotencyKeyFactory } from "@/lib/workflowUi/referenceWorkflowIdempotencyKeyFactory";
import { createReferenceWorkflowPollScheduler, REFERENCE_WORKFLOW_UI_POLL_POLICY } from "@/lib/workflowUi/referenceWorkflowPollScheduler";
import { createReferenceWorkflowInMemorySessionStore } from "@/lib/workflowUi/referenceWorkflowSessionStore";
import type { ReferenceWorkflowHookInput } from "@/hooks/referenceWorkflowHookTypes";
import { createReferenceWorkflowControllerHolder } from "@/hooks/referenceWorkflowControllerHolder";
import type { WorkflowApiResultDTO, WorkflowUiApiClientResult, WorkflowUiControllerInput } from "@/lib/workflowUi/types";
import { createDeferredClient } from "./referenceWorkflowDeferredClient";
import { createFakeEnvironment } from "./referenceWorkflowFakeEnvironment";
import { createFakeTimer } from "./referenceWorkflowFakeTimer";

export type MatrixInput = { ready: boolean };
export const matrixRequest = { operation: "generate-mv", request: { requestVersion: "1.0", operation: "generate-mv", workflowInput: {} as never } } as WorkflowUiControllerInput;
export function reference(kind: "upload-pending", value?: string): { referenceVersion: "1.0"; kind: "upload-pending"; reference: string };
export function reference(kind: "generation-job", value?: string): { referenceVersion: "1.0"; kind: "generation-job"; reference: string };
export function reference(kind: "workflow-result", value?: string): { referenceVersion: "1.0"; kind: "workflow-result"; reference: string };
export function reference(kind: "upload-pending" | "generation-job" | "workflow-result", value = "opaque") { return { referenceVersion: "1.0" as const, kind, reference: value }; }
export const serviceResponse = (body: WorkflowApiResultDTO, statusCode = body.status === "pending-upload" || body.status === "pending-generation" ? 202 : 200): WorkflowUiApiClientResult => ({ status: "response", result: { status: "success", http: { statusCode, headers: [] }, body } });
export const pendingUpload = (): WorkflowApiResultDTO => ({ responseVersion: "1.0", status: "pending-upload", operation: "generate-mv", reference: reference("upload-pending"), retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } });
export const pendingGeneration = (): WorkflowApiResultDTO => ({ responseVersion: "1.0", status: "pending-generation", operation: "generate-mv", reference: reference("generation-job"), retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "medium" } });
export const terminal = (status: "completed" | "degraded" | "partial" | "cancelled", value = "result"): WorkflowApiResultDTO => status === "cancelled" ? { responseVersion: "1.0", status, operation: "generate-mv", resultReference: reference("workflow-result", value) } : { responseVersion: "1.0", status, operation: "generate-mv", assets: [{ assetVersion: "1.0", assetId: "formal-asset", kind: "video", role: "primary", mimeType: "video/mp4" }], resultReference: reference("workflow-result", value) };
export const failedTerminal = (value = "result"): WorkflowApiResultDTO => ({ responseVersion: "1.0", status: "failed", operation: "generate-mv", error: { errorVersion: "1.0", code: "workflow-failed", message: "Safe failure.", retryable: false }, resultReference: reference("workflow-result", value) });
export const recoverySession = (kind: "upload-pending" | "generation-job" | "workflow-result" = "workflow-result") => ({ sessionVersion: "2.0" as const, operation: "generate-mv" as const, reference: reference(kind as "workflow-result"), lastServerStatus: kind === "upload-pending" ? "pending-upload" as const : kind === "generation-job" ? "pending-generation" as const : "completed" as const, pollAttempts: 0, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:40:00.000Z" });
export const serviceError = (code: "reference-unavailable" | "reference-expired" | "workflow-conflict" | "idempotency-conflict" | "reconciliation-required") => ({ status: "response" as const, result: { status: "error" as const, http: { statusCode: 409, headers: [] }, body: { errorVersion: "1.0" as const, code, message: "Safe failure.", retryable: code === "reconciliation-required" } } });

export function createMatrixContext(initialSession?: unknown, autoRecover = false) {
  const client = createDeferredClient(), timer = createFakeTimer(), environment = createFakeEnvironment({ online: true, visibility: "visible" }), store = createReferenceWorkflowInMemorySessionStore(initialSession), scheduler = createReferenceWorkflowPollScheduler();
  const controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: scheduler, pollPolicy: REFERENCE_WORKFLOW_UI_POLL_POLICY, sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory("matrix"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:10:00.000Z", expiresAtUtc: () => "2026-01-01T00:40:00.000Z" }, sessionTtlMs: 1_800_000 });
  const hookInput: ReferenceWorkflowHookInput<MatrixInput, WorkflowUiControllerInput> = { operation: "generate-mv", projector: { project(input) { return input.ready ? { status: "projected", request: matrixRequest } : { status: "not-ready", reason: "input-not-ready" }; } }, dependencies: { controllerHolder: createReferenceWorkflowControllerHolder({ createController: () => controller, environment }), timer, environment, pollScheduler: scheduler, pollPolicy: REFERENCE_WORKFLOW_UI_POLL_POLICY }, autoRecover };
  return { client, timer, environment, store, controller, hookInput };
}
