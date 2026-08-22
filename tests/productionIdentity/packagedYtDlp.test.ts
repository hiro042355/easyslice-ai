import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { constants, readFileSync } from "node:fs";
import { access, chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  createSafeYtDlpFailureLog,
  PACKAGED_YT_DLP_VERSION,
  classifyYtDlpStderr,
  extractClosedYtDlpStageTelemetry,
  extractSafeYtDlpStderrSignature,
  packagedYtDlpTarget,
  probePackagedYtDlpVersion,
  resolvePackagedYtDlp,
  runPackagedYtDlp,
  YtDlpProcessFailure,
  type YtDlpSpawn,
} from "../../lib/server/packagedYtDlp";
import { resolvePackagedFfmpeg } from "../../lib/server/packagedFfmpeg";
import {
  materializeYtDlpBinary,
  packagedYtDlpPath,
  sha256,
  YT_DLP_ASSET,
  YT_DLP_SHA256,
  YT_DLP_SOURCE,
  YT_DLP_VERSION,
} from "../../scripts/materializeYtDlpBinary.mjs";

const createRoot = () => mkdtemp(path.join(os.tmpdir(), "nexcut-yt-dlp-"));

const materializeFixture = async (root: string, bytes = Buffer.from("fixture-yt-dlp")) => {
  const target = await materializeYtDlpBinary({
    projectRoot: root,
    artifact: bytes,
    expectedSha256: sha256(bytes),
  });
  return target;
};

const fakeSpawn = (run: (child: EventEmitter & { stdout: PassThrough; stderr: PassThrough }) => void) => {
  const calls: Array<{ executable: string; args: readonly string[]; options: unknown }> = [];
  const spawnImpl: YtDlpSpawn = (executable, args, options) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => {
        queueMicrotask(() => child.emit("close", null));
        return true;
      },
    });
    calls.push({ executable, args, options });
    queueMicrotask(() => run(child));
    return child;
  };
  return { calls, spawnImpl };
};

test("pinned yt-dlp authority is exact and build wiring has no runtime download", () => {
  assert.equal(YT_DLP_VERSION, "2026.03.13");
  assert.equal(PACKAGED_YT_DLP_VERSION, YT_DLP_VERSION);
  assert.equal(YT_DLP_ASSET, "yt-dlp_linux");
  assert.equal(YT_DLP_SHA256, "b15210c7791b8d473f8373f150a014194dbd7702ec4dd507e565411096a3284c");
  assert.equal(YT_DLP_SOURCE, `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux`);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts.prebuild, "node scripts/materializeFfmpegBinary.mjs && node scripts/materializeYtDlpBinary.mjs");
});

test("selected production artifact is standalone ELF and has no Python shebang", async () => {
  const artifactPath = process.env.NEXCUT_TEST_YT_DLP_LINUX;
  if (!artifactPath) return;
  const bytes = await readFile(artifactPath);
  assert.deepEqual([...bytes.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46]);
  assert.notEqual(bytes.subarray(0, 64).toString("utf8").startsWith("#!/usr/bin/env python3"), true);
  assert.equal(sha256(bytes), YT_DLP_SHA256);
});

const captureFailure = async (promise: Promise<unknown>): Promise<YtDlpProcessFailure> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof YtDlpProcessFailure);
    return error;
  }
  assert.fail("expected yt-dlp failure");
};

test("materializer verifies integrity, writes the deterministic target, and applies executable mode", async () => {
  const root = await createRoot();
  try {
    const bytes = Buffer.from("deterministic-linux-standalone-fixture");
    const target = await materializeFixture(root, bytes);
    assert.equal(target, packagedYtDlpPath(root));
    assert.equal(target, packagedYtDlpTarget(root));
    assert.deepEqual(await readFile(target), bytes);
    const metadata = await stat(target);
    assert.equal(metadata.isFile(), true);
    if (process.platform !== "win32") assert.equal(metadata.mode & 0o111, 0o111);
    await access(target, constants.F_OK | constants.X_OK);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("materializer fails closed on SHA-256 mismatch without publishing an artifact", async () => {
  const root = await createRoot();
  try {
    await assert.rejects(
      materializeYtDlpBinary({ projectRoot: root, artifact: Buffer.from("tampered") }),
      /yt-dlp-integrity-mismatch/,
    );
    await assert.rejects(stat(packagedYtDlpTarget(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolver accepts only the deterministic executable and never falls back to PATH", async () => {
  const root = await createRoot();
  try {
    await assert.rejects(resolvePackagedYtDlp(root), (error: unknown) =>
      error instanceof YtDlpProcessFailure && error.reason === "yt-dlp-missing");
    const target = await materializeFixture(root);
    assert.equal(await resolvePackagedYtDlp(root), target);
    if (process.platform !== "win32") {
      await chmod(target, 0o644);
      await assert.rejects(resolvePackagedYtDlp(root), (error: unknown) =>
        error instanceof YtDlpProcessFailure && error.reason === "yt-dlp-not-executable");
    }
    const implementation = await readFile("lib/server/packagedYtDlp.ts", "utf8");
    assert.doesNotMatch(implementation, /\bPATH\b|which\s+yt-dlp|where\s+yt-dlp|spawn\(["']yt-dlp/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("version probe uses argument-array spawn, shell false, and canonical packaged FFmpeg", async () => {
  const root = await createRoot();
  try {
    const target = await materializeFixture(root);
    const fake = fakeSpawn((child) => {
      child.stdout.end(`${YT_DLP_VERSION}\n`);
      child.stderr.end();
      child.emit("close", 0);
    });
    assert.equal(await probePackagedYtDlpVersion(root, fake.spawnImpl), YT_DLP_VERSION);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]?.executable, target);
    assert.deepEqual(fake.calls[0]?.args, ["--ffmpeg-location", resolvePackagedFfmpeg(root), "--version"]);
    assert.deepEqual(fake.calls[0]?.options, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner enforces timeout, cancellation, and bounded output", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const timeout = fakeSpawn(() => undefined);
    await assert.rejects(
      runPackagedYtDlp([], { projectRoot: root, timeoutMs: 1, spawnImpl: timeout.spawnImpl }),
      (error: unknown) => error instanceof YtDlpProcessFailure && error.reason === "yt-dlp-timeout",
    );

    const controller = new AbortController();
    controller.abort();
    const cancelled = fakeSpawn(() => undefined);
    await assert.rejects(
      runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, signal: controller.signal, spawnImpl: cancelled.spawnImpl }),
      (error: unknown) => error instanceof YtDlpProcessFailure && error.reason === "yt-dlp-cancelled",
    );

    const excessive = fakeSpawn((child) => child.stdout.write(Buffer.alloc(9)));
    await assert.rejects(
      runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, outputLimitBytes: 8, spawnImpl: excessive.spawnImpl }),
      (error: unknown) => error instanceof YtDlpProcessFailure && error.reason === "yt-dlp-output-limit",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner exposes only closed safe failure reasons", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const failed = fakeSpawn((child) => child.emit("error", Object.assign(new Error("private media path"), { code: "ENOENT" })));
    await assert.rejects(
      runPackagedYtDlp(["private-media-value"], { projectRoot: root, timeoutMs: 100, spawnImpl: failed.spawnImpl }),
      (error: unknown) => error instanceof YtDlpProcessFailure &&
        error.message === "yt-dlp-spawn-failed" &&
        !JSON.stringify(error).includes("private-media-value"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner preserves safe exit metadata and classifies bounded stderr without retaining it", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const remoteId = "sensitiveVideoId";
    const token = "credential-secret-value";
    const tempPath = "/tmp/nexcut/jobs/private-job/input/youtube-source.mp4";
    const failed = fakeSpawn((child) => {
      child.stderr.end(`ERROR: Sign in to confirm you're not a bot ${remoteId} ${token} ${tempPath}`);
      child.emit("close", 7, "SIGTERM");
    });
    const error = await captureFailure(runPackagedYtDlp([], {
      projectRoot: root,
      timeoutMs: 100,
      spawnImpl: failed.spawnImpl,
    }));
    assert.equal(error.reason, "youtube-bot-check");
    assert.deepEqual(error.diagnostic, {
      exitCode: 7,
      signal: "SIGTERM",
      timedOut: false,
      aborted: false,
      stdoutLimitExceeded: false,
      stderrLimitExceeded: false,
      stderrSignature: extractSafeYtDlpStderrSignature(`ERROR: Sign in to confirm you're not a bot ${remoteId} ${token} ${tempPath}`),
      closedStageTelemetry: {
        tokenContext: "UNKNOWN", tokenConsumedByYtDlp: "UNKNOWN", gvsRequestReached: "UNKNOWN",
        mediaRequestReached: "UNKNOWN", http403Stage: "UNKNOWN",
      },
    });
    const projected = JSON.stringify(error);
    assert.doesNotMatch(projected, new RegExp(remoteId));
    assert.doesNotMatch(projected, new RegExp(token));
    assert.doesNotMatch(projected, /private-job|youtube-source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("safe stderr signature projects allowlisted structure only", () => {
  const remoteId = "privateVideoId";
  const secret = "credential-secret-value";
  const pathValue = "/tmp/nexcut/jobs/private-job/input/identity.mp4";
  const signature = extractSafeYtDlpStderrSignature([
    `WARNING: JavaScript remote components failed for player ${remoteId}`,
    `ERROR: HTTP Error 403: signature nsig extractor unable to write ${pathValue} ${secret}`,
    "ERROR: ffmpeg merge failed with network status 503",
  ].join("\n"));
  assert.deepEqual(signature, {
    lineCount: 3,
    prefix: "warning",
    beginsWithYtDlpError: false,
    multipleErrorLines: true,
    warningBeforeError: true,
    keywords: {
      error: true,
      warning: true,
      httpError: true,
      unable: true,
      failed: true,
      requestedFormat: false,
      extractor: true,
      signature: true,
      javascript: true,
      nsig: true,
      player: true,
      remoteComponents: true,
      ffmpeg: true,
      merge: true,
      write: true,
      permission: false,
      network: true,
      http403: true,
      http429: false,
      http5xx: true,
    },
  });
  const projected = JSON.stringify(signature);
  assert.doesNotMatch(projected, new RegExp(remoteId));
  assert.doesNotMatch(projected, new RegExp(secret));
  assert.doesNotMatch(projected, /private-job|identity\.mp4/);
});

test("safe failure log retains every approved field and no arbitrary failure text", () => {
  const videoId = "privateVideoId";
  const uid = "privateOwnerUid";
  const token = "credential-secret-value";
  const storageKey = "jobs/private-job/input/private-media.mp4";
  const tempPath = "/tmp/nexcut/jobs/private-job/input/youtube-source.mp4";
  const rawStderr = [
    `WARNING: JavaScript remote components player nsig ${videoId}`,
    `ERROR: HTTP Error 403 429 503: signature extractor unable failed requested format`,
    `ffmpeg merge write permission network ${uid} ${token} ${storageKey} ${tempPath}`,
  ].join("\n");
  const error = new YtDlpProcessFailure("unknown-yt-dlp-failure", {
    exitCode: 7,
    signal: "SIGTERM",
    timedOut: false,
    aborted: false,
    stdoutLimitExceeded: true,
    stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(rawStderr),
  });
  const entry = createSafeYtDlpFailureLog(error, true);

  assert.deepEqual(entry, {
    event: "youtube-ingest-yt-dlp-failure",
    errorCode: "unknown-yt-dlp-failure",
    runtimeVersionMatch: true,
    exitCode: 7,
    signal: "SIGTERM",
    stderrLineCount: 3,
    errorPrefixPresent: false,
    warningPrefixPresent: true,
    timedOut: false,
    aborted: false,
    stdoutLimitExceeded: true,
    stderrLimitExceeded: false,
    hasError: true,
    hasWarning: true,
    hasHttpError: true,
    hasUnable: true,
    hasFailed: true,
    hasRequestedFormat: true,
    hasExtractor: true,
    hasSignature: true,
    hasJavascript: true,
    hasNsig: true,
    hasPlayer: true,
    hasRemoteComponents: true,
    hasFfmpeg: true,
    hasMerge: true,
    hasWrite: true,
    hasPermission: true,
    hasNetwork: true,
    has403: true,
    has429: true,
    has5xx: true,
  });
  assert.deepEqual(Object.keys(entry), [
    "event", "errorCode", "runtimeVersionMatch", "exitCode", "signal", "stderrLineCount",
    "errorPrefixPresent", "warningPrefixPresent", "timedOut", "aborted", "stdoutLimitExceeded",
    "stderrLimitExceeded", "hasError", "hasWarning", "hasHttpError", "hasUnable", "hasFailed",
    "hasRequestedFormat", "hasExtractor", "hasSignature", "hasJavascript", "hasNsig", "hasPlayer",
    "hasRemoteComponents", "hasFfmpeg", "hasMerge", "hasWrite", "hasPermission", "hasNetwork",
    "has403", "has429", "has5xx",
  ]);
  const serialized = JSON.stringify(entry);
  for (const prohibited of [videoId, uid, token, storageKey, tempPath, "youtube-source.mp4"]) {
    assert.doesNotMatch(serialized, new RegExp(prohibited.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(serialized, /message|command|arguments|canonicalUrl/i);
});

test("safe stderr signature preserves empty and unknown fallback without arbitrary text", () => {
  assert.deepEqual(extractSafeYtDlpStderrSignature(""), {
    lineCount: 0,
    prefix: "empty",
    beginsWithYtDlpError: false,
    multipleErrorLines: false,
    warningBeforeError: false,
    keywords: Object.fromEntries([
      "error", "warning", "httpError", "unable", "failed", "requestedFormat", "extractor", "signature",
      "javascript", "nsig", "player", "remoteComponents", "ffmpeg", "merge", "write", "permission",
      "network", "http403", "http429", "http5xx",
    ].map((key) => [key, false])),
  });
  const arbitrary = "opaque remote text with private identifiers";
  const signature = extractSafeYtDlpStderrSignature(arbitrary);
  assert.equal(signature.prefix, "other");
  assert.equal(signature.lineCount, 1);
  assert.doesNotMatch(JSON.stringify(signature), /opaque|private identifiers/);
  assert.equal(classifyYtDlpStderr(arbitrary), "unknown-yt-dlp-failure");
});

test("classifier maps only deterministic safe stderr categories", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["Sign in to confirm you're not a bot", "youtube-bot-check"],
    ["Sign in to view this video", "youtube-sign-in-required"],
    ["Video unavailable", "video-unavailable"],
    ["This is a private video", "private-video"],
    ["This video is age-restricted", "age-restricted"],
    ["This video is not available in your country", "region-restricted"],
    ["This upcoming live event will begin soon", "live-stream-unsupported"],
    ["Unable to download playlist data", "playlist-unsupported"],
    ["Requested format is not available", "format-unavailable"],
    ["ffmpeg is not found", "ffmpeg-unavailable"],
    ["Connection reset by peer", "network-failure"],
    ["Unable to extract signature", "extractor-failure"],
    ["Permission denied", "permission-failure"],
    ["Unable to open output for writing", "output-path-failure"],
    ["unrecognized future failure", "unknown-yt-dlp-failure"],
  ];
  for (const [stderr, expected] of cases) assert.equal(classifyYtDlpStderr(stderr), expected);
});

test("closed stage telemetry projects only directly evidenced provider and 403 stages", () => {
  assert.deepEqual(extractClosedYtDlpStageTelemetry("Retrieved a gvs PO Token for mweb client\nERROR: unable to download video data: HTTP Error 403"), {
    tokenContext: "GVS", tokenConsumedByYtDlp: "YES", gvsRequestReached: "YES",
    mediaRequestReached: "YES", http403Stage: "MEDIA",
  });
  assert.equal(extractClosedYtDlpStageTelemetry("ERROR: gvs request: HTTP Error 403").http403Stage, "GVS");
  assert.equal(extractClosedYtDlpStageTelemetry("ERROR: player request: HTTP Error 403").http403Stage, "PLAYER");
  assert.deepEqual(extractClosedYtDlpStageTelemetry("ERROR: HTTP Error 403"), {
    tokenContext: "UNKNOWN", tokenConsumedByYtDlp: "UNKNOWN", gvsRequestReached: "UNKNOWN",
    mediaRequestReached: "UNKNOWN", http403Stage: "UNKNOWN",
  });
  const serialized = JSON.stringify(extractClosedYtDlpStageTelemetry(
    "Retrieved a subs PO Token for mweb client\nprivate URL credential filesystem path",
  ));
  assert.equal(JSON.parse(serialized).tokenContext, "SUBS");
  assert.doesNotMatch(serialized, /private|URL|credential|filesystem|path/);
});

test("runner distinguishes timeout, abort, stdout limit, and stderr limit diagnostics", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const timeout = fakeSpawn(() => undefined);
    const timedOut = await captureFailure(runPackagedYtDlp([], { projectRoot: root, timeoutMs: 1, spawnImpl: timeout.spawnImpl }));
    assert.equal(timedOut.reason, "yt-dlp-timeout");
    assert.equal(timedOut.diagnostic.timedOut, true);

    const controller = new AbortController();
    controller.abort();
    const abort = fakeSpawn(() => undefined);
    const aborted = await captureFailure(runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, signal: controller.signal, spawnImpl: abort.spawnImpl }));
    assert.equal(aborted.reason, "yt-dlp-cancelled");
    assert.equal(aborted.diagnostic.aborted, true);

    const stdout = fakeSpawn((child) => child.stdout.write(Buffer.alloc(9)));
    const stdoutLimited = await captureFailure(runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, outputLimitBytes: 8, spawnImpl: stdout.spawnImpl }));
    assert.equal(stdoutLimited.diagnostic.stdoutLimitExceeded, true);
    assert.equal(stdoutLimited.diagnostic.stderrLimitExceeded, false);

    const stderr = fakeSpawn((child) => child.stderr.write(Buffer.alloc(9)));
    const stderrLimited = await captureFailure(runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, outputLimitBytes: 8, spawnImpl: stderr.spawnImpl }));
    assert.equal(stderrLimited.diagnostic.stdoutLimitExceeded, false);
    assert.equal(stderrLimited.diagnostic.stderrLimitExceeded, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
