import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AcquisitionWorkerStartupTelemetry,
  validateAcquisitionWorkerStartupEvent,
  type StartupStage,
} from "../../worker/acquisition/startupTelemetry";
import { bootstrapAcquisitionWorker } from "../../worker/acquisition/bootstrap";

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

test("bootstrap projects telemetry-module load failure without raw exception data", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (value?: unknown) => { lines.push(String(value)); };
  try {
    await bootstrapAcquisitionWorker(async () => { throw new Error("SECRET /private/path"); });
  } finally {
    console.error = original;
    process.exitCode = undefined;
  }
  assert.equal(lines.length, 1);
  const event = validateAcquisitionWorkerStartupEvent(JSON.parse(lines[0]));
  assert.equal(event.startupStage, "CONTAINER_BOOTSTRAP");
  assert.equal(event.startupFailureFamily, "ENTRY_MODULE_LOAD_FAILURE");
  assert.doesNotMatch(lines[0], /SECRET|private|path/);
});

test("bootstrap projects Worker entry-module load failure through closed telemetry", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (value?: unknown) => { lines.push(String(value)); };
  try {
    await bootstrapAcquisitionWorker(
      async () => ({ AcquisitionWorkerStartupTelemetry }),
      async () => { throw new Error("missing runtime dependency"); },
    );
  } finally {
    console.error = original;
    process.exitCode = undefined;
  }
  const event = validateAcquisitionWorkerStartupEvent(JSON.parse(lines[0]));
  assert.equal(event.startupStage, "ENTRY_MODULE_LOAD");
  assert.equal(event.startupFailureFamily, "ENTRY_MODULE_LOAD_FAILURE");
  assert.doesNotMatch(lines[0], /missing runtime dependency/);
});

test("bootstrap invokes Worker main after closed telemetry is established", async () => {
  let invoked = false;
  await bootstrapAcquisitionWorker(
    async () => ({ AcquisitionWorkerStartupTelemetry }),
    async () => ({ startAcquisitionWorker: async () => { invoked = true; } }),
  );
  assert.equal(invoked, true);
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
  const bootstrap = await readFile("worker/acquisition/bootstrap.ts", "utf8");
  const readiness = await readFile("infra/experiments/aws-acquisition-egress/runtime/readiness", "utf8");
  const event = JSON.stringify(new AcquisitionWorkerStartupTelemetry().failure());
  assert.doesNotMatch(event, /token|credential|authorization|header|https?:|stdout|stderr|bucket|path|command/i);
  assert.doesNotMatch(implementation, /error\.message|error\.stack|String\(error\)|rawStd|rawErr/i);
  assert.doesNotMatch(main, /JSON\.stringify\([^)]*error|console\.(?:error|info)\(error/);
  assert.doesNotMatch(bootstrap, /error\.message|error\.stack|String\(error\)|console\.error\([^)]*error/);
  assert.match(readiness, /docker logs nexcut-worker 2>&1 \| jq -Rcer/);
  assert.doesNotMatch(readiness, /docker logs nexcut-worker(?! 2>&1 \| jq -Rcer)/);
  assert.doesNotMatch(readiness, /docker run -d --rm --name nexcut-(?:worker|provider)/);
  assert.match(readiness, /docker rm -f nexcut-worker nexcut-provider/);
});

test("readiness parses Docker stdout/stderr as raw lines before fromjson and removes containers only after projection", async () => {
  const readiness = await readFile("infra/experiments/aws-acquisition-egress/runtime/readiness", "utf8");
  const capture = readiness.indexOf("docker logs nexcut-worker 2>&1 | jq -Rcer");
  const projection = readiness.indexOf("printf '%s\\n' \"$startup_event\"");
  const removal = readiness.indexOf("docker rm -f nexcut-worker nexcut-provider");
  assert.ok(capture >= 0 && projection > capture && removal > projection);
  assert.match(readiness, /fromjson\?/);
  assert.match(readiness, /startup_event='\{"event":"acquisition-worker-startup","startupStage":"UNKNOWN"/);
  assert.doesNotMatch(readiness, /docker logs[^\n]*(?:>|tee|Out-File)[^\n]*\.(?:log|txt|json)/i);
  assert.doesNotMatch(readiness, /cat\s+.*docker|printf[^\n]*docker logs/);
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
