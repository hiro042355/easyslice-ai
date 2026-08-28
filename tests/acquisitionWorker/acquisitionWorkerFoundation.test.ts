import assert from "node:assert/strict";
import { constants, readFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import {
  ACQUISITION_MAX_BYTES,
  AcquisitionWorkerCore,
  AcquisitionWorkerFailure,
  BgutilHttpPoTokenProvider,
  InMemoryAcquisitionIdempotencyStore,
  SourceAdapterRegistry,
  YouTubeSourceAdapter,
  acquisitionRequestFingerprint,
  createYouTubeWorkerArguments,
  controlledExperimentRetryArguments,
  nodeJsRuntimeArgument,
  inspectCanonicalMp4,
  resolveAcquisitionRuntime,
  resolveAcquisitionWorkspace,
  validateAcquisitionRequest,
  validateAcquisitionResult,
  type AcquisitionMediaMetadata,
  type AcquisitionRuntime,
  type SourceAcquisitionContext,
} from "../../lib/server/acquisitionWorker";
import { YtDlpProcessFailure } from "../../lib/server/packagedYtDlp";

const execFileAsync = promisify(execFile);

const ID = "2c0f2e4d-98ca-4dda-9d6f-2e0dcc96b248";
const URL = "https://www.youtube.com/watch?v=abc123XYZ_-";
const request = (overrides: Record<string, unknown> = {}) => ({
  requestVersion: "1.0",
  acquisitionId: ID,
  source: "youtube",
  sourceUrl: URL,
  requestedOutputProfile: "canonical-mp4",
  ...overrides,
});

const runtime: AcquisitionRuntime = Object.freeze({
  ytDlpExecutable: "/runtime/yt-dlp",
  ffmpegExecutable: "/runtime/ffmpeg",
  nodeExecutable: "/runtime/node",
  nodeMajorVersion: 24,
});

test("request contract is exact, versioned, normalized, bounded, and contains no ownership or credential authority", () => {
  const validated = validateAcquisitionRequest(request({ sourceUrl: "https://youtu.be/abc123XYZ_-" }));
  assert.equal(validated.sourceUrl, URL);
  assert.equal(validated.maxBytes, ACQUISITION_MAX_BYTES);
  assert.equal(validated.timeoutMs, 240_000);
  for (const forbidden of ["uid", "ownerUid", "cookie", "authorization", "storageKey", "bucket", "controlBucket", "path", "command", "executable"]) {
    assert.throws(() => validateAcquisitionRequest(request({ [forbidden]: "forbidden" })), /invalid-acquisition-request/);
  }
});

test("request rejects unsupported sources, invalid IDs, playlists, credentials, redirects, and generic URLs", () => {
  assert.throws(() => validateAcquisitionRequest(request({ source: "tiktok" })), /unsupported-source/);
  assert.throws(() => validateAcquisitionRequest(request({ acquisitionId: "client-id" })), /invalid-acquisition-id/);
  for (const sourceUrl of [
    "https://youtube.com/watch?v=abc123XYZ_-&list=PL123",
    "https://user:pass@youtube.com/watch?v=abc123XYZ_-",
    "https://example.com/redirect?to=https://youtube.com/watch?v=abc123XYZ_-",
    "file:///tmp/media.mp4",
  ]) assert.throws(() => validateAcquisitionRequest(request({ sourceUrl })), /invalid-source-url/);
});

test("request bounds cannot exceed the fixed 2 GiB and 240 second policies", () => {
  assert.throws(() => validateAcquisitionRequest(request({ maxBytes: ACQUISITION_MAX_BYTES + 1 })), /invalid-acquisition-request/);
  assert.throws(() => validateAcquisitionRequest(request({ timeoutMs: 240_001 })), /invalid-acquisition-request/);
});

test("result contract accepts only exact safe success and failure unions", () => {
  const success = { acquisitionId: ID, status: "succeeded", artifactReference: `acquisition:${ID}`, media } as const;
  const failure = { acquisitionId: ID, status: "failed", errorCode: "network-failure", retryable: true } as const;
  assert.deepEqual(validateAcquisitionResult(success), success);
  assert.deepEqual(validateAcquisitionResult(failure), failure);
  assert.throws(() => validateAcquisitionResult({ ...success, outputPath: "/tmp/private" }), /invalid-acquisition-result/);
  assert.throws(() => validateAcquisitionResult({ ...failure, stderr: "raw" }), /invalid-acquisition-result/);
  assert.throws(() => validateAcquisitionResult({ ...failure, errorCode: "raw-provider-error" }), /invalid-acquisition-result/);
});

test("idempotency coalesces the same request and rejects conflicting reuse", async () => {
  const store = new InMemoryAcquisitionIdempotencyStore();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    return { acquisitionId: ID, status: "failed", errorCode: "network-failure", retryable: true } as const;
  };
  const validated = validateAcquisitionRequest(request());
  const fingerprint = acquisitionRequestFingerprint(validated);
  const [first, second] = await Promise.all([
    store.execute(ID, fingerprint, operation),
    store.execute(ID, fingerprint, operation),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  await assert.rejects(store.execute(ID, `${fingerprint}-changed`, operation), /idempotency-conflict/);
});

test("source registry selects exactly the YouTube adapter and has no generic fetch adapter", () => {
  const adapter = new YouTubeSourceAdapter(async () => undefined);
  const registry = new SourceAdapterRegistry([adapter]);
  assert.equal(registry.resolve(validateAcquisitionRequest(request())), adapter);
  const implementation = readFileSync("lib/server/acquisitionWorker/youtubeAdapter.ts", "utf8");
  assert.doesNotMatch(implementation, /fetch\(|axios|http\.request|https\.request/);
});

test("YouTube arguments explicitly bind Node EJS and mweb, preserve canonical profile, and contain no cookies or shell commands", () => {
  const context = {
    request: validateAcquisitionRequest(request()),
    workspace: resolveAcquisitionWorkspace(ID, "/tmp/nexcut-acquisition-tests"),
    runtime,
  } satisfies SourceAcquisitionContext;
  const args = createYouTubeWorkerArguments(context);
  assert.deepEqual(args.slice(0, 3), ["--no-js-runtimes", "--js-runtimes", "node:/runtime/node"]);
  assert.deepEqual(args.slice(3, 5), ["--extractor-args", "youtube:player_client=mweb"]);
  assert.equal(args.filter((value) => value === "youtube:player_client=mweb").length, 1);
  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("--merge-output-format"));
  assert.ok(args.includes(context.workspace.mediaPath));
  assert.doesNotMatch(JSON.stringify(args), /cookie|username|password|netrc|shell|storageKey|userId/i);
  assert.equal(nodeJsRuntimeArgument("/runtime/node"), "node:/runtime/node");
});

test("controlled EXPERIMENT mode explicitly disables every applicable yt-dlp retry without changing Production", async () => {
  assert.deepEqual(controlledExperimentRetryArguments({
    ACQUISITION_RUNTIME_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_MODE: "EXPERIMENT",
  }), [
    "--retries", "0",
    "--fragment-retries", "0",
    "--extractor-retries", "0",
    "--file-access-retries", "0",
    "--abort-on-unavailable-fragments",
  ]);
  assert.deepEqual(controlledExperimentRetryArguments({
    ACQUISITION_RUNTIME_MODE: "PRODUCTION",
    ACQUISITION_CONTROL_MODE: "PRODUCTION",
  }), []);
  assert.deepEqual(controlledExperimentRetryArguments({
    ACQUISITION_RUNTIME_MODE: "EXPERIMENT",
    ACQUISITION_CONTROL_MODE: "PRODUCTION",
  }), []);

  const controlledArgs = createYouTubeWorkerArguments({
    request: validateAcquisitionRequest(request()),
    workspace: resolveAcquisitionWorkspace(ID, "/tmp/nexcut-acquisition-tests"),
    runtime,
  }, { ACQUISITION_RUNTIME_MODE: "EXPERIMENT", ACQUISITION_CONTROL_MODE: "EXPERIMENT" });
  for (const option of ["--retries", "--fragment-retries", "--extractor-retries", "--file-access-retries"]) {
    const index = controlledArgs.indexOf(option);
    assert.ok(index >= 0);
    assert.equal(controlledArgs[index + 1], "0");
    assert.equal(controlledArgs.filter((value) => value === option).length, 1);
  }
  assert.equal(controlledArgs.filter((value) => value === "--abort-on-unavailable-fragments").length, 1);
  assert.equal(controlledArgs.filter((value) => value === "youtube:player_client=mweb").length, 1);
  assert.equal(controlledArgs.at(-1), URL);

  let processInvocations = 0;
  const context = {
    request: validateAcquisitionRequest(request()),
    workspace: resolveAcquisitionWorkspace(ID, "/tmp/nexcut-acquisition-tests"),
    runtime,
  } satisfies SourceAcquisitionContext;
  const adapter = new YouTubeSourceAdapter(async () => {
    processInvocations += 1;
    throw new YtDlpProcessFailure("network-failure");
  });
  await assert.rejects(adapter.acquire(context), /network-failure/);
  assert.equal(processInvocations, 1);
});

test("runtime requires an explicit executable Node >=22 and never falls back to PATH", async () => {
  await assert.rejects(resolveAcquisitionRuntime({ nodeExecutable: process.execPath, nodeVersion: "20.0.0" }), /js-runtime-unavailable/);
  await assert.rejects(resolveAcquisitionRuntime({ nodeExecutable: path.join(os.tmpdir(), "missing-node"), nodeVersion: "24.0.0" }), /js-runtime-unavailable/);
  await access(process.execPath, constants.F_OK | constants.X_OK);
  const implementation = readFileSync("lib/server/acquisitionWorker/runtime.ts", "utf8");
  assert.doesNotMatch(implementation, /process\.env\.PATH|which\s+node|where\s+node|["']node["']/);
});

test("provider boundary supports absent, available, and unavailable states with a pinned authority", async () => {
  const available = new BgutilHttpPoTokenProvider(async () => true);
  const unavailable = new BgutilHttpPoTokenProvider(async () => false);
  assert.equal(available.authority, "bgutil-ytdlp-pot-provider@1.3.1");
  assert.equal(await available.status(), "available");
  assert.equal(await unavailable.status(), "unavailable");
  assert.equal(await new BgutilHttpPoTokenProvider(async () => { throw new Error("safe"); }).status(), "failed");
  assert.deepEqual(available.ytDlpArguments(), [
    "--extractor-args",
    "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
  ]);
  assert.throws(
    () => new BgutilHttpPoTokenProvider(async () => true, "https://provider.example.com").ytDlpArguments(),
    /invalid-bgutil-provider-base-url/,
  );
});

test("adapter classifies provider, timeout, cancellation, bot, and network failures without raw diagnostics", async () => {
  const context = {
    request: validateAcquisitionRequest(request()),
    workspace: resolveAcquisitionWorkspace(ID, "/tmp/nexcut-acquisition-tests"),
    runtime,
  } satisfies SourceAcquisitionContext;
  const cases = [
    ["yt-dlp-timeout", "acquisition-timeout"],
    ["yt-dlp-cancelled", "acquisition-cancelled"],
    ["youtube-bot-check", "youtube-bot-check"],
    ["network-failure", "network-failure"],
  ] as const;
  for (const [reason, expected] of cases) {
    const adapter = new YouTubeSourceAdapter(async () => { throw new YtDlpProcessFailure(reason); });
    await assert.rejects(adapter.acquire(context), (error: unknown) =>
      error instanceof AcquisitionWorkerFailure && error.code === expected);
  }
  const provider = new BgutilHttpPoTokenProvider(async () => false);
  await assert.rejects(new YouTubeSourceAdapter(async () => undefined).acquire({ ...context, provider }), /po-token-provider-unavailable/);
  const failedProvider = new BgutilHttpPoTokenProvider(async () => { throw new Error("safe"); });
  await assert.rejects(new YouTubeSourceAdapter(async () => undefined).acquire({ ...context, provider: failedProvider }), /po-token-provider-failed/);
});

const media: AcquisitionMediaMetadata = Object.freeze({
  contentType: "video/mp4",
  byteSize: 128,
  durationSeconds: 1.5,
  hasVideo: true,
  hasAudio: false,
});

test("worker consumes a validated artifact before finally cleanup and returns only safe metadata", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-acquisition-core-"));
  let acquired = 0;
  let consumed = 0;
  try {
    const adapter = new YouTubeSourceAdapter(async (args) => {
      acquired += 1;
      const output = args[args.indexOf("--output") + 1]!;
      await writeFile(output, Buffer.alloc(128));
    });
    const core = new AcquisitionWorkerCore({
      adapters: new SourceAdapterRegistry([adapter]),
      idempotency: new InMemoryAcquisitionIdempotencyStore(),
      runtime,
      authorityRoot,
      inspectMedia: async (inputPath) => {
        assert.equal((await stat(inputPath)).size, 128);
        return media;
      },
      consumeArtifact: async ({ path: inputPath }) => {
        consumed += 1;
        assert.equal((await readFile(inputPath)).length, 128);
        return `acquisition:${ID}`;
      },
    });
    const [first, second] = await Promise.all([core.execute(request()), core.execute(request())]);
    assert.deepEqual(first, second);
    assert.equal(first.status, "succeeded");
    assert.equal(acquired, 1);
    assert.equal(consumed, 1);
    await assert.rejects(stat(resolveAcquisitionWorkspace(ID, authorityRoot).root));
    assert.doesNotMatch(JSON.stringify(first), /\/tmp|youtube\.com|uid|cookie|token|stderr|executable/i);
  } finally {
    await rm(authorityRoot, { recursive: true, force: true });
  }
});

test("worker cleans only its acquisition root after failure and cancellation", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-acquisition-failure-"));
  try {
    const siblingId = "a2ec5299-fb88-421a-820c-7e0daf9eb27c";
    const sibling = resolveAcquisitionWorkspace(siblingId, authorityRoot);
    await writeFile(path.join(authorityRoot, "sentinel"), "preserve");
    const core = new AcquisitionWorkerCore({
      adapters: new SourceAdapterRegistry([new YouTubeSourceAdapter(async () => {
        throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
      })]),
      idempotency: new InMemoryAcquisitionIdempotencyStore(),
      runtime,
      authorityRoot,
      inspectMedia: async () => media,
      consumeArtifact: async () => "unreachable",
    });
    const result = await core.execute(request());
    assert.deepEqual(result, { acquisitionId: ID, status: "failed", errorCode: "acquisition-cancelled", retryable: true });
    await assert.rejects(stat(resolveAcquisitionWorkspace(ID, authorityRoot).root));
    assert.equal(await readFile(path.join(authorityRoot, "sentinel"), "utf8"), "preserve");
    await assert.rejects(stat(sibling.root));
  } finally {
    await rm(authorityRoot, { recursive: true, force: true });
  }
});

test("media validation accepts a finite MP4 with video and optional audio, and rejects size overflow", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-acquisition-media-"));
  const output = path.join(root, "fixture.mp4");
  try {
    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.2",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
    ]);
    const inspected = await inspectCanonicalMp4(output, { ...runtime, ffmpegExecutable: ffmpegPath }, ACQUISITION_MAX_BYTES);
    assert.equal(inspected.contentType, "video/mp4");
    assert.equal(inspected.hasVideo, true);
    assert.equal(inspected.hasAudio, false);
    assert.ok(inspected.byteSize > 0);
    assert.ok(inspected.durationSeconds > 0);
    await assert.rejects(inspectCanonicalMp4(output, { ...runtime, ffmpegExecutable: ffmpegPath }, 1), /output-too-large/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("foundation source contains no cookie, account, shell, PATH, GCS, DB, Next Request, or shared filename authority", () => {
  const files = [
    "contracts.ts", "core.ts", "gcsControlStore.ts", "idempotency.ts", "mediaValidation.ts",
    "persistentIdempotency.ts", "provider.ts", "runtime.ts", "sourceAdapter.ts", "types.ts", "workspace.ts", "youtubeAdapter.ts",
  ].map((file) => readFileSync(path.join("lib/server/acquisitionWorker", file), "utf8")).join("\n");
  assert.doesNotMatch(files, /cookies\.txt|--cookies|cookies-from-browser|youtube account|ownerUid|storageKey|shell:\s*true|exec\(|process\.env\.PATH|downloaded\.mp4/);
  assert.doesNotMatch(files, /NextRequest|NextResponse|@google-cloud|\bpg\b|postgres/i);
});

test("production route and protected workflows remain disconnected and unchanged", () => {
  const route = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.doesNotMatch(route, /acquisitionWorker|AcquisitionWorkerCore/);
  assert.doesNotMatch(workspace, /acquisitionWorker|AcquisitionWorkerCore/);
  assert.doesNotMatch(aiMv, /acquisitionWorker|AcquisitionWorkerCore/);
});

test("Production Terraform grants only private invocation and prefix-scoped control-object authority", () => {
  const service = readFileSync("infra/production/gcp/acquisition-worker.tf", "utf8");
  const identities = readFileSync("infra/production/gcp/identities.tf", "utf8");
  const wif = readFileSync("infra/production/gcp/vercel-wif.tf", "utf8");
  const variables = readFileSync("infra/production/gcp/variables.tf", "utf8");
  const storage = readFileSync("infra/production/gcp/media-storage.tf", "utf8");
  const infrastructure = `${service}\n${identities}\n${wif}\n${variables}\n${storage}`;

  assert.match(service, /max_instance_request_concurrency\s*=\s*1/);
  assert.match(service, /timeout\s*=\s*"300s"/);
  assert.match(service, /min_instance_count\s*=\s*0/);
  assert.match(service, /max_instance_count\s*=\s*2/);
  assert.match(service, /size_limit\s*=\s*"4Gi"/);
  assert.match(service, /member\s*=\s*"serviceAccount:\$\{google_service_account\.acquisition_invoker\.email\}"/);
  assert.match(wif, /vercel_acquisition_invoker_impersonator[\s\S]*roles\/iam\.workloadIdentityUser/);
  assert.match(wif, /attribute\.project_id\/\$\{local\.vercel_project_id\}/);
  assert.match(storage, /acquisition_worker_control_object_user[\s\S]*roles\/storage\.objectUser/);
  assert.match(storage, /resource\.type == 'storage\.googleapis\.com\/Object'/);
  assert.match(storage, /objects\/acquisition-control\/v1\//);
  assert.doesNotMatch(storage, /acquisition_worker[\s\S]*roles\/storage\.(?:admin|objectAdmin)/i);
  assert.doesNotMatch(infrastructure, /allUsers|allAuthenticatedUsers/);
  assert.doesNotMatch(service, /roles\/(?:storage|cloudsql|firebase|editor|owner)/i);
  assert.doesNotMatch(infrastructure, /google_service_account_key|private_key|credentials\s*=/i);
});
