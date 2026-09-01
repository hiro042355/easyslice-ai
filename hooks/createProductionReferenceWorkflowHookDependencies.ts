import { createReferenceWorkflowBrowserSessionStore } from "@/lib/workflowUi/referenceWorkflowBrowserSessionStore";
import { createReferenceWorkflowController } from "@/lib/workflowUi/referenceWorkflowController";
import type {
  WorkflowUiApiClient,
  WorkflowUiControllerDependencies,
  WorkflowUiOperation,
  WorkflowUiPollPolicy,
  WorkflowUiPollScheduler,
  WorkflowUiSessionStore,
} from "@/lib/workflowUi/types";
import { createReferenceWorkflowControllerHolder } from "./referenceWorkflowControllerHolder";
import type {
  ReferenceWorkflowHookDependencies,
  ReferenceWorkflowHookEnvironment,
  ReferenceWorkflowHookTimerAdapter,
} from "./referenceWorkflowHookTypes";

type BrowserStoragePort = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export type ProductionReferenceWorkflowAuthentication =
  | Readonly<{ status: "authenticated"; opaqueSessionPartition: string }>
  | Readonly<{ status: "anonymous" | "unavailable" }>;

export type ProductionReferenceWorkflowHookCompositionInput = Readonly<{
  operation: WorkflowUiOperation;
  authentication: ProductionReferenceWorkflowAuthentication;
  apiClient?: WorkflowUiApiClient;
  storage?: BrowserStoragePort;
  timer?: ReferenceWorkflowHookTimerAdapter;
  environment?: ReferenceWorkflowHookEnvironment;
  pollScheduler?: WorkflowUiPollScheduler;
  pollPolicy?: WorkflowUiPollPolicy;
  keyFactory?: WorkflowUiControllerDependencies["keyFactory"];
  clock?: WorkflowUiControllerDependencies["clock"];
  sessionTtlMs?: number;
}>;

export type ProductionReferenceWorkflowHookCompositionResult =
  | Readonly<{
      status: "ready";
      dependencies: ReferenceWorkflowHookDependencies;
      recoveryStore: WorkflowUiSessionStore;
    }>
  | Readonly<{
      status: "invalid";
      reason:
        | "authentication-required"
        | "partition-invalid"
        | "api-client-invalid"
        | "storage-invalid"
        | "runtime-dependency-invalid"
        | "configuration-invalid";
    }>;

const OPERATIONS = new Set<WorkflowUiOperation>(["generate-vocal", "generate-music", "generate-mv"]);
const API_METHODS = ["start", "pollUpload", "pollGeneration", "queryResult", "cancel"] as const;
const STORAGE_METHODS = ["getItem", "setItem", "removeItem"] as const;
const SCHEDULER_METHODS = ["schedule", "recordAttempt", "pause", "resume", "stop"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasMethods = (value: unknown, methods: readonly string[]) =>
  isRecord(value) && methods.every((method) => typeof value[method] === "function");

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

const validPartition = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 16 &&
  value.length <= 256 &&
  !/[\u0000-\u001f\u007f]/u.test(value);

const validAuthentication = (value: unknown): value is ProductionReferenceWorkflowAuthentication => {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "authenticated") {
    return hasExactKeys(value, ["status", "opaqueSessionPartition"]);
  }
  return (value.status === "anonymous" || value.status === "unavailable") && hasExactKeys(value, ["status"]);
};

const validPolicy = (value: unknown): value is WorkflowUiPollPolicy => {
  if (!isRecord(value) || value.policyVersion !== "1.0" || !isRecord(value.delaysMs)) return false;
  const numbers = [
    value.delaysMs.short,
    value.delaysMs.medium,
    value.delaysMs.long,
    value.maxAttempts,
    value.maxElapsedMs,
    value.maxConsecutiveNetworkFailures,
  ];
  return numbers.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0);
};

const validRuntime = (input: ProductionReferenceWorkflowHookCompositionInput) =>
  hasMethods(input.timer, ["schedule", "cancel"]) &&
  hasMethods(input.environment, ["getSnapshot", "subscribe"]) &&
  hasMethods(input.pollScheduler, SCHEDULER_METHODS) &&
  validPolicy(input.pollPolicy) &&
  hasMethods(input.keyFactory, ["next"]) &&
  hasMethods(input.clock, ["nowMs", "nowUtc", "expiresAtUtc"]) &&
  typeof input.sessionTtlMs === "number" &&
  Number.isSafeInteger(input.sessionTtlMs) &&
  input.sessionTtlMs > 0;

export function createProductionReferenceWorkflowHookDependencies(
  input: ProductionReferenceWorkflowHookCompositionInput,
): ProductionReferenceWorkflowHookCompositionResult {
  if (!isRecord(input) || !OPERATIONS.has(input.operation)) {
    return Object.freeze({ status: "invalid", reason: "configuration-invalid" });
  }
  if (!validAuthentication(input.authentication)) {
    return Object.freeze({ status: "invalid", reason: "configuration-invalid" });
  }
  if (input.authentication.status !== "authenticated") {
    return Object.freeze({ status: "invalid", reason: "authentication-required" });
  }
  if (!validPartition(input.authentication.opaqueSessionPartition)) {
    return Object.freeze({ status: "invalid", reason: "partition-invalid" });
  }
  if (!hasMethods(input.apiClient, API_METHODS)) {
    return Object.freeze({ status: "invalid", reason: "api-client-invalid" });
  }
  if (!hasMethods(input.storage, STORAGE_METHODS)) {
    return Object.freeze({ status: "invalid", reason: "storage-invalid" });
  }
  if (!validRuntime(input)) {
    return Object.freeze({ status: "invalid", reason: "runtime-dependency-invalid" });
  }

  const apiClient = input.apiClient as WorkflowUiApiClient;
  const storage = input.storage as BrowserStoragePort;
  const timer = input.timer as ReferenceWorkflowHookTimerAdapter;
  const environment = input.environment as ReferenceWorkflowHookEnvironment;
  const pollScheduler = input.pollScheduler as WorkflowUiPollScheduler;
  const pollPolicy = input.pollPolicy as WorkflowUiPollPolicy;
  const keyFactory = input.keyFactory as WorkflowUiControllerDependencies["keyFactory"];
  const clock = input.clock as WorkflowUiControllerDependencies["clock"];
  const sessionTtlMs = input.sessionTtlMs as number;

  const recoveryStore = createReferenceWorkflowBrowserSessionStore({
    storage,
    identityPartition: input.authentication.opaqueSessionPartition,
  });
  const controllerHolder = createReferenceWorkflowControllerHolder({
    createController: () => createReferenceWorkflowController({
      apiClient,
      pollScheduler,
      pollPolicy,
      sessionStore: recoveryStore,
      keyFactory,
      clock,
      sessionTtlMs,
    }),
    environment,
  });
  const dependencies = Object.freeze({ timer, environment, pollScheduler, pollPolicy, controllerHolder });
  return Object.freeze({ status: "ready", dependencies, recoveryStore });
}
