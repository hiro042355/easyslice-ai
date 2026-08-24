import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AcquisitionWorkerStartupTelemetry,
  validateAcquisitionWorkerStartupEvent,
  type StartupStage,
} from "../../worker/acquisition/startupTelemetry";

const cases: ReadonlyArray<readonly [Exclude<StartupStage, "READY">, string, string]> = [
  ["RUNTIME_RESOLUTION", "RUNTIME_DEPENDENCY_FAILURE", "runtimeDependenciesResolved"],
  ["CONTROL_STORE_CONFIG", "INVALID_CONTROL_AUTHORITY", "controlAuthorityValidated"],
  ["GOOGLE_AUTH_INIT", "GOOGLE_AUTH_FAILURE", "googleAuthInitialized"],
  ["CONTROL_STORE_INIT", "CONTROL_STORE_FAILURE", "controlStoreInitialized"],
  ["TELEMETRY_PROXY_INIT", "TELEMETRY_PROXY_FAILURE", "telemetryProxyInitialized"],
  ["HTTP_BIND", "HTTP_BIND_FAILURE", "httpListenerBound"],
];

for (const [stage, family, evidence] of cases) {
  test(`${stage} failure projects only its closed family and negative evidence`, () => {
    const telemetry = new AcquisitionWorkerStartupTelemetry();
    telemetry.enter(stage);
    const event = telemetry.failure();
    assert.equal(event.startupStage, stage);
    assert.equal(event.startupFailureFamily, family);
    assert.equal(event[evidence as keyof typeof event], "NO");
    assert.deepEqual(validateAcquisitionWorkerStartupEvent(event), event);
  });
}

test("successful startup reaches READY with every boundary proven", () => {
  const telemetry = new AcquisitionWorkerStartupTelemetry();
  for (const evidence of ["runtimeDependenciesResolved", "controlAuthorityValidated", "googleAuthInitialized",
    "controlStoreInitialized", "telemetryProxyInitialized", "httpListenerBound"] as const) telemetry.prove(evidence);
  const event = telemetry.ready();
  assert.equal(event.startupStage, "READY");
  assert.equal(event.startupFailureFamily, null);
  assert.equal(Object.values(event).filter((value) => value === "YES").length, 6);
  assert.deepEqual(validateAcquisitionWorkerStartupEvent(event), event);
});

test("UNKNOWN is preserved and arbitrary strings, missing fields, and extra fields are rejected", () => {
  const event = new AcquisitionWorkerStartupTelemetry().failure();
  assert.equal(event.startupStage, "UNKNOWN");
  assert.equal(event.startupFailureFamily, "UNKNOWN_STARTUP_FAILURE");
  assert.equal(event.runtimeDependenciesResolved, "UNKNOWN");
  assert.throws(() => validateAcquisitionWorkerStartupEvent({ ...event, startupStage: "raw-error" }));
  assert.throws(() => validateAcquisitionWorkerStartupEvent({ ...event, startupFailureFamily: "token rejected" }));
  assert.throws(() => validateAcquisitionWorkerStartupEvent({ ...event, runtimeDependenciesResolved: "MAYBE" }));
  const missing = Object.fromEntries(Object.entries(event).filter(([key]) => key !== "httpListenerBound"));
  assert.throws(() => validateAcquisitionWorkerStartupEvent(missing));
  assert.throws(() => validateAcquisitionWorkerStartupEvent({ ...event, stderr: "forbidden" }));
});

test("startup projection and readiness capture contain no secret, URL, header, or raw-output authority", async () => {
  const implementation = await readFile("worker/acquisition/startupTelemetry.ts", "utf8");
  const main = await readFile("worker/acquisition/main.ts", "utf8");
  const readiness = await readFile("infra/experiments/aws-acquisition-egress/runtime/readiness", "utf8");
  const event = JSON.stringify(new AcquisitionWorkerStartupTelemetry().failure());
  assert.doesNotMatch(event, /token|credential|authorization|header|https?:|stdout|stderr|bucket|path|command/i);
  assert.doesNotMatch(implementation, /error\.message|error\.stack|String\(error\)|rawStd|rawErr/i);
  assert.doesNotMatch(main, /JSON\.stringify\([^)]*error|console\.(?:error|info)\(error/);
  assert.match(readiness, /docker logs nexcut-worker 2>\/dev\/null \| jq -cer/);
  assert.doesNotMatch(readiness, /docker logs nexcut-worker(?! 2>\/dev\/null \| jq)/);
  assert.doesNotMatch(readiness, /docker run -d --rm --name nexcut-(?:worker|provider)/);
  assert.match(readiness, /docker rm -f nexcut-worker nexcut-provider/);
});

test("Production and EXPERIMENT authority, acquisition arguments, images, and retry behavior remain unchanged", async () => {
  const readiness = await readFile("infra/experiments/aws-acquisition-egress/runtime/readiness", "utf8");
  const composition = await readFile("worker/acquisition/composition.ts", "utf8");
  assert.match(readiness, /ACQUISITION_RUNTIME_MODE=EXPERIMENT/);
  assert.match(readiness, /ACQUISITION_CONTROL_MODE=EXPERIMENT/);
  assert.match(readiness, /ACQUISITION_EXPERIMENT_BUCKET="\$ACQUISITION_CONTROL_BUCKET"/);
  assert.doesNotMatch(readiness, /docker[^\n]*(?:youtube|yt-dlp)|run-once|attempt\.claimed.*(?:touch|echo)/i);
  assert.match(composition, /new YouTubeSourceAdapter/);
  assert.doesNotMatch(composition, /retry|fallback|cookies?|account credentials?/i);
});
