import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { InMemoryAcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/idempotency";
import type { AcquisitionRuntime, PoTokenProvider } from "../../lib/server/acquisitionWorker/sourceAdapter";
import { createYouTubeWorkerArguments } from "../../lib/server/acquisitionWorker/youtubeAdapter";
import { createAcquisitionWorkerComposition, createProviderDisabledExperimentComposition } from "../../worker/acquisition/composition";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const SOURCE_URL = "https://www.youtube.com/watch?v=DaxWpqigjrs";
const request = Object.freeze({ requestVersion: "1.0", acquisitionId: ID, source: "youtube", sourceUrl: SOURCE_URL,
  requestedOutputProfile: "canonical-mp4", maxBytes: 1024, timeoutMs: 1_000 });
const runtime: AcquisitionRuntime = Object.freeze({ ytDlpExecutable: "/runtime/yt-dlp", ffmpegExecutable: "/runtime/ffmpeg",
  nodeExecutable: "/usr/local/bin/node", nodeMajorVersion: 24 });
const handoffStore = Object.freeze({ create: async () => { throw new Error("control-must-not-create-handoff"); } });

test("experiment-only composition fixes provider state to not configured and reaches yt-dlp once", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-provider-disabled-control-"));
  let runCount = 0;
  let runArguments: readonly string[] = [];
  const control = await createProviderDisabledExperimentComposition({ authorityRoot, resolveRuntime: async () => runtime,
    idempotency: new InMemoryAcquisitionIdempotencyStore(), handoffStore,
    run: async (args) => { runCount += 1; runArguments = args; },
    inspectMedia: async () => { throw new Error("control-stops-after-runner-proof"); } });

  assert.equal((await control.execute(request)).status, "failed");
  const telemetry = control.telemetry(ID)!;
  assert.equal(telemetry.providerPrecheckOutcome, "NOT_CONFIGURED");
  assert.equal(telemetry.acquisitionProviderRequest, "NO");
  assert.equal(telemetry.ytDlpSpawnAttempted, "YES");
  assert.equal(telemetry.tokenAttachedToOutboundRequest, "UNKNOWN");
  assert.equal(telemetry.tokenConsumedByYtDlp, "UNKNOWN");
  assert.equal(runCount, 1);
  assert.equal(runArguments.some((value) => value.startsWith("youtubepot-bgutilhttp:base_url=")), false);
});

test("Production unavailable-provider precheck remains strict and prevents yt-dlp spawn", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-production-provider-unavailable-"));
  let runCount = 0;
  const unavailable: PoTokenProvider = Object.freeze({ authority: "production-provider",
    status: async () => "unavailable" as const, ytDlpArguments: () => Object.freeze([]) });
  const production = await createAcquisitionWorkerComposition({ authorityRoot, resolveRuntime: async () => runtime,
    idempotency: new InMemoryAcquisitionIdempotencyStore(), handoffStore, provider: unavailable,
    run: async () => { runCount += 1; }, inspectMedia: async () => { throw new Error("must-not-inspect-media"); } });

  assert.deepEqual(await production.execute(request), {
    acquisitionId: ID, status: "failed", errorCode: "po-token-provider-unavailable", retryable: true,
  });
  assert.equal(production.telemetry(ID)!.ytDlpSpawnAttempted, "NO");
  assert.equal(runCount, 0);
});

test("provider-enabled treatment retains the normal yt-dlp execution path", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-provider-enabled-treatment-"));
  let runCount = 0;
  let providerArgumentsPresent = false;
  const available: PoTokenProvider = Object.freeze({ authority: "treatment-provider",
    status: async () => "available" as const,
    ytDlpArguments: () => ["--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"] });
  const treatment = await createAcquisitionWorkerComposition({ authorityRoot, resolveRuntime: async () => runtime,
    idempotency: new InMemoryAcquisitionIdempotencyStore(), handoffStore, provider: available,
    run: async (args) => { runCount += 1; providerArgumentsPresent = args.some((value) =>
      value.startsWith("youtubepot-bgutilhttp:base_url=")); },
    inspectMedia: async () => { throw new Error("treatment-stops-after-runner-proof"); } });

  assert.equal((await treatment.execute(request)).status, "failed");
  assert.equal(treatment.telemetry(ID)!.ytDlpSpawnAttempted, "YES");
  assert.equal(runCount, 1);
  assert.equal(providerArgumentsPresent, true);
});

test("provider availability is the only argument input difference", () => {
  const available: PoTokenProvider = Object.freeze({ authority: "treatment-provider", status: async () => "available" as const,
    ytDlpArguments: () => ["--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"] });
  const workspace = { root: "/workspace", input: "/workspace/input", output: "/workspace/output",
    provider: "/workspace/provider", mediaPath: "/workspace/output/media.mp4" } as const;
  const context = { request, workspace, runtime } as const;
  const control = createYouTubeWorkerArguments(context);
  const treatment = createYouTubeWorkerArguments({ ...context, provider: available });
  const providerIndex = treatment.indexOf("--extractor-args", control.indexOf("--extractor-args") + 1);
  assert.equal(providerIndex > 0, true);
  assert.deepEqual([...treatment.slice(0, providerIndex), ...treatment.slice(providerIndex + 2)], control);
  assert.equal(control.filter((value) => value === "--verbose").length, 1);
  assert.equal(control.some((value) => /pot_trace|print-traffic/i.test(value)), false);
});

test("control selection is entrypoint-fixed and absent from request and runtime inputs", async () => {
  const entrypoint = await readFile("worker/acquisition/experimentControlMain.ts", "utf8");
  const bootstrap = await readFile("worker/acquisition/experimentControlBootstrap.ts", "utf8");
  const production = await readFile("worker/acquisition/main.ts", "utf8");
  const route = await readFile("app/api/internal/acquisition-worker-owner-e2e/route.ts", "utf8");
  const combined = `${entrypoint}\n${bootstrap}`;
  assert.match(combined, /createProviderDisabledExperimentComposition/);
  assert.doesNotMatch(combined, /process\.env|Request|headers?|query|searchParams/i);
  assert.doesNotMatch(`${production}\n${route}`, /ProviderDisabledExperiment|experimentControl/i);
});

test("experiment implementation preserves persistence and bounded diagnostics", async () => {
  const composition = await readFile("worker/acquisition/composition.ts", "utf8");
  const telemetry = await readFile("lib/server/acquisitionWorker/telemetry.ts", "utf8");
  const safeLog = await readFile("worker/acquisition/safeYtDlpFailureLog.ts", "utf8");
  assert.match(composition, /new PersistentAcquisitionIdempotencyStore/);
  assert.match(composition, /await createAcquisitionControlStore\(/);
  assert.doesNotMatch(`${composition}\n${telemetry}\n${safeLog}`, /pot_trace|print-traffic/i);
  assert.doesNotMatch(`${composition}\n${safeLog}`, /rawStderr|tokenValue|authorizationHeader/i);
});
