import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { createProductionReferenceWorkflowHookDependencies } from "@/hooks/createProductionReferenceWorkflowHookDependencies";
import type { WorkflowUiPollScheduler, WorkflowUiRecoverySessionV2 } from "@/lib/workflowUi/types";

const PARTITION_A = "opaque-production-session-a-0001";
const PARTITION_B = "opaque-production-session-b-0002";
const CREATED = "2026-08-31T00:00:00.000Z";
const EXPIRES = "2026-08-31T01:00:00.000Z";

const runtimeImports = (source: string) => {
  const statements = source.match(/^\s*import[\s\S]*?;\s*$/gm) ?? [];
  return statements.flatMap((statement) => {
    if (/^\s*import\s+type\b/.test(statement)) return [];
    const match = statement.match(/(?:from\s+)?["']([^"']+)["']/);
    return match ? [match[1]!] : [];
  });
};

const resolveProjectImport = (from: string, specifier: string) => {
  if (!(specifier.startsWith("@/") || specifier.startsWith("."))) return undefined;
  const base = specifier.startsWith("@/")
    ? resolve(process.cwd(), specifier.slice(2))
    : resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Unresolved project runtime import: ${specifier}`);
};

const runtimeImportClosure = (entry: string) => {
  const pending = [resolve(process.cwd(), entry)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of runtimeImports(readFileSync(current, "utf8"))) {
      const dependency = resolveProjectImport(current, specifier);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].map((path) => path.slice(process.cwd().length + 1).replaceAll("\\", "/")).sort();
};

class Storage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const session = (): WorkflowUiRecoverySessionV2 => ({
  sessionVersion: "2.0",
  operation: "generate-mv",
  reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque-server-reference" },
  lastServerStatus: "pending-upload",
  pollAttempts: 0,
  createdAt: CREATED,
  expiresAt: EXPIRES,
});

const counters = () => ({ subscriptions: 0, timers: 0, api: 0 });
const validInput = (storage = new Storage(), partition = PARTITION_A) => {
  const calls = counters();
  const pollScheduler: WorkflowUiPollScheduler = {
    schedule({ state }) { return { decision: "stop", state, reason: "terminal" }; },
    recordAttempt(state) { return state; },
    pause(state) { return state; },
    resume(state) { return state; },
    stop(state) { return state; },
  };
  return {
    calls,
    input: {
      operation: "generate-mv" as const,
      authentication: { status: "authenticated" as const, opaqueSessionPartition: partition },
      storage,
      apiClient: {
        async start() { calls.api += 1; return { status: "aborted" as const }; },
        async pollUpload() { calls.api += 1; return { status: "aborted" as const }; },
        async pollGeneration() { calls.api += 1; return { status: "aborted" as const }; },
        async queryResult() { calls.api += 1; return { status: "aborted" as const }; },
        async cancel() { calls.api += 1; return { status: "aborted" as const }; },
      },
      timer: {
        schedule() { calls.timers += 1; return Object.freeze({}); },
        cancel() {},
      },
      environment: {
        getSnapshot() { return { online: true, visibility: "visible" as const }; },
        subscribe() { calls.subscriptions += 1; return () => {}; },
      },
      pollScheduler,
      pollPolicy: {
        policyVersion: "1.0" as const,
        delaysMs: { short: 100, medium: 200, long: 300 },
        maxAttempts: 3,
        maxElapsedMs: 1_000,
        maxConsecutiveNetworkFailures: 1,
      },
      keyFactory: { next: (namespace: string) => `production-${namespace}` },
      clock: {
        nowMs: () => 0,
        nowUtc: () => CREATED,
        expiresAtUtc: () => EXPIRES,
      },
      sessionTtlMs: 3_600_000,
    },
  };
};

test("authenticated production composition returns one immutable dormant graph", () => {
  const { input, calls } = validInput();
  const result = createProductionReferenceWorkflowHookDependencies(input);
  assert.equal(result.status, "ready");
  assert.equal(Object.isFrozen(result), true);
  if (result.status !== "ready") return;
  assert.equal(result.dependencies.controllerHolder.getStatus(), "dormant");
  assert.deepEqual(calls, { subscriptions: 0, timers: 0, api: 0 });
  assert.equal(Object.isFrozen(result.dependencies), true);
});

test("anonymous, unavailable, missing and invalid partitions fail closed", () => {
  const base = validInput().input;
  for (const authentication of [
    { status: "anonymous" as const },
    { status: "unavailable" as const },
  ]) {
    assert.deepEqual(createProductionReferenceWorkflowHookDependencies({ ...base, authentication }), {
      status: "invalid", reason: "authentication-required",
    });
  }
  for (const opaqueSessionPartition of ["", "short", `bad\u0000partition-value`]) {
    assert.deepEqual(createProductionReferenceWorkflowHookDependencies({
      ...base,
      authentication: { status: "authenticated", opaqueSessionPartition },
    }), { status: "invalid", reason: "partition-invalid" });
  }
  assert.deepEqual(createProductionReferenceWorkflowHookDependencies({
    ...base,
    authentication: { status: "authenticated" } as never,
  }), { status: "invalid", reason: "configuration-invalid" });
});

test("restricted identity material cannot enter the exact authentication contract", () => {
  const base = validInput().input;
  for (const restricted of ["uid", "email", "accountId", "cookie", "accessToken", "authorization"]) {
    const authentication = { ...base.authentication, [restricted]: "restricted-material" };
    assert.deepEqual(createProductionReferenceWorkflowHookDependencies({ ...base, authentication }), {
      status: "invalid", reason: "configuration-invalid",
    });
  }
});

test("missing API, storage, and each required runtime authority fail before activation", () => {
  const { input, calls } = validInput();
  assert.deepEqual(createProductionReferenceWorkflowHookDependencies({ ...input, apiClient: undefined }), {
    status: "invalid", reason: "api-client-invalid",
  });
  assert.deepEqual(createProductionReferenceWorkflowHookDependencies({ ...input, storage: undefined }), {
    status: "invalid", reason: "storage-invalid",
  });
  for (const key of ["timer", "environment", "pollScheduler", "pollPolicy", "keyFactory", "clock", "sessionTtlMs"] as const) {
    assert.deepEqual(createProductionReferenceWorkflowHookDependencies({ ...input, [key]: undefined }), {
      status: "invalid", reason: "runtime-dependency-invalid",
    });
  }
  assert.deepEqual(calls, { subscriptions: 0, timers: 0, api: 0 });
});

test("partition rotation creates isolated Browser Session V2 namespaces without body leakage", () => {
  const storage = new Storage();
  const a = createProductionReferenceWorkflowHookDependencies(validInput(storage, PARTITION_A).input);
  const b = createProductionReferenceWorkflowHookDependencies(validInput(storage, PARTITION_B).input);
  assert.equal(a.status, "ready");
  assert.equal(b.status, "ready");
  if (a.status !== "ready" || b.status !== "ready") return;
  assert.notEqual(a.recoveryStore, b.recoveryStore);
  assert.deepEqual(a.recoveryStore.save(session()), { status: "saved" });
  assert.deepEqual(b.recoveryStore.load(CREATED), { status: "empty" });
  assert.deepEqual(b.recoveryStore.save(session()), { status: "saved" });
  assert.equal(storage.values.size, 2);
  const keys = [...storage.values.keys()];
  assert.notEqual(keys[0], keys[1]);
  for (const value of storage.values.values()) {
    assert.equal(value.includes(PARTITION_A), false);
    assert.equal(value.includes(PARTITION_B), false);
    assert.equal(value.includes("uid"), false);
    assert.equal(value.includes("accessToken"), false);
  }
});

test("fresh composition does not reuse hidden global partition state", () => {
  const storage = new Storage();
  const first = createProductionReferenceWorkflowHookDependencies(validInput(storage, PARTITION_A).input);
  const rotated = createProductionReferenceWorkflowHookDependencies(validInput(storage, PARTITION_B).input);
  assert.equal(first.status, "ready");
  assert.equal(rotated.status, "ready");
  if (first.status !== "ready" || rotated.status !== "ready") return;
  first.recoveryStore.save(session());
  assert.deepEqual(rotated.recoveryStore.load(CREATED), { status: "empty" });
});

test("production runtime import closure excludes fixture, test, developer, and prototype modules", () => {
  const source = readFileSync("hooks/createProductionReferenceWorkflowHookDependencies.ts", "utf8");
  assert.match(source, /createReferenceWorkflowBrowserSessionStore/);
  assert.match(source, /createReferenceWorkflowControllerHolder/);
  assert.match(source, /createReferenceWorkflowController/);
  const closure = runtimeImportClosure("hooks/createProductionReferenceWorkflowHookDependencies.ts");
  const forbidden = closure.filter((path) =>
    /(^|\/)(tests?|app\/dev)(\/|$)|fixture|fake|prototype|createReferenceWorkflowHookDependencies/u.test(path),
  );
  assert.deepEqual(forbidden, [], closure.join("\n"));
  assert.equal(closure.some((path) => path.endsWith("hooks/createReferenceWorkflowHookFixture.ts")), false);
  assert.equal(closure.some((path) => path.endsWith("lib/workflowUi/referenceWorkflowFixtureClient.ts")), false);
  assert.equal(closure.some((path) => path.includes("referenceWorkflowStartFixtureBootstrapClient")), false);
});

test("production source owns no recovery, lifecycle activation, global storage, or public workflow error vocabulary", () => {
  const source = readFileSync("hooks/createProductionReferenceWorkflowHookDependencies.ts", "utf8");
  for (const forbidden of [
    "WorkflowUiPublicError", "WorkflowUiErrorCode", "queryResult(", "recover(", "acquire(",
    "sessionStorage", "localStorage", "createReferenceWorkflowHookDependencies", "react",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
