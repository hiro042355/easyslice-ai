import { createReferenceWorkflowIntegrationRuntime } from "@/lib/server/workflowEntry/referenceWorkflowRuntime";
import { createReferenceWorkflowApiFoundation } from "./referenceWorkflowApiFoundation";
import { createReferenceWorkflowApiSecurityProvider } from "./referenceWorkflowApiSecurityProvider";
import type {
  ReferenceWorkflowApiProcessRuntime,
  ReferenceWorkflowApiProcessRuntimeHolder,
} from "./referenceWorkflowApiProcessRuntimeTypes";

const PROCESS_RUNTIME_SYMBOL = Symbol.for("nexcut.reference-workflow-api.process-runtime.v1");

function isProcessRuntimeHolder(value: unknown): value is ReferenceWorkflowApiProcessRuntimeHolder {
  return value !== null
    && typeof value === "object"
    && "holderVersion" in value
    && value.holderVersion === "1.0"
    && "get" in value
    && typeof value.get === "function";
}

export function createReferenceWorkflowApiProcessRuntimeHolder(
  factory: () => ReferenceWorkflowApiProcessRuntime,
): ReferenceWorkflowApiProcessRuntimeHolder {
  let state: "empty" | "initializing" | "ready" = "empty";
  let runtime: ReferenceWorkflowApiProcessRuntime | undefined;
  return Object.freeze({
    holderVersion: "1.0" as const,
    get() {
      if (state === "ready" && runtime) return runtime;
      if (state === "initializing") throw new Error("reference-process-runtime-unavailable");
      state = "initializing";
      try {
        const created = factory();
        if (created.runtimeVersion !== "1.0" || created.initializedAtClass !== "process-lifecycle") {
          throw new Error("reference-process-runtime-unavailable");
        }
        runtime = Object.freeze(created);
        state = "ready";
        return runtime;
      } catch {
        runtime = undefined;
        state = "empty";
        throw new Error("reference-process-runtime-unavailable");
      }
    },
  });
}

function createCompleteRuntimeGraph(): ReferenceWorkflowApiProcessRuntime {
  const workflowRuntime = createReferenceWorkflowIntegrationRuntime();
  const apiFoundation = createReferenceWorkflowApiFoundation(workflowRuntime);
  const securityProvider = createReferenceWorkflowApiSecurityProvider();
  return Object.freeze({
    runtimeVersion: "1.0",
    initializedAtClass: "process-lifecycle",
    workflowRuntime,
    apiFoundation,
    securityProvider,
  });
}

function getProcessRuntimeHolder(): ReferenceWorkflowApiProcessRuntimeHolder {
  const existing = Object.getOwnPropertyDescriptor(globalThis, PROCESS_RUNTIME_SYMBOL)?.value;
  if (existing !== undefined) {
    if (!isProcessRuntimeHolder(existing)) throw new Error("reference-process-runtime-unavailable");
    return existing;
  }
  const holder = createReferenceWorkflowApiProcessRuntimeHolder(createCompleteRuntimeGraph);
  Object.defineProperty(globalThis, PROCESS_RUNTIME_SYMBOL, {
    value: holder,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  const committed = Object.getOwnPropertyDescriptor(globalThis, PROCESS_RUNTIME_SYMBOL)?.value;
  if (!isProcessRuntimeHolder(committed)) throw new Error("reference-process-runtime-unavailable");
  return committed;
}

export function getReferenceWorkflowApiProcessRuntime(): ReferenceWorkflowApiProcessRuntime {
  return getProcessRuntimeHolder().get();
}
