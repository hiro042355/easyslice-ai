import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFinalResultRow,
  projectPostgreSQLFinalResultRowV2,
  projectPostgreSQLOutboxRowV2,
  projectSliceAJsonObjectV2,
  type SliceADatabaseRowV2,
} from "@/lib/server/productionWorkflowRuntime/postgresqlStores";

const bytes = (seed: number) => new Uint8Array(32).fill(seed);
const id = "11111111-1111-4111-8111-111111111111";

const finalRow = (payload: unknown): SliceADatabaseRowV2 => Object.freeze({
  result_id: id,
  result_digest: bytes(1),
  tenant_digest: bytes(2),
  region: "jp",
  operation: "generate-mv",
  result_status: "completed",
  revision: "1",
  terminal_payload: payload,
  expires_at: "2026-08-02T00:00:00.000Z",
  retention_class: "standard",
  deletion_state: "active",
  legal_hold_state: "none",
} as SliceADatabaseRowV2);

const outboxRow = (payload: unknown): SliceADatabaseRowV2 => Object.freeze({
  event_id: id,
  event_digest: bytes(3),
  aggregate_digest: bytes(4),
  result_id: id,
  event_type: "completed",
  safe_payload: payload,
  delivery_state: "pending",
  attempt: 0,
  next_eligible_at: "2026-08-02T00:00:00.000Z",
  revision: "0",
} as SliceADatabaseRowV2);

test("structured JSON V2 preserves structure and copy isolation", () => {
  const source = { status: "completed", clips: [{ scores: [10, 20], metadata: { active: true, note: null } }] };
  const result = projectSliceAJsonObjectV2(source);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  source.clips[0]!.scores[0] = 99;
  assert.equal(((result.value.clips as readonly { scores: readonly number[] }[])[0]!.scores)[0], 10);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.clips), true);
});

test("structured JSON V2 rejects unsafe values without exposing them", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, BigInt(1), () => undefined, Symbol("x"), new Date(), new Uint8Array(1), cyclic]) {
    assert.deepEqual(projectSliceAJsonObjectV2({ value }), {
      resultVersion: "2.0",
      status: "failure",
      kind: "row-validation-failure",
      safeReason: "invalid-structured-json",
      retryable: false,
      ownerAction: "do-not-commit",
    });
  }
});

test("Final Result V1 and V2 produce equivalent domain payloads", () => {
  const payload = { assets: [{ id: "asset-1", scores: [1, 2], note: null }] };
  const v1 = parseFinalResultRow(Object.freeze({ ...finalRow({}), terminal_payload: JSON.stringify(payload) }));
  const v2 = projectPostgreSQLFinalResultRowV2(finalRow(payload));
  assert.ok(v1);
  assert.equal(v2.status, "success");
  if (!v1 || v2.status !== "success") return;
  assert.deepEqual(v2.record.terminalPayload, v1.terminalPayload);
  assert.notEqual(v2.record.terminalPayload, payload);
});

test("Outbox V2 consumes structured JSON without coercion", () => {
  const payload = { clips: [{ id: "clip-1", metadata: { active: true, note: null } }], empty: [] };
  const result = projectPostgreSQLOutboxRowV2(outboxRow(payload));
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(result.record.safePayload, payload);
  assert.notEqual(result.record.safePayload, payload);
  assert.equal(Object.isFrozen(result.record.safePayload), true);
});

test("V2 row consumers fail closed for invalid structured payloads and rows", () => {
  const invalidFinal = projectPostgreSQLFinalResultRowV2(finalRow([]));
  const invalidOutbox = projectPostgreSQLOutboxRowV2(outboxRow(new Uint8Array(1)));
  const incomplete = Object.freeze({ terminal_payload: {} }) as SliceADatabaseRowV2;
  const invalidRow = projectPostgreSQLFinalResultRowV2(incomplete);
  assert.equal(invalidFinal.status, "failure");
  assert.equal(invalidOutbox.status, "failure");
  assert.equal(invalidRow.status, "failure");
  if (invalidFinal.status === "failure") assert.equal(invalidFinal.safeReason, "invalid-structured-json");
  if (invalidOutbox.status === "failure") assert.equal(invalidOutbox.safeReason, "invalid-structured-json");
  if (invalidRow.status === "failure") assert.equal(invalidRow.safeReason, "invalid-row");
});
