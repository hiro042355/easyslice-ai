import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("infra/experiments/aws-acquisition-egress/runtime/run-once", "utf8");

type SimulationInput = { approval?: boolean; target?: "valid" | "missing" | "invalid"; requestValid?: boolean; alreadyConsumed?: boolean; acquisition?: "success" | "failure" };

function simulate(input: SimulationInput) {
  let consumed = Boolean(input.alreadyConsumed);
  let externalAttempts = 0;
  if (consumed) return { status: "ALREADY_CONSUMED", consumed, externalAttempts };
  if (!input.approval) return { status: "NOT_CONFIGURED", consumed, externalAttempts };
  if (input.target !== "valid" || !input.requestValid) return { status: "PRECHECK_FAILED", consumed, externalAttempts };
  consumed = true;
  externalAttempts += 1;
  return { status: input.acquisition === "success" ? "ACQUISITION_SUCCEEDED" : "ACQUISITION_FAILED", consumed, externalAttempts };
}

test("preflight failures do not consume the attempt", () => {
  for (const input of [{ approval: false }, { approval: true, target: "missing" as const }, { approval: true, target: "invalid" as const }, { approval: true, target: "valid" as const, requestValid: false }]) {
    assert.deepEqual(simulate(input), { status: input.approval ? "PRECHECK_FAILED" : "NOT_CONFIGURED", consumed: false, externalAttempts: 0 });
  }
});

test("the simulated external boundary consumes once and blocks a second invocation", () => {
  const first = simulate({ approval: true, target: "valid", requestValid: true, acquisition: "failure" });
  assert.deepEqual(first, { status: "ACQUISITION_FAILED", consumed: true, externalAttempts: 1 });
  assert.deepEqual(simulate({ alreadyConsumed: first.consumed }), { status: "ALREADY_CONSUMED", consumed: true, externalAttempts: 0 });
  assert.deepEqual(simulate({ approval: true, target: "valid", requestValid: true, acquisition: "success" }), { status: "ACQUISITION_SUCCEEDED", consumed: true, externalAttempts: 1 });
});

test("script places the atomic marker immediately before its single Worker POST", () => {
  const boundary = script.indexOf("ATTEMPT_CONSUMPTION_BOUNDARY:");
  const marker = script.indexOf("set -o noclobber", boundary);
  const post = script.indexOf("-X POST", marker);
  assert.ok(boundary >= 0 && marker > boundary && post > marker);
  assert.equal(script.indexOf("-X POST", post + 1), -1);
  assert.equal((script.match(/set -o noclobber/g) ?? []).length, 1);
  assert.doesNotMatch(script, /curl[^\n]*(--retry|-retry)/);
});

test("target and output contracts remain closed and secret-safe", () => {
  assert.match(script, /OWNER_ATTEMPT_APPROVED/);
  assert.match(script, /keys \| sort/);
  assert.match(script, /youtube\\\\\.com\/watch/);
  assert.match(script, /requestVersion:\"1\.0\"/);
  assert.match(script, /requestedOutputProfile:\"canonical-mp4\"/);
  assert.match(script, /artifactReference/);
  assert.doesNotMatch(script, /Authorization:/);
  assert.doesNotMatch(script, /cookie/i);
  assert.doesNotMatch(script, /PO.?token/i);
});
