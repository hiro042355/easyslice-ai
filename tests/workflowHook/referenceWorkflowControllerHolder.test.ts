import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceWorkflowControllerHolder } from "@/hooks/referenceWorkflowControllerHolder";
import type { ReferenceWorkflowHookEnvironmentSnapshot } from "@/hooks/referenceWorkflowHookTypes";
import { createInitialWorkflowUiState } from "@/lib/workflowUi/workflowUiReducer";
import type { WorkflowUiController, WorkflowUiState } from "@/lib/workflowUi/types";

const OWNER = "reference-workflow-owner";
const startingState = (): WorkflowUiState => ({
  uiStateVersion: "1.0",
  kind: "starting",
  operation: "generate-mv",
  serverStatus: "none",
  activity: "requesting",
  activeCommand: "start",
  generation: 1,
  startIdentity: "allocated",
});
const pendingState = (
  kind: "pending-upload" | "pending-generation",
  options: { attempts?: number; elapsedMs?: number; failures?: number; status?: "ready" | "scheduled" | "paused" | "stopped"; retry?: boolean } = {},
): WorkflowUiState => ({
  uiStateVersion: "1.0",
  kind,
  operation: "generate-mv",
  serverStatus: kind,
  activity: options.status === "paused" || options.status === "stopped" ? "paused" : "waiting",
  activeCommand: "none",
  generation: 1,
  reference: { referenceVersion: "1.0", kind: kind === "pending-upload" ? "upload-pending" : "generation-job", reference: "opaque-reference" },
  poll: {
    pollVersion: "1.0",
    budget: { attempts: options.attempts ?? 2, elapsedMs: options.elapsedMs ?? 4_000, consecutiveNetworkFailures: options.failures ?? 1 },
    lastRetryClass: "medium",
    status: options.status ?? "scheduled",
  },
  ...(options.retry === false ? {} : { retryAdvice: { retryVersion: "1.0" as const, retryable: true, retryAfterClass: "medium" as const } }),
} as WorkflowUiState);

function createControllerDouble(options: { getStateThrows?: boolean; subscribeThrows?: boolean; disposeThrows?: boolean; emitDuringSubscribe?: WorkflowUiState; commandTransitions?: boolean } = {}) {
  let state = createInitialWorkflowUiState();
  let listener: ((state: WorkflowUiState) => void) | undefined;
  const counts = { subscribe: 0, unsubscribe: 0, dispose: 0, start: 0, pollUpload: 0, pollGeneration: 0, queryResult: 0, cancel: 0, recover: 0, reset: 0, pause: 0, resume: 0 };
  const completed = () => ({ status: "completed" as const, state });
  const transition = (nextState: WorkflowUiState) => { state = nextState; listener?.(nextState); };
  const controller: WorkflowUiController = {
    start: async () => { counts.start += 1; if (options.commandTransitions) transition(pendingState("pending-upload")); return completed(); },
    pollUpload: async () => { counts.pollUpload += 1; return completed(); },
    pollGeneration: async () => { counts.pollGeneration += 1; return completed(); },
    queryResult: async () => { counts.queryResult += 1; return completed(); },
    cancel: async () => { counts.cancel += 1; if (options.commandTransitions) transition(createInitialWorkflowUiState()); return completed(); },
    pausePolling: () => { counts.pause += 1; return completed(); },
    resumePolling: async () => { counts.resume += 1; return completed(); },
    recover: async () => { counts.recover += 1; return completed(); },
    reset: () => { counts.reset += 1; if (options.commandTransitions) transition(createInitialWorkflowUiState()); return completed(); },
    getState() {
      if (options.getStateThrows) throw new Error("private controller failure");
      return state;
    },
    subscribe(nextListener) {
      counts.subscribe += 1;
      if (options.subscribeThrows) throw new Error("private subscription failure");
      listener = nextListener;
      if (options.emitDuringSubscribe) {
        state = options.emitDuringSubscribe;
        nextListener(state);
      }
      return () => {
        counts.unsubscribe += 1;
        listener = undefined;
      };
    },
    dispose() {
      counts.dispose += 1;
      if (options.disposeThrows) throw new Error("private disposal failure");
    },
  };
  return {
    controller,
    counts,
    emit(nextState: WorkflowUiState) {
      state = nextState;
      listener?.(nextState);
    },
  };
}

function createEnvironmentDouble(options: { getSnapshotThrows?: boolean; subscribeThrows?: boolean } = {}) {
  let snapshot: ReferenceWorkflowHookEnvironmentSnapshot = { online: true, visibility: "visible" };
  let listener: (() => void) | undefined;
  const counts = { getSnapshot: 0, subscribe: 0, unsubscribe: 0 };
  return {
    environment: {
      getSnapshot() {
        counts.getSnapshot += 1;
        if (options.getSnapshotThrows) throw new Error("private environment failure");
        return snapshot;
      },
      subscribe(nextListener: () => void) {
        counts.subscribe += 1;
        if (options.subscribeThrows) throw new Error("private subscription failure");
        listener = nextListener;
        return () => {
          counts.unsubscribe += 1;
          listener = undefined;
        };
      },
    },
    counts,
    emit(nextSnapshot: ReferenceWorkflowHookEnvironmentSnapshot) {
      snapshot = nextSnapshot;
      listener?.();
    },
  };
}

function createDeferredFinalizer() {
  const callbacks: Array<() => void> = [];
  return { defer: (callback: () => void) => callbacks.push(callback), flush: () => callbacks.splice(0).forEach((callback) => callback()) };
}

test("construction is dormant, frozen, server-safe, and externally inert", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  let constructions = 0, finalizations = 0;
  const holder = createReferenceWorkflowControllerHolder({
    createController: () => { constructions += 1; return controller.controller; },
    environment: environment.environment,
    deferFinalization: () => { finalizations += 1; },
  });
  assert.equal(holder.getStatus(), "dormant");
  assert.equal(constructions, 0);
  assert.deepEqual(environment.counts, { getSnapshot: 0, subscribe: 0, unsubscribe: 0 });
  assert.equal(controller.counts.subscribe, 0);
  assert.equal(finalizations, 0);
  assert.equal(holder.getSnapshot(), holder.getServerSnapshot());
  assert.equal(holder.getSnapshot().displayStatus, "idle");
  assert.equal(Object.isFrozen(holder), true);
  assert.equal(Object.isFrozen(holder.getSnapshot()), true);
});

test("subscribe is dormant, stable, and its cleanup is exact and idempotent", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  let calls = 0;
  const cleanup = holder.subscribe(() => { calls += 1; });
  cleanup();
  cleanup();
  assert.equal(calls, 0);
  assert.equal(holder.getStatus(), "dormant");
  assert.equal(controller.counts.subscribe, 0);
  assert.equal(environment.counts.subscribe, 0);
});

test("first owner activates exactly one controller and both subscriptions", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  let constructions = 0;
  const holder = createReferenceWorkflowControllerHolder({ createController: () => { constructions += 1; return controller.controller; }, environment: environment.environment });
  assert.deepEqual(holder.acquire(OWNER), { status: "activated" });
  assert.equal(holder.getStatus(), "active");
  assert.equal(constructions, 1);
  assert.equal(controller.counts.subscribe, 1);
  assert.equal(environment.counts.subscribe, 1);
});

test("activation closes a controller-subscription race before publishing active state", () => {
  const controller = createControllerDouble({ emitDuringSubscribe: startingState() }), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  let notifications = 0;
  holder.subscribe(() => { notifications += 1; });
  assert.deepEqual(holder.acquire(OWNER), { status: "activated" });
  assert.equal(holder.getSnapshot().displayStatus, "starting");
  assert.equal(notifications, 1);
});

test("same owner reuses while a different owner and invalid owner are rejected", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  let constructions = 0;
  const holder = createReferenceWorkflowControllerHolder({ createController: () => { constructions += 1; return controller.controller; }, environment: environment.environment });
  assert.deepEqual(holder.acquire(""), { status: "rejected", reason: "invalid-owner" });
  assert.deepEqual(holder.acquire(OWNER), { status: "activated" });
  assert.deepEqual(holder.acquire(OWNER), { status: "reused" });
  assert.deepEqual(holder.acquire("different-owner"), { status: "rejected", reason: "owner-conflict" });
  assert.equal(constructions, 1);
});

test("commands reject while dormant without constructing or activating", async () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  let constructions = 0;
  const holder = createReferenceWorkflowControllerHolder({ createController: () => { constructions += 1; return controller.controller; }, environment: environment.environment });
  assert.deepEqual(await holder.start(OWNER, { operation: "generate-mv", request: {} as never }), { status: "rejected", reason: "not-active" });
  assert.deepEqual(await holder.pollUpload(OWNER), { status: "rejected", reason: "not-active" });
  assert.deepEqual(holder.reset(OWNER), { status: "rejected", reason: "not-active" });
  assert.equal(constructions, 0);
  assert.equal(holder.getStatus(), "dormant");
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "rejected", reason: "not-active" });
  assert.equal(constructions, 0);
});

test("commands reject while activation is in progress", async () => {
  const controller = createControllerDouble();
  const bridge: { invoke?: () => ReturnType<ReturnType<typeof createReferenceWorkflowControllerHolder>["start"]> } = {};
  let duringActivation: ReturnType<ReturnType<typeof createReferenceWorkflowControllerHolder>["start"]> | undefined;
  const environment = {
    getSnapshot() {
      if (!bridge.invoke) throw new Error("test bridge unavailable");
      duringActivation ??= bridge.invoke();
      assert.deepEqual(holder.getPollingContext(OWNER), { status: "rejected", reason: "not-active" });
      return { online: true, visibility: "visible" as const };
    },
    subscribe() { return () => {}; },
  };
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment });
  bridge.invoke = () => holder.start(OWNER, { operation: "generate-mv", request: {} as never });
  assert.deepEqual(holder.acquire(OWNER), { status: "activated" });
  assert.deepEqual(await duringActivation, { status: "rejected", reason: "not-active" });
  assert.equal(controller.counts.start, 0);
});

test("active polling projection distinguishes no-poll from lifecycle rejection", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "available", context: { kind: "none" } });
  assert.deepEqual(holder.getPollingContext("wrong-owner"), { status: "rejected", reason: "not-owner" });
  assert.equal(controller.counts.start + controller.counts.pollUpload + controller.counts.pollGeneration + controller.counts.queryResult + controller.counts.cancel + controller.counts.recover + controller.counts.reset, 0);
});

test("upload and generation contexts preserve exact polling and retry semantics", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  for (const kind of ["pending-upload", "pending-generation"] as const) {
    controller.emit(pendingState(kind, { attempts: 7, elapsedMs: 12_345, failures: 2 }));
    const result = holder.getPollingContext(OWNER);
    assert.equal(result.status, "available");
    if (result.status !== "available" || result.context.kind === "none") continue;
    assert.equal(result.context.kind, kind);
    assert.deepEqual(result.context.poll, { pollVersion: "1.0", budget: { attempts: 7, elapsedMs: 12_345, consecutiveNetworkFailures: 2 }, lastRetryClass: "medium", status: "scheduled" });
    assert.deepEqual(result.context.retryAdvice, { retryVersion: "1.0", retryable: true, retryAfterClass: "medium" });
  }
});

test("polling projection is recursively frozen, freshly copied, and mutation-isolated", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  controller.emit(pendingState("pending-upload"));
  const first = holder.getPollingContext(OWNER), second = holder.getPollingContext(OWNER);
  assert.equal(first.status, "available");
  assert.equal(second.status, "available");
  if (first.status !== "available" || second.status !== "available" || first.context.kind === "none" || second.context.kind === "none") return;
  const firstContext = first.context, secondContext = second.context;
  assert.notEqual(firstContext, secondContext);
  assert.notEqual(firstContext.poll, secondContext.poll);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(firstContext), true);
  assert.equal(Object.isFrozen(firstContext.poll), true);
  assert.equal(Object.isFrozen(firstContext.poll.budget), true);
  assert.equal(Object.isFrozen(firstContext.retryAdvice), true);
  assert.throws(() => { firstContext.poll.budget.attempts = 999; }, TypeError);
  assert.throws(() => { if (firstContext.retryAdvice) firstContext.retryAdvice.retryable = false; }, TypeError);
  assert.equal(secondContext.poll.budget.attempts, 2);
  assert.equal(secondContext.retryAdvice?.retryable, true);
});

test("paused exhausted context and absent retry advice remain exact", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  controller.emit(pendingState("pending-generation", { attempts: 40, elapsedMs: 1_200_000, failures: 3, status: "paused", retry: false }));
  const result = holder.getPollingContext(OWNER);
  assert.equal(result.status, "available");
  if (result.status !== "available" || result.context.kind === "none") return;
  assert.deepEqual(result.context.poll.budget, { attempts: 40, elapsedMs: 1_200_000, consecutiveNetworkFailures: 3 });
  assert.equal(result.context.poll.status, "paused");
  assert.equal("retryAdvice" in result.context, false);
});

test("gateway command transitions update polling context without granting scheduling authority", async () => {
  const controller = createControllerDouble({ commandTransitions: true }), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  assert.equal((await holder.start(OWNER, { operation: "generate-mv", request: {} as never })).status, "executed");
  const afterStart = holder.getPollingContext(OWNER);
  assert.equal(afterStart.status === "available" && afterStart.context.kind, "pending-upload");
  assert.equal((await holder.cancel(OWNER)).status, "executed");
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "available", context: { kind: "none" } });
  assert.equal((await holder.start(OWNER, { operation: "generate-mv", request: {} as never })).status, "executed");
  assert.equal(holder.reset(OWNER).status, "executed");
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "available", context: { kind: "none" } });
});

test("active matching owner reaches every named command exactly once and reset stays synchronous", async () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  holder.acquire(OWNER);
  assert.equal((await holder.start(OWNER, { operation: "generate-mv", request: {} as never })).status, "executed");
  assert.equal((await holder.pollUpload(OWNER)).status, "executed");
  assert.equal((await holder.pollGeneration(OWNER)).status, "executed");
  assert.equal((await holder.queryResult(OWNER)).status, "executed");
  assert.equal((await holder.cancel(OWNER)).status, "executed");
  assert.equal((await holder.recover(OWNER)).status, "executed");
  const reset = holder.reset(OWNER);
  assert.equal(reset.status, "executed");
  assert.deepEqual({ start: controller.counts.start, pollUpload: controller.counts.pollUpload, pollGeneration: controller.counts.pollGeneration, queryResult: controller.counts.queryResult, cancel: controller.counts.cancel, recover: controller.counts.recover, reset: controller.counts.reset }, { start: 1, pollUpload: 1, pollGeneration: 1, queryResult: 1, cancel: 1, recover: 1, reset: 1 });
});

test("wrong owner and release-pending commands reject without Controller invocation", async () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  holder.acquire(OWNER);
  assert.deepEqual(await holder.start("wrong-owner", { operation: "generate-mv", request: {} as never }), { status: "rejected", reason: "not-owner" });
  holder.release(OWNER);
  assert.deepEqual(await holder.start(OWNER, { operation: "generate-mv", request: {} as never }), { status: "rejected", reason: "not-active" });
  assert.equal(controller.counts.start, 0);
});

test("an admitted async command may settle after final release without a lease or retry", async () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  holder.acquire(OWNER);
  const command = holder.start(OWNER, { operation: "generate-mv", request: {} as never });
  holder.release(OWNER);
  deferred.flush();
  assert.equal((await command).status, "executed");
  assert.equal(controller.counts.start, 1);
  assert.equal(controller.counts.dispose, 1);
  assert.equal(holder.getStatus(), "released");
});

test("controller and environment updates publish only meaningful frozen snapshots", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment });
  let notifications = 0;
  holder.subscribe(() => { notifications += 1; });
  holder.acquire(OWNER);
  assert.equal(notifications, 0);
  const idle = holder.getSnapshot();
  controller.emit(createInitialWorkflowUiState());
  assert.equal(holder.getSnapshot(), idle);
  assert.equal(notifications, 0);
  controller.emit(startingState());
  const starting = holder.getSnapshot();
  assert.notEqual(starting, idle);
  assert.equal(starting.displayStatus, "starting");
  assert.equal(notifications, 1);
  environment.emit({ online: false, visibility: "visible" });
  assert.equal(holder.getSnapshot().online, false);
  assert.equal(notifications, 2);
  environment.emit({ online: false, visibility: "visible" });
  assert.equal(notifications, 2);
  assert.equal(Object.isFrozen(holder.getSnapshot()), true);
});

test("release defers final disposal and same-owner reacquire cancels stale cleanup", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  holder.acquire(OWNER);
  assert.deepEqual(holder.release(OWNER), { status: "release-pending" });
  assert.equal(holder.getStatus(), "release-pending");
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "rejected", reason: "not-active" });
  assert.equal(controller.counts.dispose, 0);
  assert.deepEqual(holder.acquire(OWNER), { status: "reused" });
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "available", context: { kind: "none" } });
  deferred.flush();
  assert.equal(holder.getStatus(), "active");
  assert.equal(controller.counts.dispose, 0);
  assert.equal(controller.counts.unsubscribe, 0);
  assert.equal(environment.counts.unsubscribe, 0);
});

test("final release unsubscribes and disposes exactly once even when cleanup is repeated", () => {
  const controller = createControllerDouble({ disposeThrows: true }), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  holder.acquire(OWNER);
  holder.release(OWNER);
  assert.deepEqual(holder.release(OWNER), { status: "ignored", reason: "not-active" });
  deferred.flush();
  deferred.flush();
  assert.equal(holder.getStatus(), "released");
  assert.equal(controller.counts.dispose, 1);
  assert.equal(controller.counts.unsubscribe, 1);
  assert.equal(environment.counts.unsubscribe, 1);
  assert.deepEqual(holder.acquire(OWNER), { status: "rejected", reason: "released" });
  assert.deepEqual(holder.reset(OWNER), { status: "rejected", reason: "released" });
  assert.deepEqual(holder.getPollingContext(OWNER), { status: "rejected", reason: "released" });
});

test("wrong-owner release cannot affect the active lifecycle", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  holder.acquire(OWNER);
  assert.deepEqual(holder.release("different-owner"), { status: "ignored", reason: "not-owner" });
  deferred.flush();
  assert.equal(holder.getStatus(), "active");
  assert.equal(controller.counts.dispose, 0);
});

test("abandoned-render-equivalent construction creates no controller or subscriptions", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble();
  let constructions = 0;
  createReferenceWorkflowControllerHolder({
    createController: () => { constructions += 1; return controller.controller; },
    environment: environment.environment,
  });
  assert.equal(constructions, 0);
  assert.equal(controller.counts.subscribe, 0);
  assert.equal(environment.counts.subscribe, 0);
});

test("Strict-Mode-equivalent acquire-release-reacquire cycle preserves one controller", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  let constructions = 0;
  const holder = createReferenceWorkflowControllerHolder({
    createController: () => { constructions += 1; return controller.controller; },
    environment: environment.environment,
    deferFinalization: deferred.defer,
  });
  holder.acquire(OWNER);
  holder.release(OWNER);
  holder.acquire(OWNER);
  deferred.flush();
  assert.equal(constructions, 1);
  assert.equal(controller.counts.subscribe, 1);
  assert.equal(environment.counts.subscribe, 1);
  assert.equal(controller.counts.dispose, 0);
});

test("multiple Holders isolate controller, subscription, snapshot, and disposal ownership", () => {
  const firstController = createControllerDouble(), secondController = createControllerDouble();
  const firstEnvironment = createEnvironmentDouble(), secondEnvironment = createEnvironmentDouble();
  const firstDeferred = createDeferredFinalizer(), secondDeferred = createDeferredFinalizer();
  const first = createReferenceWorkflowControllerHolder({ createController: () => firstController.controller, environment: firstEnvironment.environment, deferFinalization: firstDeferred.defer });
  const second = createReferenceWorkflowControllerHolder({ createController: () => secondController.controller, environment: secondEnvironment.environment, deferFinalization: secondDeferred.defer });
  first.acquire("first-owner");
  second.acquire("second-owner");
  firstController.emit(pendingState("pending-upload", { attempts: 3 }));
  secondController.emit(pendingState("pending-generation", { attempts: 9 }));
  assert.equal(first.getSnapshot().displayStatus, "pending-upload");
  const firstPolling = first.getPollingContext("first-owner"), secondPolling = second.getPollingContext("second-owner");
  assert.equal(firstPolling.status === "available" && firstPolling.context.kind, "pending-upload");
  assert.equal(secondPolling.status === "available" && secondPolling.context.kind, "pending-generation");
  if (firstPolling.status === "available" && firstPolling.context.kind !== "none" && secondPolling.status === "available" && secondPolling.context.kind !== "none") {
    assert.equal(firstPolling.context.poll.budget.attempts, 3);
    assert.equal(secondPolling.context.poll.budget.attempts, 9);
  }
  assert.equal(second.getSnapshot().displayStatus, "pending-generation");
  first.release("first-owner");
  firstDeferred.flush();
  assert.equal(firstController.counts.dispose, 1);
  assert.equal(secondController.counts.dispose, 0);
  assert.equal(second.getStatus(), "active");
});

test("environment transitions coordinate private pause and resume only while active", () => {
  const controller = createControllerDouble(), environment = createEnvironmentDouble(), deferred = createDeferredFinalizer();
  const holder = createReferenceWorkflowControllerHolder({ createController: () => controller.controller, environment: environment.environment, deferFinalization: deferred.defer });
  environment.emit({ online: false, visibility: "hidden" });
  assert.deepEqual({ pause: controller.counts.pause, resume: controller.counts.resume }, { pause: 0, resume: 0 });
  holder.acquire(OWNER);
  assert.deepEqual({ pause: controller.counts.pause, resume: controller.counts.resume }, { pause: 2, resume: 0 });
  environment.emit({ online: true, visibility: "visible" });
  assert.deepEqual({ pause: controller.counts.pause, resume: controller.counts.resume }, { pause: 2, resume: 2 });
  holder.release(OWNER);
  deferred.flush();
  environment.emit({ online: false, visibility: "hidden" });
  assert.deepEqual({ pause: controller.counts.pause, resume: controller.counts.resume }, { pause: 2, resume: 2 });
  assert.equal(environment.counts.unsubscribe, 1);
});

for (const scenario of [
  { name: "controller construction", expected: "controller-construction" as const, controllerOptions: {}, environmentOptions: {}, constructThrows: true },
  { name: "initial environment read", expected: "initial-environment-read" as const, controllerOptions: {}, environmentOptions: { getSnapshotThrows: true } },
  { name: "initial controller read", expected: "initial-controller-read" as const, controllerOptions: { getStateThrows: true }, environmentOptions: {} },
  { name: "controller subscription", expected: "controller-subscription" as const, controllerOptions: { subscribeThrows: true }, environmentOptions: {} },
  { name: "environment subscription", expected: "environment-subscription" as const, controllerOptions: {}, environmentOptions: { subscribeThrows: true } },
] as const) {
  test(`activation failure at ${scenario.name} rolls back and becomes terminal`, async () => {
    const controller = createControllerDouble(scenario.controllerOptions), environment = createEnvironmentDouble(scenario.environmentOptions);
    const holder = createReferenceWorkflowControllerHolder({
      createController: () => {
        if (scenario.constructThrows) throw new Error("private construction failure");
        return controller.controller;
      },
      environment: environment.environment,
    });
    assert.deepEqual(holder.acquire(OWNER), { status: "activation-failed", failure: scenario.expected });
    assert.equal(holder.getStatus(), "activation-failed");
    assert.equal(holder.getSnapshot().displayStatus, "idle");
    assert.deepEqual(holder.acquire(OWNER), { status: "rejected", reason: "activation-failed" });
    assert.equal(controller.counts.dispose, scenario.constructThrows ? 0 : 1);
    assert.deepEqual(await holder.start(OWNER, { operation: "generate-mv", request: {} as never }), { status: "rejected", reason: "activation-failed" });
    assert.deepEqual(holder.getPollingContext(OWNER), { status: "rejected", reason: "activation-failed" });
  });
}
