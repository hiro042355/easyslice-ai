import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { PostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment/foundation";
import type {
  ReplayPostgresqlObservabilityEvent,
} from "../../lib/server/multiCutReplayPostgresqlObservability";
import {
  createMultiCutReplayPostgresqlProductionComposition,
  type MultiCutReplayPostgresqlProductionComposition,
} from "../../lib/server/multiCutReplayPostgresqlProductionComposition";

let environment: PostgreSqlTestEnvironment;
let composition: MultiCutReplayPostgresqlProductionComposition;
const events: ReplayPostgresqlObservabilityEvent[] = [];

before(async () => {
  environment = await startPostgreSqlTestEnvironment();
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    {
      ...environment.connection,
      maxConnections: 2,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      queryTimeoutMs: 5_000,
      applicationName: "replay-observability-integration",
      tls: { mode: "disabled" },
    },
    {
      observability: Object.freeze({
        emit: (event) => void events.push(event),
      }),
    },
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("composition-not-ready");
  composition = result.composition;
});

after(async () => {
  if (composition) {
    assert.deepEqual(await composition.shutdown(), { status: "closed" });
  }
  if (environment) await environment.stop();
});

const identity = (suffix: string) => Object.freeze({
  physical_schema_version: "2.0",
  logical_schema_version: "2.0",
  identity_version: "2.0",
  scope_version: "1.0",
  replay_namespace: "multi-cut",
  tenant_identity_version: "1.0",
  protected_tenant_identity: "tenant:observability",
  operation_identity: "operation:observability",
  key_identity: `key:observability:${suffix}`,
});

const reserve = (suffix: string) =>
  composition.runtime.execute(Object.freeze({
    inputVersion: "1.0",
    statementId: "resolve-new-reservation",
    bindings: Object.freeze({
      internal_record_id: "70000000-0000-4000-8000-000000000001",
      replay_identity: identity(suffix),
      request_fingerprint_identity: `fingerprint:observability:${suffix}`,
      reservation_identity: `reservation:observability:${suffix}`,
      lease_identity: `lease:observability:${suffix}`,
      lease_duration_milliseconds: "60000",
    }),
  }));

test("real constraint failure emits one redacted class-23 event", async () => {
  assert.equal((await reserve("first")).status, "completed");
  const failed = await reserve("duplicate-record");
  assert.equal(failed.status, "failed");
  assert.equal(events.length, 1);
  const event = events[0];
  assert.deepEqual(event, {
    schemaVersion: "1.0",
    eventType: "replay-postgresql-execution-failed",
    operation: "reserve",
    lifecyclePhase: "execution",
    classification: "non-retryable",
    retryMetadata: "non-retryable",
    safeReason: "adapter-result-failed",
    sqlStateClass: "23",
    outcome: "failed",
  });
  const serialized = JSON.stringify(event);
  for (const forbidden of [
    "INSERT",
    "70000000-0000-4000-8000-000000000001",
    "fingerprint:observability",
    "reservation:observability",
    "lease:observability",
    "23505",
    "stack",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
