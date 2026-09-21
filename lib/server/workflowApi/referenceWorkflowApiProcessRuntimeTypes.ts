import type { createReferenceWorkflowApiFoundation } from "./referenceWorkflowApiFoundation";
import type { ReferenceWorkflowApiSecurityProvider } from "./referenceWorkflowApiSecurityProvider";
import type { ReferenceWorkflowIntegrationRuntime } from "@/lib/workflowEntry/types";

export type ReferenceWorkflowApiProcessRuntime = Readonly<{
  runtimeVersion: "1.0";
  initializedAtClass: "process-lifecycle";
  workflowRuntime: ReferenceWorkflowIntegrationRuntime;
  apiFoundation: ReturnType<typeof createReferenceWorkflowApiFoundation>;
  securityProvider: ReferenceWorkflowApiSecurityProvider;
}>;

export type ReferenceWorkflowApiProcessRuntimeHolder = Readonly<{
  holderVersion: "1.0";
  get(): ReferenceWorkflowApiProcessRuntime;
}>;
