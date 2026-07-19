import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionReconciliation,
  claimReconciliationRequest,
  createReconciliationRuntime,
  getReconciliationRuntimeDescriptor,
  leaseOwns,
  listReconciliationRuntimeDescriptors,
  listReconciliationTransitions,
  policyExhausted,
  renewReconciliationLease,
  requiredSourceFor,
  resolveObservation,
  retryAdvice,
  validateReconciliationRuntime,
  validateTemporalPolicy,
  type ReconciliationPersistence,
  type ReconciliationRequest,
  type ReconciliationResolutionDecision,
  type ReconciliationSourceResult,
} from "../../lib/server/productionWorkflowRuntime/reconciliation";

const request = (overrides: Partial<ReconciliationRequest> = {}): ReconciliationRequest => Object.freeze({
  requestVersion: "1.0",
  requestId: "safe-request",
  triggerClass: "database-commit-unknown",
  state: "pending-observation",
  revision: 0,
  attempt: 0,
  observationCount: 0,
  createdAtMilliseconds: 1_000,
  policy: Object.freeze({
    policyVersion: "1.0",
    maxAttempts: 3,
    maxElapsedMilliseconds: 10_000,
    leaseDurationMilliseconds: 1_000,
    heartbeatIntervalMilliseconds: 250,
    delayClass: "short",
    exhaustionEscalation: "manual-repair",
  }),
  ...overrides,
});

function persistenceFixture(options: Readonly<{
  append?: "committed" | "commit-unknown" | "unavailable";
  complete?: "committed" | "commit-unknown" | "unavailable";
  lookup?: ReconciliationSourceResult;
}> = {}): ReconciliationPersistence & Readonly<{ decisions: ReconciliationResolutionDecision[] }> {
  const decisions: ReconciliationResolutionDecision[] = [];
  return Object.freeze({
    persistenceVersion: "1.0",
    productionReady: false,
    decisions,
    async claim(value, owner, now) { return claimReconciliationRequest(value, owner, now); },
    async heartbeat(value, lease, now) { return renewReconciliationLease(value, lease, now); },
    async appendObservation(value, _lease, observation) {
      if (options.append === "commit-unknown") return { status: "commit-unknown" } as const;
      if (options.append === "unavailable") return { status: "unavailable" } as const;
      return { status: "committed", request: Object.freeze({ ...value, state: "observing", attempt: observation.attempt, observationCount: observation.sequence, revision: value.revision + 1 }) } as const;
    },
    async complete(value, _lease, decision) {
      decisions.push(decision);
      if (options.complete === "commit-unknown") return { status: "commit-unknown" } as const;
      if (options.complete === "unavailable") return { status: "unavailable" } as const;
      return { status: "committed", request: Object.freeze({ ...value, state: decision.nextState, revision: value.revision + 1 }) } as const;
    },
    async release(value) { return { status: "committed", request: value } as const; },
    async lookupResolution() { return options.lookup ?? "unavailable"; },
  });
}

test("bounded temporal policy validates finite approved ranges", () => {
  assert.equal(validateTemporalPolicy(request().policy), true);
  assert.equal(validateTemporalPolicy({ ...request().policy, maxAttempts: 0 }), false);
  assert.equal(validateTemporalPolicy({ ...request().policy, maxAttempts: 65 }), false);
  assert.equal(validateTemporalPolicy({ ...request().policy, heartbeatIntervalMilliseconds: 1_000 }), false);
  assert.equal(policyExhausted(request(), 1_001), false);
  assert.equal(policyExhausted(request({ attempt: 3 }), 1_001), true);
  assert.equal(policyExhausted(request(), 11_000), true);
  assert.deepEqual(retryAdvice(request({ attempt: 2 }), 1_001), {
    delayClass: "short", deadlineClass: "within-policy", attemptRemainingClass: "last-attempt", requiredSource: "writer-authoritative-store",
  });
});

test("trigger classes select only bounded lookup sources", () => {
  assert.equal(requiredSourceFor(request()), "writer-authoritative-store");
  assert.equal(requiredSourceFor(request({ triggerClass: "provider-submit-unknown" })), "provider-formal-lookup");
  assert.equal(requiredSourceFor(request({ triggerClass: "provider-poll-unknown" })), "provider-formal-lookup");
  assert.equal(requiredSourceFor(request({ triggerClass: "webhook-scheduler-race" })), "terminal-store");
  assert.equal(requiredSourceFor(request({ triggerClass: "outbox-delivery-unknown" })), "safe-journal");
});

test("lease claim, heartbeat, takeover, and stale fence are deterministic", () => {
  const first = claimReconciliationRequest(request(), "worker-a", 2_000);
  assert.equal(first.status, "claimed");
  if (first.status !== "claimed" || !first.request.lease) return;
  assert.equal(first.request.lease.fence, 1);
  assert.equal(leaseOwns(first.request, first.request.lease, 2_500), true);
  assert.equal(claimReconciliationRequest(first.request, "worker-b", 2_500).status, "busy");
  const renewed = renewReconciliationLease(first.request, first.request.lease, 2_500);
  assert.equal(renewed.status, "claimed");
  const takeover = claimReconciliationRequest(first.request, "worker-b", 3_001);
  assert.equal(takeover.status, "claimed");
  if (takeover.status !== "claimed" || !takeover.request.lease) return;
  assert.equal(takeover.request.lease.fence, 2);
  assert.equal(renewReconciliationLease(takeover.request, first.request.lease, 3_100).status, "stale-fence");
});

test("state machine allows only explicit non-terminal transitions", () => {
  assert.equal(canTransitionReconciliation("pending-observation", "claimed"), true);
  assert.equal(canTransitionReconciliation("claimed", "observing"), true);
  assert.equal(canTransitionReconciliation("observing", "resolved"), true);
  assert.equal(canTransitionReconciliation("resolved", "claimed"), false);
  assert.equal(canTransitionReconciliation("still-unknown", "resolved"), false);
  const copy = listReconciliationTransitions();
  assert.equal(Object.isFrozen(copy), true);
  assert.throws(() => (copy.observing as string[]).push("cancelled"));
});

test("resolution engine preserves Store ownership and creates still-unknown only after exhaustion", () => {
  assert.deepEqual(resolveObservation(request(), "committed", 2_000).result, { status: "resolved", outcome: "committed" });
  assert.deepEqual(resolveObservation(request(), "not-committed", 2_000).result, { status: "resolved", outcome: "not-committed" });
  assert.deepEqual(resolveObservation(request(), "corrupted", 2_000).result, { status: "corrupted", escalation: "manual-repair" });
  assert.equal(resolveObservation(request({ attempt: 1 }), "unavailable", 2_000).result.status, "pending");
  assert.deepEqual(resolveObservation(request({ attempt: 3 }), "unavailable", 2_000).result, { status: "still-unknown", escalation: "manual-repair" });
});

for (const outcome of ["committed", "not-committed", "corrupted", "unavailable"] as const) {
  test(`runtime coordinates safe ${outcome} observation`, async () => {
    const fixture = persistenceFixture();
    const runtime = createReconciliationRuntime(fixture);
    const result = await runtime.reconcile(request(outcome === "unavailable" ? { attempt: 0 } : {}), "worker-a", {
      sourceVersion: "1.0", source: "writer-authoritative-store", sideEffectFree: true, async observe() { return outcome; },
    }, 2_000, "2026-07-17T00:00:00.000Z");
    assert.equal(result.status, outcome === "committed" || outcome === "not-committed" ? "resolved" : outcome === "corrupted" ? "corrupted" : "pending");
    assert.equal(fixture.decisions.length, 1);
  });
}

test("runtime exhaustion alone owns still-unknown and routes manual repair", async () => {
  const fixture = persistenceFixture();
  const result = await createReconciliationRuntime(fixture).reconcile(request({ attempt: 2 }), "worker-a", {
    sourceVersion: "1.0", source: "writer-authoritative-store", sideEffectFree: true, async observe() { return "unavailable"; },
  }, 2_000, "2026-07-17T00:00:00.000Z");
  assert.deepEqual(result, { status: "still-unknown", escalation: "manual-repair" });
  assert.equal(fixture.decisions[0]?.routeManualRepair, true);
  assert.equal(fixture.decisions[0]?.appendOutbox, true);
});

test("commit unknown performs lookup only and never retries an external observation", async () => {
  let observations = 0;
  const fixture = persistenceFixture({ complete: "commit-unknown", lookup: "committed" });
  const result = await createReconciliationRuntime(fixture).reconcile(request(), "worker-a", {
    sourceVersion: "1.0", source: "writer-authoritative-store", sideEffectFree: true, async observe() { observations += 1; return "committed"; },
  }, 2_000, "2026-07-17T00:00:00.000Z");
  assert.deepEqual(result, { status: "resolved", outcome: "committed" });
  assert.equal(observations, 1);

  const unknown = await createReconciliationRuntime(persistenceFixture({ append: "commit-unknown", lookup: "not-committed" })).reconcile(request(), "worker-a", {
    sourceVersion: "1.0", source: "writer-authoritative-store", sideEffectFree: true, async observe() { return "committed"; },
  }, 2_000, "2026-07-17T00:00:00.000Z");
  assert.deepEqual(unknown, { status: "unavailable", retryable: false });
});

test("registry, validator, and descriptors remain isolated and non-production", () => {
  const runtime = createReconciliationRuntime(persistenceFixture());
  assert.deepEqual(validateReconciliationRuntime(runtime), { status: "valid" });
  assert.equal(validateReconciliationRuntime({}).status, "invalid");
  assert.equal(runtime.descriptor.productionReady, false);
  assert.equal(runtime.descriptor.runtimeBundleRegistered, false);
  assert.equal(runtime.descriptor.timerImplementation, false);
  assert.equal(runtime.descriptor.providerImplementation, false);
  const descriptor = getReconciliationRuntimeDescriptor(runtime.descriptor.id);
  assert.deepEqual(descriptor, runtime.descriptor);
  const registry = listReconciliationRuntimeDescriptors();
  assert.equal(Object.isFrozen(registry), true);
  assert.notEqual(registry[0], listReconciliationRuntimeDescriptors()[0]);
});
