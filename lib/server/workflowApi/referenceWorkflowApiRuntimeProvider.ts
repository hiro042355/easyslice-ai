// Server-only boundary. Reference runtime is single-process and is not shared across hot reload, restarts, or serverless instances.
import type { ReferenceWorkflowIntegrationRuntime } from "@/lib/workflowEntry/types";
export type ReferenceWorkflowApiRuntimeProvider={getRuntime():Promise<ReferenceWorkflowIntegrationRuntime>;resetForTest(runtime:ReferenceWorkflowIntegrationRuntime):void};
export function createReferenceWorkflowApiRuntimeProviderFromRuntime(initial:ReferenceWorkflowIntegrationRuntime):ReferenceWorkflowApiRuntimeProvider{let runtime=initial;return{async getRuntime(){return runtime},resetForTest(next){runtime=next}}}
