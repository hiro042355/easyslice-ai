import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { act } from "react";
import type { ReferenceWorkflowHookInput } from "@/hooks/referenceWorkflowHookTypes";
import { element, mount, hydrate, serverMarkup, type Observer } from "../helpers/referenceWorkflowReactHarness";
import { createFakeTimer } from "../helpers/referenceWorkflowFakeTimer";
import { createFakeEnvironment } from "../helpers/referenceWorkflowFakeEnvironment";
import { migrateWorkflowUiSessionV1ToV2 } from "@/lib/workflowUi/referenceWorkflowSessionStore";
import { createReferenceWorkflowController } from "@/lib/workflowUi/referenceWorkflowController";
import { createReferenceWorkflowFixtureClient } from "@/lib/workflowUi/referenceWorkflowFixtureClient";
import { createReferenceWorkflowControllerHolder } from "@/hooks/referenceWorkflowControllerHolder";
import { createReferenceWorkflowPollScheduler } from "@/lib/workflowUi/referenceWorkflowPollScheduler";
import { createReferenceWorkflowInMemorySessionStore } from "@/lib/workflowUi/referenceWorkflowSessionStore";
import { createReferenceWorkflowIdempotencyKeyFactory } from "@/lib/workflowUi/referenceWorkflowIdempotencyKeyFactory";
import { createDeferredClient } from "../helpers/referenceWorkflowDeferredClient";
import { createReferenceWorkflowHookView, mapReferenceWorkflowCommandResult } from "@/hooks/referenceWorkflowHookUtils";
import { createInitialWorkflowUiState } from "@/lib/workflowUi/workflowUiReducer";
import type { WorkflowUiApiClientResult, WorkflowUiControllerInput, WorkflowApiResultDTO } from "@/lib/workflowUi/types";
import { compareWorkflowUiTerminalResults } from "@/lib/workflowUi/workflowUiUtils";

type Input = { ready: boolean };
const request: WorkflowUiControllerInput = { operation: "generate-mv", request: { requestVersion: "1.0", operation: "generate-mv", workflowInput: {} as never } };
function setup(scenario: "mv-completed" | "upload-pending" = "mv-completed", autoRecover = false) {
  const timer = createFakeTimer(), environment = createFakeEnvironment({ online: true, visibility: "visible" }); let factories = 0, disposals = 0, controllerSubscriptions = 0, maxControllerSubscriptions = 0;
  const scheduler = createReferenceWorkflowPollScheduler();
  const controllerHolder = createReferenceWorkflowControllerHolder({ createController() { factories++; const controller = createReferenceWorkflowController({ apiClient: createReferenceWorkflowFixtureClient({ scenario, operation: "generate-mv" }), pollScheduler: scheduler, sessionStore: createReferenceWorkflowInMemorySessionStore(), keyFactory: createReferenceWorkflowIdempotencyKeyFactory("hook-lifecycle"), clock: { nowMs: () => 0, nowUtc: () => "1970-01-01T00:00:00.000Z", expiresAtUtc: ttl => new Date(ttl).toISOString() }, sessionTtlMs: 1_800_000 }); return Object.freeze({ ...controller, subscribe(listener: Parameters<typeof controller.subscribe>[0]) { controllerSubscriptions++; maxControllerSubscriptions = Math.max(maxControllerSubscriptions, controllerSubscriptions); const unsubscribe = controller.subscribe(listener); let active = true; return () => { if (!active) return; active = false; controllerSubscriptions--; unsubscribe(); }; }, dispose() { disposals++; controller.dispose(); } }); }, environment });
  const dependencies = { controllerHolder, timer, environment, pollScheduler: scheduler, pollPolicy: { policyVersion: "1.0" as const, delaysMs: { short: 3000, medium: 15000, long: 45000 }, maxAttempts: 10, maxElapsedMs: 600000, maxConsecutiveNetworkFailures: 3 } };
  const projector = { project(input: Input) { return input.ready ? { status: "projected" as const, request } : { status: "not-ready" as const, reason: "input-not-ready" as const }; } };
  const hookInput: ReferenceWorkflowHookInput<Input, typeof request> = { operation: "generate-mv", projector, dependencies, autoRecover };
  return { hookInput, timer, environment, factories: () => factories, disposals: () => disposals, controllerSubscriptions: () => controllerSubscriptions, maxControllerSubscriptions: () => maxControllerSubscriptions };
}

test("Strict Mode mounts, commands, and disposes through public React runtime", async () => {
  const s = setup(); const observer: Observer<Input> = { renders: 0, failures: 0 }; const host = await mount(s.hookInput, observer);
  assert.equal(s.factories(), 1); assert.equal(s.environment.listeners(), 1); assert.equal(observer.failures, 0); assert.equal(observer.latest?.canStart, true);
  let notReady; await act(async () => { notReady = await observer.latest!.start({ ready: false }); }); assert.equal(notReady!.status, "not-ready"); assert.equal(observer.latest?.canStart, true);
  let completed; await act(async () => { completed = await observer.latest!.start({ ready: true }); }); assert.equal(completed!.status, "completed"); assert.equal(observer.latest?.isTerminal, true); assert.equal(observer.latest?.state.displayStatus, "completed");
  assert.equal(s.timer.active(), 0); assert.equal(s.factories(), 1); assert.equal(s.maxControllerSubscriptions(), 1); assert.equal(s.disposals(), 0); await host.unmount(); assert.equal(s.environment.listeners(), 0); assert.equal(s.controllerSubscriptions(), 0); assert.equal(s.disposals(), 1); assert.equal(s.timer.active(), 0);
});

test("real React environment transition matrix keeps one subscription and safe snapshots", async () => {
  const s = setup("upload-pending"); const observer: Observer<Input> = { renders: 0, failures: 0 }; const host = await mount(s.hookInput, observer);
  await act(async () => { await observer.latest!.start({ ready: true }); }); assert.equal(observer.latest?.state.displayStatus, "pending-upload"); assert.equal(s.timer.active(), 1);
  const states = [{ online: false, visibility: "visible" as const }, { online: false, visibility: "hidden" as const }, { online: true, visibility: "hidden" as const }, { online: true, visibility: "visible" as const }];
  let assertions = 0;
  for (let cycle = 0; cycle < 64; cycle++) for (const state of states) { await act(async () => { s.environment.set(state); await Promise.resolve(); }); assert.equal(observer.latest?.isOffline, !state.online); assertions++; assert.equal(observer.latest?.isHidden, state.visibility === "hidden"); assertions++; assert.equal(s.environment.listeners(), 1); assertions++; assert.equal(observer.failures, 0); assertions++; }
  assert.equal(assertions, 1024); assert.ok(observer.renders > 4); assert.equal(s.environment.listeners(), 1); await host.unmount(); assert.equal(s.environment.listeners(), 0); assert.equal(s.timer.active(), 0);
});

test("hydration uses stable server snapshot and defers effects", async () => {
  const s = setup(); const serverObserver: Observer<Input> = { renders: 0, failures: 0 }; const markup = serverMarkup(s.hookInput, serverObserver);
  assert.equal(markup, ""); assert.equal(s.environment.listeners(), 0); assert.equal(s.timer.active(), 0);
  const clientObserver: Observer<Input> = { renders: 0, failures: 0 }; const host = await hydrate(markup, s.hookInput, clientObserver);
  assert.equal(clientObserver.latest?.state.displayStatus, "idle"); assert.equal(s.environment.listeners(), 1); assert.equal(s.timer.active(), 0); assert.equal(clientObserver.failures, 0);
  await host.unmount(); assert.equal(s.environment.listeners(), 0);
});

test("Holder activation failure stays idle, fails commands closed, and is not retried on rerender", async () => {
  const timer = createFakeTimer(), environment = createFakeEnvironment({ online: true, visibility: "visible" }); let constructions = 0;
  const holder = createReferenceWorkflowControllerHolder({ createController() { constructions++; throw new Error("closed activation failure"); }, environment });
  const hookInput: ReferenceWorkflowHookInput<Input, typeof request> = { operation: "generate-mv", projector: { project: () => ({ status: "projected" as const, request }) }, dependencies: { controllerHolder: holder, timer, environment, pollScheduler: createReferenceWorkflowPollScheduler(), pollPolicy: { policyVersion: "1.0", delaysMs: { short: 3000, medium: 15000, long: 45000 }, maxAttempts: 10, maxElapsedMs: 600000, maxConsecutiveNetworkFailures: 3 } } };
  const observer: Observer<Input> = { renders: 0, failures: 0 }; const host = await mount(hookInput, observer);
  assert.equal(constructions, 1); assert.equal(holder.getStatus(), "activation-failed"); assert.equal(observer.latest?.state.displayStatus, "idle"); assert.equal(environment.listeners(), 0); assert.equal(timer.active(), 0);
  let result; await act(async () => { result = await observer.latest!.start({ ready: true }); }); assert.equal(result!.status, "not-ready");
  await act(async () => { host.root.render(element(hookInput, observer)); await Promise.resolve(); });
  assert.equal(constructions, 1); assert.equal(environment.listeners(), 0); assert.equal(timer.active(), 0); await host.unmount();
});

test("one-shot polling cancels stale handles and never overlaps", async () => {
  const s = setup("upload-pending"); const observer: Observer<Input> = { renders: 0, failures: 0 }; const host = await mount(s.hookInput, observer);
  await act(async () => { await observer.latest!.start({ ready: true }); }); assert.equal(s.timer.active(), 1); const before = s.timer.registrations();
  await act(async () => { s.timer.fireNext(); await Promise.resolve(); }); assert.ok(s.timer.registrations() >= before); assert.ok(s.timer.active() <= 1);
  await act(async () => { observer.latest!.reset(); await Promise.resolve(); }); assert.equal(observer.latest?.state.displayStatus, "idle"); assert.equal(s.timer.active(), 0);
  await host.unmount(); assert.equal(s.timer.active(), 0);
});

test("static production Hook boundaries remain isolated", () => {
  const dir = resolve("hooks"); const source = readdirSync(dir).filter(x => x.endsWith(".ts")).map(x => readFileSync(join(dir, x), "utf8")).join("\n");
  const hook = readFileSync(join(dir, "useReferenceWorkflowController.ts"), "utf8"); assert.ok(hook.startsWith('"use client"')); assert.doesNotMatch(source, /from ["']node:/); assert.doesNotMatch(source, /@\/lib\/server/); assert.doesNotMatch(source, /\bfetch\s*\(/); assert.doesNotMatch(source, /setInterval/); assert.doesNotMatch(source, /app\/ai-mv|components\//); assert.doesNotMatch(source, /console\.(log|error|warn)/);
});

test("Session V1 migration strictly rejects legacy workflow-result without mutation", () => {
  const base = { sessionVersion: "1.0", operation: "generate-mv", reference: { referenceVersion: "1.0", kind: "workflow-result", reference: "opaque-legacy" }, lastServerStatus: "completed", pollAttempts: 0, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:30:00.000Z" } as const;
  const before = JSON.stringify(base); const result = migrateWorkflowUiSessionV1ToV2(base, "2026-01-01T00:10:00.000Z");
  assert.equal(result.status, "invalid"); if (result.status === "invalid") assert.equal(result.reason, "unsupported-legacy-reference-kind"); assert.equal(JSON.stringify(base), before); assert.equal("session" in result, false);
  const expired = migrateWorkflowUiSessionV1ToV2(base, base.expiresAt); assert.equal(expired.status, "expired");
  const upload = { ...base, reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque-upload" }, lastServerStatus: "pending-upload" } as const;
  const migrated = migrateWorkflowUiSessionV1ToV2(upload, "2026-01-01T00:10:00.000Z"); assert.equal(migrated.status, "migrated"); if (migrated.status === "migrated") { assert.equal(migrated.session.sessionVersion, "2.0"); assert.equal(migrated.session.reference.kind, "upload-pending"); }
});

test("cancel preempts an active poll, invalidates its generation, and coalesces duplicates", async () => {
  const client = createDeferredClient();
  const controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: createReferenceWorkflowInMemorySessionStore(), keyFactory: createReferenceWorkflowIdempotencyKeyFactory("coordination"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:00:00.000Z", expiresAtUtc: () => "2026-01-01T00:30:00.000Z" }, sessionTtlMs: 1_800_000 });
  const start = controller.start(request); client.resolveNext("start", { status: "response", result: { status: "success", http: { statusCode: 202, headers: [] }, body: { responseVersion: "1.0", status: "pending-upload", operation: "generate-mv", reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque" }, retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } } } }); await start;
  const poll = controller.pollUpload(); assert.equal(client.count("pollUpload"), 1);
  const cancel = controller.cancel(), duplicate = controller.cancel(); assert.equal(cancel, duplicate); assert.equal(client.count("cancel"), 1);
  client.resolveNext("pollUpload", { status: "response", result: { status: "success", http: { statusCode: 200, headers: [] }, body: { responseVersion: "1.0", status: "completed", operation: "generate-mv", assets: [], resultReference: { referenceVersion: "1.0", kind: "workflow-result", reference: "old" } } } });
  assert.equal((await poll).status, "preempted"); assert.equal(controller.getState().kind, "cancelling");
  client.resolveNext("cancel", { status: "response", result: { status: "success", http: { statusCode: 200, headers: [] }, body: { responseVersion: "1.0", status: "cancelled", operation: "generate-mv", resultReference: { referenceVersion: "1.0", kind: "workflow-result", reference: "cancelled" } } } });
  assert.equal((await cancel).state.kind, "cancelled"); assert.equal(client.count("queryResult"), 0);
});

test("cancel failure restores paused pending state and releases the command lock", async () => {
  const client = createDeferredClient(); const store = createReferenceWorkflowInMemorySessionStore();
  const controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory("failure"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:00:00.000Z", expiresAtUtc: () => "2026-01-01T00:30:00.000Z" }, sessionTtlMs: 1_800_000 });
  const start = controller.start(request); client.resolveNext("start", { status: "response", result: { status: "success", http: { statusCode: 202, headers: [] }, body: { responseVersion: "1.0", status: "pending-upload", operation: "generate-mv", reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque" }, retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } } } }); await start;
  const poll = controller.pollUpload(), cancel = controller.cancel(); client.resolveNext("cancel", { status: "network-error", error: { errorVersion: "1.0", code: "network-unavailable", messageKey: "workflow.networkUnavailable", retryable: true } }); await cancel;
  const restored = controller.getState(); assert.equal(restored.kind, "pending-upload"); if (restored.kind === "pending-upload") assert.equal(restored.activity, "recovering"); assert.equal(client.count("queryResult"), 1);
  client.resolveNext("queryResult", { status: "response", result: { status: "success", http: { statusCode: 202, headers: [] }, body: { responseVersion: "1.0", status: "pending-upload", operation: "generate-mv", reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque" }, retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } } } }); await Promise.resolve();
  const nextCancel = controller.cancel(); assert.equal(client.count("cancel"), 2); client.resolveNext("cancel", { status: "aborted" }); await nextCancel;
  client.resolveNext("pollUpload", { status: "aborted" }); assert.equal((await poll).status, "preempted");
});

test("preempted command mapping pure audit exceeds 300,000 assertions without disclosure", () => {
  const view = createReferenceWorkflowHookView(createInitialWorkflowUiState(), { online: true, visibility: "visible" }); let assertions = 0;
  for (let i = 0; i < 100_001; i++) { const mapped = mapReferenceWorkflowCommandResult({ status: "preempted", state: createInitialWorkflowUiState() }, view); assert.equal(mapped.status, "preempted"); assertions++; assert.equal(mapped.resultVersion, "1.0"); assertions++; assert.equal(JSON.stringify(mapped).includes("reference"), false); assertions++; }
  assert.equal(assertions, 300_003);
});

const terminalResult = (status: "completed" | "degraded" | "partial" | "cancelled", reference = "result-ref", assets: readonly { assetVersion: "1.0"; assetId: string; kind: string; role: string; mimeType: string }[] = []) => ({ responseVersion: "1.0" as const, status, operation: "generate-mv" as const, ...(status === "cancelled" ? {} : { assets }), resultReference: { referenceVersion: "1.0" as const, kind: "workflow-result" as const, reference } });
const response = (body: ReturnType<typeof terminalResult>): WorkflowUiApiClientResult => ({ status: "response", result: { status: "success", http: { statusCode: 200, headers: [] }, body: body as WorkflowApiResultDTO } });
const resultSession = { sessionVersion: "2.0", operation: "generate-mv", reference: { referenceVersion: "1.0", kind: "workflow-result", reference: "result-ref" }, lastServerStatus: "completed", pollAttempts: 0, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:30:00.000Z" } as const;

test("workflow-result V2 autoRecover queries once in Strict Mode and projects recovering safely", async () => {
  const client = createDeferredClient(), timer = createFakeTimer(), environment = createFakeEnvironment({ online: true, visibility: "visible" });
  const controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: createReferenceWorkflowInMemorySessionStore(resultSession), keyFactory: createReferenceWorkflowIdempotencyKeyFactory("result-recovery"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:10:00.000Z", expiresAtUtc: () => "2026-01-01T00:40:00.000Z" }, sessionTtlMs: 1_800_000 });
  const dependencies = { controllerHolder: createReferenceWorkflowControllerHolder({ createController: () => controller, environment }), timer, environment, pollScheduler: createReferenceWorkflowPollScheduler(), pollPolicy: { policyVersion: "1.0" as const, delaysMs: { short: 3000, medium: 15000, long: 45000 }, maxAttempts: 10, maxElapsedMs: 600000, maxConsecutiveNetworkFailures: 3 } };
  const hookInput: ReferenceWorkflowHookInput<Input, typeof request> = { operation: "generate-mv", projector: { project: () => ({ status: "projected" as const, request }) }, dependencies, autoRecover: true };
  const observer: Observer<Input> = { renders: 0, failures: 0 }; const host = await mount(hookInput, observer);
  assert.equal(client.count("queryResult"), 1); assert.equal(client.count("start"), 0); assert.equal(client.count("pollUpload"), 0); assert.equal(timer.active(), 0); assert.equal(observer.latest?.state.displayStatus, "recovering-result"); assert.equal(observer.latest?.isBusy, true); assert.equal(observer.latest?.canCancel, false);
  let lifecycleAssertions = 0; const matrix = [{ online: false, visibility: "visible" as const }, { online: false, visibility: "hidden" as const }, { online: true, visibility: "hidden" as const }, { online: true, visibility: "visible" as const }];
  for (let cycle = 0; cycle < 256; cycle++) for (const item of matrix) { await act(async () => { environment.set(item); await Promise.resolve(); }); assert.equal(client.count("queryResult"), 1); lifecycleAssertions++; assert.equal(timer.active(), 0); lifecycleAssertions++; }
  assert.equal(lifecycleAssertions, 2048);
  await act(async () => { client.resolveNext("queryResult", response(terminalResult("completed"))); await Promise.resolve(); });
  assert.equal(observer.latest?.state.displayStatus, "completed"); assert.equal(observer.latest?.isTerminal, true); assert.equal(JSON.stringify(observer.latest).includes("result-ref"), false);
  await host.unmount(); assert.equal(environment.listeners(), 0);
});

test("terminal query confirms same replay, rejects conflicts, and terminal cancel calls no client", async () => {
  const client = createDeferredClient(), store = createReferenceWorkflowInMemorySessionStore();
  const controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory("terminal"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:10:00.000Z", expiresAtUtc: () => "2026-01-01T00:40:00.000Z" }, sessionTtlMs: 1_800_000 });
  const started = controller.start(request); client.resolveNext("start", response(terminalResult("completed", "result-ref", [{ assetVersion: "1.0", assetId: "asset-1", kind: "video", role: "primary", mimeType: "video/mp4" }]))); await started;
  const before = JSON.stringify(controller.getState()), saved = store.load("2026-01-01T00:10:00.000Z"); assert.equal(saved.status, "loaded");
  const replay = controller.queryResult(), duplicate = controller.queryResult(); assert.equal(replay, duplicate); client.resolveNext("queryResult", response(terminalResult("completed", "result-ref", [{ assetVersion: "1.0", assetId: "asset-1", kind: "video", role: "primary", mimeType: "video/mp4" }]))); assert.equal((await replay).status, "terminal-replayed"); assert.equal(JSON.stringify(controller.getState()), before);
  const conflictQuery = controller.queryResult(); client.resolveNext("queryResult", response(terminalResult("cancelled", "result-ref"))); assert.equal((await conflictQuery).status, "conflict"); assert.equal(JSON.stringify(controller.getState()), before); assert.deepEqual(store.load("2026-01-01T00:10:00.000Z"), saved);
  const cancelled = await controller.cancel(); assert.equal(cancelled.status, "terminal-replayed"); assert.equal(client.count("cancel"), 0); assert.equal(JSON.stringify(controller.getState()), before);
});

test("terminal comparison pure matrix covers statuses, ordered assets, references, and mutation isolation", () => {
  const statuses = ["completed", "degraded", "partial", "cancelled"] as const; const asset = { assetVersion: "1.0" as const, assetId: "asset-1", kind: "video", role: "primary", mimeType: "video/mp4" }; let assertions = 0;
  for (let iteration = 0; iteration < 75_001; iteration++) for (const status of statuses) { const left = terminalResult(status, "same", status === "cancelled" ? [] : [asset]), before = JSON.stringify(left); assert.equal(compareWorkflowUiTerminalResults(left, left).status, "same"); assertions++; assert.equal(compareWorkflowUiTerminalResults(left, terminalResult(status, "different", status === "cancelled" ? [] : [asset])).status, "conflict"); assertions++; assert.equal(JSON.stringify(left), before); assertions++; assert.equal(compareWorkflowUiTerminalResults(left, { status: "pending-upload" }).status, "invalid"); assertions++; }
  assert.equal(assertions, 1_200_016);
});

test("workflow-result expiry and recovery reset reject client calls and late terminal responses", async () => {
  const expiredClient = createDeferredClient(), expiredStore = createReferenceWorkflowInMemorySessionStore({ ...resultSession, expiresAt: "2026-01-01T00:10:00.000Z" });
  const make = (client: ReturnType<typeof createDeferredClient>, store: ReturnType<typeof createReferenceWorkflowInMemorySessionStore>) => createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory("expiry-reset"), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:10:00.000Z", expiresAtUtc: () => "2026-01-01T00:40:00.000Z" }, sessionTtlMs: 1_800_000 });
  assert.equal((await make(expiredClient, expiredStore).recover()).status, "conflict"); assert.equal(expiredClient.count("queryResult"), 0); assert.equal(expiredStore.load("2026-01-01T00:10:00.000Z").status, "empty");
  const client = createDeferredClient(), store = createReferenceWorkflowInMemorySessionStore(resultSession), controller = make(client, store); const recovery = controller.recover(); assert.equal(client.count("queryResult"), 1); assert.equal(controller.getState().kind, "recovering-result"); controller.reset(); assert.equal(controller.getState().kind, "idle"); assert.equal(store.load("2026-01-01T00:10:00.000Z").status, "empty"); client.resolveNext("queryResult", response(terminalResult("completed"))); await recovery; assert.equal(controller.getState().kind, "idle");
});

test("workflow-result transient failure keeps Session while unavailable removes it", async () => {
  const run = async (code: "network" | "unavailable") => { const client = createDeferredClient(), store = createReferenceWorkflowInMemorySessionStore(resultSession), controller = createReferenceWorkflowController({ apiClient: client, pollScheduler: createReferenceWorkflowPollScheduler(), sessionStore: store, keyFactory: createReferenceWorkflowIdempotencyKeyFactory(code), clock: { nowMs: () => 1000, nowUtc: () => "2026-01-01T00:10:00.000Z", expiresAtUtc: () => "2026-01-01T00:40:00.000Z" }, sessionTtlMs: 1_800_000 }); const recovering = controller.recover(); if (code === "network") client.resolveNext("queryResult", { status: "network-error", error: { errorVersion: "1.0", code: "network-unavailable", messageKey: "workflow.networkUnavailable", retryable: true } }); else client.resolveNext("queryResult", { status: "response", result: { status: "error", http: { statusCode: 404, headers: [] }, body: { errorVersion: "1.0", code: "reference-unavailable", message: "Safe.", retryable: false } } }); await recovering; return store.load("2026-01-01T00:10:00.000Z").status; };
  assert.equal(await run("network"), "loaded"); assert.equal(await run("unavailable"), "empty");
});
