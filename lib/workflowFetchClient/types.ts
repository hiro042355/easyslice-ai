import type { WorkflowApiCommand, WorkflowApiErrorDTO, WorkflowApiResultDTO } from "@/lib/workflowApi/types";
import type { WorkflowUiApiClient, WorkflowUiApiClientResult } from "@/lib/workflowUi/types";

export type WorkflowFetchRequestOptions = { optionsVersion: "1.0"; signal?: AbortSignal; timeoutMs?: number };
export type WorkflowFetchCommandInput = { request: Record<string, unknown>; idempotencyKey: string };
export type WorkflowFetchEndpoint = "start" | "poll-upload" | "poll-generation" | "result" | "cancel";
export type WorkflowFetchTransportRequest = { url: string; method: "POST"; headers: Readonly<Record<string, string>>; body: string; credentials: "same-origin"; cache: "no-store"; signal?: AbortSignal };
export type WorkflowFetchTransportResponse = { status: number; headers: Readonly<Record<string, string>>; body: Uint8Array };
export interface WorkflowFetchTransport { execute(request: WorkflowFetchTransportRequest): Promise<WorkflowFetchTransportResponse> }
export type WorkflowFetchCsrfResult = { status: "available"; token: string } | { status: "unavailable" };
export interface WorkflowFetchCsrfProvider { getToken(): WorkflowFetchCsrfResult }
export interface WorkflowFetchTimeoutHandle { cancel(): void }
export interface WorkflowFetchTimeoutController { schedule(timeoutMs: number, onTimeout: () => void): WorkflowFetchTimeoutHandle }
export type WorkflowFetchClientResult = WorkflowUiApiClientResult;
export interface WorkflowFetchClient {
  start(input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult>;
  pollUpload(input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult>;
  pollGeneration(input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult>;
  queryResult(input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult>;
  cancel(input: WorkflowFetchCommandInput, options?: WorkflowFetchRequestOptions): Promise<WorkflowFetchClientResult>;
}
export type WorkflowUiFetchClientAdapter = WorkflowUiApiClient;
export type WorkflowFetchValidatedBody = WorkflowApiResultDTO | WorkflowApiErrorDTO;
export type WorkflowFetchClientDescriptor = { descriptorVersion: "1.0"; id: string; contractVersion: "1.0"; supportedCommands: readonly WorkflowApiCommand[]; responseByteLimit: 262144; availability: "available"; transportKind: "injected" | "reference-stub" };
export type WorkflowFetchClientRegistry = { list(): readonly WorkflowFetchClientDescriptor[]; get(id: string): WorkflowFetchClientDescriptor | undefined };
