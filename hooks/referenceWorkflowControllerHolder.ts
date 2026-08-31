import { createInitialWorkflowUiState } from "@/lib/workflowUi/workflowUiReducer";
import type { WorkflowRetryAdviceDTO } from "@/lib/workflowApi/types";
import type { WorkflowUiController, WorkflowUiControllerInput, WorkflowUiControllerResult, WorkflowUiPollState, WorkflowUiState } from "@/lib/workflowUi/types";
import type {
  ReferenceWorkflowHookEnvironment,
  ReferenceWorkflowHookEnvironmentSnapshot,
  ReferenceWorkflowHookViewState,
} from "./referenceWorkflowHookTypes";
import {
  createReferenceWorkflowHookView,
  createReferenceWorkflowSemanticSnapshotCache,
} from "./referenceWorkflowHookUtils";

export type ReferenceWorkflowControllerOwnerToken = string;
export type ReferenceWorkflowControllerHolderStatus =
  | "dormant"
  | "activating"
  | "active"
  | "release-pending"
  | "released"
  | "activation-failed";
export type ReferenceWorkflowControllerActivationFailure =
  | "controller-construction"
  | "initial-environment-read"
  | "initial-controller-read"
  | "initial-projection"
  | "controller-subscription"
  | "environment-subscription"
  | "race-closing-read";
export type ReferenceWorkflowControllerAcquireResult =
  | { status: "activated" | "reused" }
  | { status: "rejected"; reason: "invalid-owner" | "owner-conflict" | "released" | "activation-failed" }
  | { status: "activation-failed"; failure: ReferenceWorkflowControllerActivationFailure };
export type ReferenceWorkflowControllerReleaseResult =
  | { status: "release-pending" }
  | { status: "ignored"; reason: "invalid-owner" | "not-owner" | "not-active" };
export type ReferenceWorkflowControllerCommandRejection = {
  status: "rejected";
  reason: "not-active" | "not-owner" | "released" | "activation-failed";
};
export type ReferenceWorkflowControllerCommandExecution = { status: "executed"; result: WorkflowUiControllerResult };
export type ReferenceWorkflowControllerCommandResult = ReferenceWorkflowControllerCommandExecution | ReferenceWorkflowControllerCommandRejection;
export type ReferenceWorkflowPollingContext =
  | { kind: "none" }
  | { kind: "pending-upload" | "pending-generation"; poll: WorkflowUiPollState; retryAdvice?: WorkflowRetryAdviceDTO };
export type ReferenceWorkflowPollingContextResult =
  | { status: "available"; context: ReferenceWorkflowPollingContext }
  | ReferenceWorkflowControllerCommandRejection;

export type ReferenceWorkflowControllerHolderInput = {
  createController(): WorkflowUiController;
  environment: ReferenceWorkflowHookEnvironment;
  deferFinalization?(callback: () => void): void;
};

export type ReferenceWorkflowControllerHolder = {
  acquire(owner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerAcquireResult;
  release(owner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerReleaseResult;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReferenceWorkflowHookViewState;
  getServerSnapshot(): ReferenceWorkflowHookViewState;
  getStatus(): ReferenceWorkflowControllerHolderStatus;
  start(owner: ReferenceWorkflowControllerOwnerToken, input: WorkflowUiControllerInput): Promise<ReferenceWorkflowControllerCommandResult>;
  pollUpload(owner: ReferenceWorkflowControllerOwnerToken): Promise<ReferenceWorkflowControllerCommandResult>;
  pollGeneration(owner: ReferenceWorkflowControllerOwnerToken): Promise<ReferenceWorkflowControllerCommandResult>;
  queryResult(owner: ReferenceWorkflowControllerOwnerToken): Promise<ReferenceWorkflowControllerCommandResult>;
  cancel(owner: ReferenceWorkflowControllerOwnerToken): Promise<ReferenceWorkflowControllerCommandResult>;
  recover(owner: ReferenceWorkflowControllerOwnerToken): Promise<ReferenceWorkflowControllerCommandResult>;
  reset(owner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerCommandResult;
  getPollingContext(owner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowPollingContextResult;
};

const IDLE_ENVIRONMENT = Object.freeze<ReferenceWorkflowHookEnvironmentSnapshot>({
  online: true,
  visibility: "visible",
});
const isOwnerToken = (owner: string): boolean => owner.trim().length > 0;
const defaultDeferFinalization = (callback: () => void): void => queueMicrotask(callback);
const safely = (callback: (() => void) | undefined): void => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Cleanup is best-effort, but every remaining cleanup boundary still runs.
  }
};

export function createReferenceWorkflowControllerHolder(
  input: ReferenceWorkflowControllerHolderInput,
): ReferenceWorkflowControllerHolder {
  const idleState = createInitialWorkflowUiState();
  const cache = createReferenceWorkflowSemanticSnapshotCache(idleState, IDLE_ENVIRONMENT);
  const subscribers = new Set<() => void>();
  const deferFinalization = input.deferFinalization ?? defaultDeferFinalization;
  let status: ReferenceWorkflowControllerHolderStatus = "dormant";
  let owner: ReferenceWorkflowControllerOwnerToken | undefined;
  let controller: WorkflowUiController | undefined;
  let controllerUnsubscribe: (() => void) | undefined;
  let environmentUnsubscribe: (() => void) | undefined;
  let environment = IDLE_ENVIRONMENT;
  let releaseGeneration = 0;

  const notify = (): void => {
    for (const listener of [...subscribers]) safely(listener);
  };
  const commandRejection = (commandOwner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerCommandRejection | undefined => {
    if (status === "released") return { status: "rejected", reason: "released" };
    if (status === "activation-failed") return { status: "rejected", reason: "activation-failed" };
    if (owner !== undefined && owner !== commandOwner) return { status: "rejected", reason: "not-owner" };
    if (status !== "active" || !controller) return { status: "rejected", reason: "not-active" };
    return undefined;
  };
  const executeAsync = async (
    commandOwner: ReferenceWorkflowControllerOwnerToken,
    command: (activeController: WorkflowUiController) => Promise<WorkflowUiControllerResult>,
  ): Promise<ReferenceWorkflowControllerCommandResult> => {
    const rejection = commandRejection(commandOwner);
    if (rejection) return rejection;
    return { status: "executed", result: await command(controller as WorkflowUiController) };
  };
  const update = (state: WorkflowUiState, nextEnvironment: ReferenceWorkflowHookEnvironmentSnapshot): void => {
    const previous = cache.getSnapshot();
    const next = cache.update(state, nextEnvironment);
    if (status === "active" && next !== previous) notify();
  };
  const rollback = (): void => {
    safely(environmentUnsubscribe);
    safely(controllerUnsubscribe);
    safely(controller?.dispose.bind(controller));
    environmentUnsubscribe = undefined;
    controllerUnsubscribe = undefined;
    controller = undefined;
    owner = undefined;
    environment = IDLE_ENVIRONMENT;
    cache.update(idleState, IDLE_ENVIRONMENT);
    status = "activation-failed";
  };
  const fail = (failure: ReferenceWorkflowControllerActivationFailure): ReferenceWorkflowControllerAcquireResult => {
    rollback();
    return { status: "activation-failed", failure };
  };

  const acquire = (nextOwner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerAcquireResult => {
    if (!isOwnerToken(nextOwner)) return { status: "rejected", reason: "invalid-owner" };
    if (status === "released") return { status: "rejected", reason: "released" };
    if (status === "activation-failed") return { status: "rejected", reason: "activation-failed" };
    if (owner !== undefined && owner !== nextOwner) return { status: "rejected", reason: "owner-conflict" };
    if (status === "active") return { status: "reused" };
    if (status === "release-pending") {
      releaseGeneration += 1;
      status = "active";
      return { status: "reused" };
    }

    status = "activating";
    owner = nextOwner;
    const dormantSnapshot = cache.getSnapshot();
    try {
      controller = input.createController();
    } catch {
      return fail("controller-construction");
    }
    try {
      environment = input.environment.getSnapshot();
    } catch {
      return fail("initial-environment-read");
    }
    let initialState: WorkflowUiState;
    try {
      initialState = controller.getState();
    } catch {
      return fail("initial-controller-read");
    }
    try {
      createReferenceWorkflowHookView(initialState, environment);
      cache.update(initialState, environment);
    } catch {
      return fail("initial-projection");
    }
    try {
      controllerUnsubscribe = controller.subscribe((state) => update(state, environment));
    } catch {
      return fail("controller-subscription");
    }
    try {
      environmentUnsubscribe = input.environment.subscribe(() => {
        try {
          const previousEnvironment = environment;
          const nextEnvironment = input.environment.getSnapshot();
          environment = nextEnvironment;
          if (!controller) return;
          if (nextEnvironment.online !== previousEnvironment.online) {
            if (nextEnvironment.online) void controller.resumePolling("online");
            else controller.pausePolling("offline");
          }
          if (nextEnvironment.visibility !== previousEnvironment.visibility) {
            if (nextEnvironment.visibility === "visible") void controller.resumePolling("visible");
            else controller.pausePolling("hidden");
          }
          update(controller.getState(), nextEnvironment);
        } catch {
          // A malformed environment notification cannot expose or replace ownership.
        }
      });
    } catch {
      return fail("environment-subscription");
    }
    try {
      environment = input.environment.getSnapshot();
      if (!environment.online) controller.pausePolling("offline");
      if (environment.visibility === "hidden") controller.pausePolling("hidden");
      update(controller.getState(), environment);
    } catch {
      return fail("race-closing-read");
    }
    status = "active";
    if (cache.getSnapshot() !== dormantSnapshot) notify();
    return { status: "activated" };
  };

  const finalize = (scheduledOwner: ReferenceWorkflowControllerOwnerToken, generation: number): void => {
    if (status !== "release-pending" || owner !== scheduledOwner || releaseGeneration !== generation) return;
    status = "released";
    safely(environmentUnsubscribe);
    safely(controllerUnsubscribe);
    safely(controller?.dispose.bind(controller));
    environmentUnsubscribe = undefined;
    controllerUnsubscribe = undefined;
    controller = undefined;
    owner = undefined;
  };
  const release = (releasingOwner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerReleaseResult => {
    if (!isOwnerToken(releasingOwner)) return { status: "ignored", reason: "invalid-owner" };
    if (owner !== releasingOwner) return { status: "ignored", reason: "not-owner" };
    if (status !== "active") return { status: "ignored", reason: "not-active" };
    status = "release-pending";
    const generation = ++releaseGeneration;
    deferFinalization(() => finalize(releasingOwner, generation));
    return { status: "release-pending" };
  };
  const subscribe = (listener: () => void): (() => void) => {
    subscribers.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(listener);
    };
  };
  const start = (commandOwner: ReferenceWorkflowControllerOwnerToken, commandInput: WorkflowUiControllerInput) => executeAsync(commandOwner, (activeController) => activeController.start(commandInput));
  const pollUpload = (commandOwner: ReferenceWorkflowControllerOwnerToken) => executeAsync(commandOwner, (activeController) => activeController.pollUpload());
  const pollGeneration = (commandOwner: ReferenceWorkflowControllerOwnerToken) => executeAsync(commandOwner, (activeController) => activeController.pollGeneration());
  const queryResult = (commandOwner: ReferenceWorkflowControllerOwnerToken) => executeAsync(commandOwner, (activeController) => activeController.queryResult());
  const cancel = (commandOwner: ReferenceWorkflowControllerOwnerToken) => executeAsync(commandOwner, (activeController) => activeController.cancel());
  const recover = (commandOwner: ReferenceWorkflowControllerOwnerToken) => executeAsync(commandOwner, (activeController) => activeController.recover());
  const reset = (commandOwner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowControllerCommandResult => {
    const rejection = commandRejection(commandOwner);
    if (rejection) return rejection;
    return { status: "executed", result: (controller as WorkflowUiController).reset() };
  };
  const getPollingContext = (commandOwner: ReferenceWorkflowControllerOwnerToken): ReferenceWorkflowPollingContextResult => {
    const rejection = commandRejection(commandOwner);
    if (rejection) return rejection;
    const state = (controller as WorkflowUiController).getState();
    if (state.kind !== "pending-upload" && state.kind !== "pending-generation") {
      return Object.freeze({ status: "available", context: Object.freeze({ kind: "none" }) });
    }
    const poll = Object.freeze({
      ...state.poll,
      budget: Object.freeze({ ...state.poll.budget }),
    });
    const retryAdvice = state.retryAdvice === undefined ? undefined : Object.freeze({ ...state.retryAdvice });
    const context = Object.freeze({ kind: state.kind, poll, ...(retryAdvice === undefined ? {} : { retryAdvice }) });
    return Object.freeze({ status: "available", context });
  };

  return Object.freeze({
    acquire,
    release,
    subscribe,
    getSnapshot: cache.getSnapshot,
    getServerSnapshot: cache.getSnapshot,
    getStatus: () => status,
    start,
    pollUpload,
    pollGeneration,
    queryResult,
    cancel,
    recover,
    reset,
    getPollingContext,
  });
}
