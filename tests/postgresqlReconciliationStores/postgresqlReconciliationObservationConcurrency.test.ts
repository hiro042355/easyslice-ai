import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createPostgreSQLReconciliationObservationStore,
  createPostgreSQLReconciliationRequestStore,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ObservationDraft,
  ProtectedIdentity,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  SemanticFingerprint,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => { let value = 1; return Object.freeze({ generatorVersion: "1.0" as const, generate: () => `70000000-0000-4000-8000-${String(value++).padStart(12, "0")}` }); };
const options = Object.freeze({ isolation: "read-committed" as const, accessMode: "read-write" as const, deadlineMonotonicMilliseconds: 100000 });
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });

function barrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return async () => { arrived += 1; if (arrived === parties) release(); await ready; };
}

async function withFixture<T>(environment: Parameters<Parameters<typeof withPostgreSqlTestEnvironment>[0]>[0], operation: (fixture: Awaited<ReturnType<typeof setup>>) => Promise<T>) {
  const fixture = await setup(environment);
  try { return await operation(fixture); }
  finally { assert.equal(fixture.manager.dispose(), "disposed"); assert.equal(await fixture.bridge.close(), "closed"); }
}

async function setup(environment: Parameters<Parameters<typeof withPostgreSqlTestEnvironment>[0]>[0]) {
  const bridge = new SliceATestStatementBridge({ ...environment.connection, maxConnections: 8, connectionTimeoutMs: 5000, idleTimeoutMs: 5000, applicationName: "observation-concurrency-matrix", tls: { mode: "disabled" } });
  assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
  assert.equal(await bridge.start(), "ready");
  const generator = ids();
  const requests = createPostgreSQLReconciliationRequestStore(generator);
  const observations = createPostgreSQLReconciliationObservationStore(generator);
  const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
  const requestDraft = Object.freeze({
    identity: identity("reconciliation-request", 1), tenant: identity("tenant", 2), workflow: identity("workflow", 3),
    fingerprint: fingerprint("reconciliation-request-semantic", 4), reconciliationClass: "database-commit-unknown",
    operation: "generate-music" as const, region: "test-region", state: "pending-observation" as const,
    policyClass: "immediate-database", maxObservations: 8, maxAttempts: 4, writerEpoch: "1",
    nextEligibleAt: "2027-01-01T00:00:00.000Z", policyDeadlineAt: "2027-01-02T00:00:00.000Z",
    retentionClass: "reconciliation-standard",
  });
  const parent = await manager.runInTransaction(options, async context => durableTransactionSuccess(await requests.createIfAbsent(context, requestDraft)));
  assert.equal(parent.status, "committed");
  if (parent.status !== "committed") throw new Error("safe-group7-parent");
  const parentValue = parent.value;
  if (parentValue.status !== "created") throw new Error("safe-group7-parent");
  const draft = (seed: number, sequence: string): ObservationDraft => Object.freeze({
    requestId: parentValue.record.id, identity: identity("observation", seed), tenant: requestDraft.tenant,
    fingerprint: fingerprint("observation-semantic", seed), sequence, source: "slice-a-store",
    result: "committed", evidence: "authoritative-summary", attempt: 1,
    observedAt: "2020-01-01T00:00:00.000Z", payload: Object.freeze({ marker: seed, status: "committed" }),
  });
  const append = (value: ObservationDraft, gate: () => Promise<void>) => manager.runInTransaction(options, async context => {
    await gate();
    return durableTransactionSuccess(await observations.appendIfAbsent(context, value));
  });
  return Object.freeze({ bridge, manager, requests, observations, parent: parentValue.record, draft, append });
}

test("Fixture Group 7 races same Observation identity and same fingerprint", async () =>
  withPostgreSqlTestEnvironment(environment => withFixture(environment, async fixture => {
    const value = fixture.draft(11, "1");
    const gate = barrier(2);
    const results = await Promise.all([fixture.append(value, gate), fixture.append(value, gate)]);
    const statuses = results.map(result => result.status === "committed" ? result.value.status : result.status);
    assert.deepEqual(statuses.sort(), ["created", "replayed"]);
    const rows = await fixture.manager.runInTransaction(options, async context => durableTransactionSuccess(await fixture.observations.listByRequest(context, fixture.parent.id)));
    assert.equal(rows.status, "committed");
    if (rows.status === "committed") {
      assert.equal(rows.value.length, 1);
      assert.deepEqual(rows.value[0]?.payload, value.payload);
      const latest = await fixture.manager.runInTransaction(options, async context => durableTransactionSuccess(await fixture.observations.readLatestBySource(context, fixture.parent.id, value.source)));
      assert.equal(latest.status, "committed");
      if (latest.status === "committed" && latest.value.status === "found") assert.deepEqual(latest.value.record, rows.value[0]);
    }
    assert.equal(fixture.parent.revision, "0");
  })));

test("Fixture Group 7 races same Observation identity and different fingerprints", async () =>
  withPostgreSqlTestEnvironment(environment => withFixture(environment, async fixture => {
    const first = fixture.draft(21, "1");
    const second = Object.freeze({ ...first, fingerprint: fingerprint("observation-semantic", 22), payload: Object.freeze({ marker: 22, status: "committed" }) });
    const gate = barrier(2);
    const results = await Promise.all([fixture.append(first, gate), fixture.append(second, gate)]);
    const statuses = results.map(result => result.status === "committed" ? result.value.status : result.status);
    assert.equal(statuses.filter(status => status === "created").length, 1);
    assert.equal(statuses.filter(status => status === "conflict").length, 1);
    const rows = await fixture.manager.runInTransaction(options, async context => durableTransactionSuccess(await fixture.observations.listByRequest(context, fixture.parent.id)));
    assert.equal(rows.status, "committed");
    if (rows.status === "committed") assert.equal(rows.value.length, 1);
    assert.equal(fixture.parent.revision, "0");
  })));

test("Fixture Group 7 races distinct Observation identities and sequences", async () =>
  withPostgreSqlTestEnvironment(environment => withFixture(environment, async fixture => {
    const first = fixture.draft(31, "1");
    const second = fixture.draft(32, "2");
    const gate = barrier(2);
    const results = await Promise.all([fixture.append(first, gate), fixture.append(second, gate)]);
    assert.equal(results.every(result => result.status === "committed" && result.value.status === "created"), true);
    const rows = await fixture.manager.runInTransaction(options, async context => durableTransactionSuccess(await fixture.observations.listByRequest(context, fixture.parent.id)));
    assert.equal(rows.status, "committed");
    if (rows.status === "committed") {
      assert.equal(rows.value.length, 2);
      assert.deepEqual(rows.value.map(row => row.sequence), ["1", "2"]);
      assert.deepEqual(rows.value.map(row => row.payload), [first.payload, second.payload]);
    }
    assert.equal(fixture.parent.revision, "0");
  })));

test("Fixture Group 7 races distinct identities at the same sequence", async () =>
  withPostgreSqlTestEnvironment(environment => withFixture(environment, async fixture => {
    const first = fixture.draft(41, "1");
    const second = fixture.draft(42, "1");
    const gate = barrier(2);
    const results = await Promise.all([fixture.append(first, gate), fixture.append(second, gate)]);
    const statuses = results.map(result => result.status === "committed" ? result.value.status : result.status);
    assert.equal(statuses.filter(status => status === "created").length, 1);
    assert.equal(statuses.filter(status => status === "conflict").length, 1);
    const rows = await fixture.manager.runInTransaction(options, async context => durableTransactionSuccess(await fixture.observations.listByRequest(context, fixture.parent.id)));
    assert.equal(rows.status, "committed");
    if (rows.status === "committed") assert.equal(rows.value.length, 1);
  })));

test("Fixture Group 7 structurally audits authority and parent lifecycle reachability", async () => {
  const [types, stores, statements] = await Promise.all([
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/types.ts", "utf8"),
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/postgresqlReconciliationStores.ts", "utf8"),
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/postgresqlReconciliationStatementCatalog.ts", "utf8"),
  ]);
  const capability = types.slice(types.indexOf("export type ObservationStore"), types.indexOf("export type ResolutionStore"));
  const statement = statements.slice(statements.indexOf("statementId: \"reconciliation.observation.insert\""), statements.indexOf("statementId: \"reconciliation.observation.read\""));
  assert.equal(capability.includes("writerEpoch"), false, "stale-writer-structural-non-applicable");
  assert.equal(capability.includes("fencing"), false, "stale-fence-structural-non-applicable");
  assert.equal(capability.includes("deletion"), false, "deleted-parent-input-unreachable");
  assert.equal(capability.includes("parentState"), false, "terminal-parent-input-unreachable");
  assert.equal(statement.includes("writer_epoch"), false, "statement-authority-unreachable");
  assert.equal(statement.includes("fencing_revision"), false, "statement-fence-unreachable");
  assert.equal(statement.includes("deletion_state"), false, "journal-not-deletion-guarded");
  assert.equal(statement.includes("state NOT IN"), false, "journal-not-terminal-guarded");
  assert.equal(stores.includes("reconciliation.observation.read"), true, "authoritative-replay-read");
  assert.equal(stores.includes("sameDigest(found.record.fingerprint.digest,fingerprint.digest)"), true, "replay-before-conflict");
});
