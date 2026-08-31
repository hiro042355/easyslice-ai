import { createReferenceWorkflowController } from "@/lib/workflowUi/referenceWorkflowController";
import { createReferenceWorkflowFixtureClient } from "@/lib/workflowUi/referenceWorkflowFixtureClient";
import { createReferenceWorkflowIdempotencyKeyFactory } from "@/lib/workflowUi/referenceWorkflowIdempotencyKeyFactory";
import { createReferenceWorkflowPollScheduler, REFERENCE_WORKFLOW_UI_POLL_POLICY } from "@/lib/workflowUi/referenceWorkflowPollScheduler";
import { createReferenceWorkflowInMemorySessionStore } from "@/lib/workflowUi/referenceWorkflowSessionStore";
import type { ReferenceWorkflowHookFixtureConfig } from "./referenceWorkflowHookTypes";
import { createReferenceWorkflowControllerHolder } from "./referenceWorkflowControllerHolder";
import { createReferenceWorkflowStaticEnvironment } from "./referenceWorkflowHookEnvironment";

export function createReferenceWorkflowHookFixture(config: ReferenceWorkflowHookFixtureConfig) {
  const safe = { operation: config.operation, scenario: config.scenario, clockMs: [...(config.clockMs ?? [0])], environment: { ...(config.environment ?? { online: true, visibility: "visible" as const }) }, autoRecover: config.autoRecover === true };
  const scheduler = createReferenceWorkflowPollScheduler(), store = createReferenceWorkflowInMemorySessionStore(); let index = 0;
  const current = () => safe.clockMs[Math.min(index++, safe.clockMs.length - 1)] ?? 0;
  const iso = (ms: number) => new Date(Math.max(0, ms)).toISOString();
  const environment = createReferenceWorkflowStaticEnvironment(safe.environment);
  const controllerHolder = createReferenceWorkflowControllerHolder({ createController: () => createReferenceWorkflowController({ apiClient: createReferenceWorkflowFixtureClient({ scenario: safe.scenario, operation: safe.operation }), pollScheduler: scheduler, sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory("hook-fixture"), clock: { nowMs: current, nowUtc: () => iso(current()), expiresAtUtc: ttl => iso(current() + ttl) }, sessionTtlMs: 1_800_000 }), environment });
  return Object.freeze({ operation: safe.operation, autoRecover: safe.autoRecover, dependencies: Object.freeze({ controllerHolder, timer: createManualTimerAdapter(), environment, pollScheduler: scheduler, pollPolicy: REFERENCE_WORKFLOW_UI_POLL_POLICY }) });
}
function createManualTimerAdapter() { let id = 0; const callbacks = new Map<number, () => void>(); return Object.freeze({ schedule(_delayMs: number, callback: () => void) { const handle = ++id; callbacks.set(handle, callback); return handle; }, cancel(handle: unknown) { callbacks.delete(handle as number); }, flushOne() { const first = callbacks.entries().next(); if (!first.done) { callbacks.delete(first.value[0]); first.value[1](); } } }); }
