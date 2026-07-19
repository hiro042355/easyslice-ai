import { protectedIdentity } from "./storeContractUtils";
import type { DurableContractRecord, DurableWorkflowStoreContractAdapterFactory } from "./types";

export type DurableStoreContractSuiteObservation = Readonly<{
  contractId: string;
  storeClass: string;
  operationClass: string;
  safeIssueCode: string;
}>;

export type DurableStoreContractSuiteResult = Readonly<{
  status: "passed" | "failed";
  checks: number;
  observations: readonly DurableStoreContractSuiteObservation[];
}>;

function record(id: string, status: DurableContractRecord["status"] = "active", revision = 0): DurableContractRecord {
  return Object.freeze({
    recordVersion: "1.0",
    identity: protectedIdentity("contract-record", id),
    revision,
    status,
    legalHold: false,
    valueClass: "safe-contract-value",
    orderedValues: Object.freeze(["first", "second"]),
  });
}

export async function runDurableWorkflowStoreContractSuite(
  factory: DurableWorkflowStoreContractAdapterFactory,
): Promise<DurableStoreContractSuiteResult> {
  const observations: DurableStoreContractSuiteObservation[] = [];
  let checks = 0;
  const observe = (ok: boolean, operationClass: string) => {
    checks += 1;
    if (!ok) observations.push(Object.freeze({
      contractId: "durable-workflow-store-contract-suite-v1",
      storeClass: "workflow-contract-store",
      operationClass,
      safeIssueCode: "contract-invariant-failed",
    }));
  };

  const environment = await factory.createEnvironment();
  observe(environment.descriptor.durable === false, "descriptor-durability");
  observe(environment.descriptor.productionReady === false, "descriptor-readiness");
  const created = await environment.records.create(record("base"));
  observe(created.status === "created", "create");
  const duplicate = await environment.records.create(record("base"));
  observe(duplicate.status === "found", "duplicate-create");
  const updated = await environment.records.cas(record("base").identity, 0, record("base", "active", 1));
  observe(updated.status === "updated", "cas-success");
  observe((await environment.records.cas(record("base").identity, 0, record("base", "active", 1))).status === "conflict", "cas-stale");
  const terminal = await environment.records.cas(record("base").identity, 1, record("base", "terminal", 2));
  observe(terminal.status === "updated", "terminal-commit");
  observe((await environment.records.cas(record("base").identity, 2, record("base", "active", 3))).status === "terminal", "terminal-overwrite");

  const final = record("final", "terminal", 1);
  const reference = protectedIdentity("reference-index", "protected-reference");
  const event = protectedIdentity("outbox-event", "protected-event");
  observe((await environment.atomic.commit({ groupVersion: "1.0", result: final, referenceIndex: reference, outboxEvent: event, outboxPayload: { eventClass: "workflow-terminal" } })).status === "committed", "atomic-commit");
  observe((await environment.atomic.readResult(final.identity)).status === "found", "atomic-result-visible");
  observe((await environment.atomic.resolveReference(reference)).status === "found", "atomic-reference-visible");
  observe((await environment.atomic.readOutbox(event)).status === "found", "atomic-outbox-visible");

  const key = protectedIdentity("idempotency", "protected-key");
  const fingerprint = protectedIdentity("fingerprint", "protected-fingerprint");
  observe((await environment.idempotency.reserve(key, fingerprint)).status === "reserved", "idempotency-reserve");
  observe((await environment.idempotency.reserve(key, fingerprint)).status === "existing-same", "idempotency-replay");
  observe((await environment.idempotency.reserve(key, protectedIdentity("fingerprint", "different"))).status === "different-fingerprint", "idempotency-conflict");
  const unknownResult = await environment.idempotency.commitUnknown(key);
  observe((unknownResult.status === "reserved" || unknownResult.status === "existing-same") && unknownResult.state === "unknown", "idempotency-unknown");

  const claimRecord = record("claim");
  await environment.records.create(claimRecord);
  const claim = await environment.claims.acquire(claimRecord.identity, protectedIdentity("owner", "one"), "2026-07-15T00:00:10.000Z");
  observe(claim.status === "acquired", "claim-acquire");
  if (claim.status === "acquired") {
    observe(claim.lease.providerSubmitPermitted === false, "lease-submit-protection");
    observe((await environment.claims.renew(claim.lease, "2026-07-15T00:00:20.000Z")).status === "renewed", "lease-renew");
    observe((await environment.claims.release(claim.lease)).status === "released", "lease-release");
  }
  await environment.dispose();
  observe((await environment.records.read(record("base").identity)).status === "unavailable", "disposed-access");
  return Object.freeze({ status: observations.length === 0 ? "passed" : "failed", checks, observations: Object.freeze([...observations]) });
}
