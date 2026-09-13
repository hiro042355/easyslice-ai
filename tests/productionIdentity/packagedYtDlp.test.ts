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
        stderrCaptureComplete: "YES",
        providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
        ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
        mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN",
        tokenContext: "UNKNOWN", tokenRetrievedByYtDlp: "UNKNOWN",
        tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
        tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
        tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
        relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
        tokenAttachedToOutboundRequest: "UNKNOWN",
        tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
        botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "UNKNOWN",
        mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
        hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", botCheckEvidenceStage: "UNKNOWN",
        botCheckEvidenceKind: "UNKNOWN", postRetrievalExternalRequestStage: "UNKNOWN",
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

test("bot-check evidence stage remains a closed deterministic category", () => {
  const cases = [
    ["ERROR: bot check before first external request: Sign in to confirm you're not a bot", "PRE_EXTERNAL_REQUEST_LEXICAL"],
    ["ERROR: player response: Sign in to confirm you're not a bot", "PLAYER_RESPONSE_LEXICAL"],
    ["ERROR: GVS response: Sign in to confirm you're not a bot", "GVS_RESPONSE_LEXICAL"],
    ["ERROR: media response: Sign in to confirm you're not a bot", "MEDIA_RESPONSE_LEXICAL"],
    ["ERROR: [youtube] abc: Sign in to confirm you're not a bot", "EXTRACTOR_LEXICAL"],
    ["Sign in to confirm you're not a bot", "UNKNOWN"],
  ] as const;
  for (const [stderr, expected] of cases) {
    assert.equal(extractClosedYtDlpStageTelemetry(stderr).botCheckEvidenceStage, expected);
  }
  assert.equal(extractClosedYtDlpStageTelemetry("unrelated failure").botCheckEvidenceStage, "UNKNOWN");
});

test("closed process markers distinguish observation from configuration without retaining source text", () => {
  const evidence = extractClosedYtDlpStageTelemetry([
    "Loaded youtubepot bgutil plugin",
    "Generating a GVS PO Token for mweb client",
    "Using EJS to solve JavaScript challenge",
    "Enumerating available video formats",
    "[download] Destination: closed-media",
    "[download] 12.5% of bounded media",
  ].join("\n"));
  assert.deepEqual({
    providerPluginDiscovered: evidence.providerPluginDiscovered,
    providerPluginActivated: evidence.providerPluginActivated,
    observedPlayerClient: evidence.observedPlayerClient,
    ejsActualUse: evidence.ejsActualUse,
    jsChallengeObserved: evidence.jsChallengeObserved,
    formatEnumerationObserved: evidence.formatEnumerationObserved,
    mediaRequestObserved: evidence.mediaRequestObserved,
    mediaBytesObserved: evidence.mediaBytesObserved,
  }, {
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "YES", observedPlayerClient: "MWEB",
    ejsActualUse: "YES", jsChallengeObserved: "YES", formatEnumerationObserved: "YES",
    mediaRequestObserved: "YES", mediaBytesObserved: "YES",
  });
  assert.deepEqual(extractClosedYtDlpStageTelemetry("mweb configured; bgutil configured"), {
    stderrCaptureComplete: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenRetrievedByYtDlp: "UNKNOWN", tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
    tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
    tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
    relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "UNKNOWN", mediaRequestReached: "UNKNOWN",
    selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN", hlsFragmentReached: "UNKNOWN",
    http403Stage: "UNKNOWN", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN",
  });
  assert.equal(extractClosedYtDlpStageTelemetry("client may be mweb or web").observedPlayerClient, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(evidence), /closed-media|bounded media/i);
});

test("closed stage telemetry projects only directly evidenced provider and 403 stages", () => {
  assert.deepEqual(extractClosedYtDlpStageTelemetry("Retrieved a gvs PO Token for mweb client\nERROR: unable to download video data: HTTP Error 403"), {
    stderrCaptureComplete: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "YES", observedPlayerClient: "MWEB",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "YES", mediaBytesObserved: "UNKNOWN",
    tokenContext: "GVS", tokenRetrievedByYtDlp: "YES", tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
    tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
    tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
    relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "YES",
    mediaRequestReached: "YES", selectedTransport: "DIRECT", hlsManifestReached: "UNKNOWN",
    hlsFragmentReached: "UNKNOWN", http403Stage: "MEDIA", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN",
  });
  assert.equal(extractClosedYtDlpStageTelemetry("ERROR: gvs request: HTTP Error 403").http403Stage, "GVS");
  assert.equal(extractClosedYtDlpStageTelemetry("ERROR: player request: HTTP Error 403").http403Stage, "PLAYER");
  assert.deepEqual(extractClosedYtDlpStageTelemetry("ERROR: HTTP Error 403"), {
    stderrCaptureComplete: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN",
    tokenContext: "UNKNOWN", tokenRetrievedByYtDlp: "UNKNOWN", tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
    tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
    tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
    relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "UNKNOWN",
    mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
    hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN",
  });
  const serialized = JSON.stringify(extractClosedYtDlpStageTelemetry(
    "Retrieved a subs PO Token for mweb client\nprivate URL credential filesystem path",
  ));
  assert.equal(JSON.parse(serialized).tokenContext, "SUBS");
  assert.doesNotMatch(serialized, /private|URL|credential|filesystem|path/);
});

test("closed HLS telemetry distinguishes manifest and fragment 403 without retaining authority", () => {
  const manifest = extractClosedYtDlpStageTelemetry("Downloading m3u8 information\nERROR: HLS manifest HTTP Error 403");
  assert.deepEqual(manifest, { stderrCaptureComplete: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenRetrievedByYtDlp: "UNKNOWN", tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
    tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
    tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
    relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN",
    gvsRequestReached: "UNKNOWN", mediaRequestReached: "UNKNOWN", selectedTransport: "HLS",
    hlsManifestReached: "YES", hlsFragmentReached: "UNKNOWN", http403Stage: "HLS_MANIFEST", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN" });
  const fragment = extractClosedYtDlpStageTelemetry("[hlsnative] Downloading m3u8 manifest\nfragment 1 HTTP Error 403");
  assert.deepEqual(fragment, { stderrCaptureComplete: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenRetrievedByYtDlp: "UNKNOWN", tokenSelectionObserved: "UNKNOWN", tokenSelectionCoverage: "UNKNOWN",
    tokenApplicationObserved: "UNKNOWN", tokenApplicationCoverage: "UNKNOWN", tokenApplicationTarget: "UNKNOWN",
    tokenApplicationTemporalRelation: "UNKNOWN", relevantOutboundRequestObserved: "UNKNOWN",
    relevantOutboundRequestCoverage: "UNKNOWN", tokenAppliedToRelevantOutboundRequest: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "YES", mediaBytesObserved: "UNKNOWN",
    gvsRequestReached: "YES", mediaRequestReached: "YES", selectedTransport: "HLS",
    hlsManifestReached: "YES", hlsFragmentReached: "YES", http403Stage: "HLS_FRAGMENT", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN" });
  assert.equal(extractClosedYtDlpStageTelemetry("[dashsegments] Downloading MPD manifest").selectedTransport, "DASH");
  const serialized = JSON.stringify(fragment);
  assert.doesNotMatch(serialized, /https?:|m3u8\.example|video.?id|poToken|tokenHash|accessToken|cookie|credential|header|path|stdout|rawStderr/i);
});

test("instrumented PO-token events require terminal coverage and preserve partial authority", () => {
  const event = (phase: string, context = "UNKNOWN", target = "UNKNOWN", coverage = "UNKNOWN", observed = "UNKNOWN", applied = "UNKNOWN") =>
    `[debug] NEXCUT_POT_EVENT phase=${phase} context=${context} target=${target} coverage=${coverage} observed=${observed} applied=${applied}`;
  const terminal = (domain: "SELECTION" | "APPLICATION" | "REQUEST", coverage: "COMPLETE" | "INCOMPLETE") =>
    event(`${domain}_COVERAGE_TERMINAL`, "UNKNOWN", "UNKNOWN", coverage);

  const missingSelectionTerminal = extractClosedYtDlpStageTelemetry("");
  assert.equal(missingSelectionTerminal.tokenSelectionObserved, "UNKNOWN");
  assert.equal(missingSelectionTerminal.tokenSelectionCoverage, "UNKNOWN");
  const noSelection = extractClosedYtDlpStageTelemetry(terminal("SELECTION", "COMPLETE"));
  assert.equal(noSelection.tokenSelectionObserved, "NO");
  assert.equal(noSelection.tokenSelectionCoverage, "COMPLETE");
  const partialSelection = extractClosedYtDlpStageTelemetry(terminal("SELECTION", "INCOMPLETE"));
  assert.equal(partialSelection.tokenSelectionObserved, "UNKNOWN");
  assert.equal(partialSelection.tokenSelectionCoverage, "INCOMPLETE");

  const selectedWithoutApplication = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
    terminal("SELECTION", "COMPLETE"),
    terminal("APPLICATION", "COMPLETE"),
  ].join("\n"));
  assert.equal(selectedWithoutApplication.tokenSelectionObserved, "YES");
  assert.equal(selectedWithoutApplication.tokenApplicationObserved, "NO");

  const selectedWithoutCompleteApplicationCoverage = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
    terminal("SELECTION", "COMPLETE"),
    terminal("APPLICATION", "INCOMPLETE"),
  ].join("\n"));
  assert.equal(selectedWithoutCompleteApplicationCoverage.tokenSelectionObserved, "YES");
  assert.equal(selectedWithoutCompleteApplicationCoverage.tokenApplicationObserved, "UNKNOWN");

  assert.equal(extractClosedYtDlpStageTelemetry("").tokenApplicationObserved, "UNKNOWN");
  const noApplication = extractClosedYtDlpStageTelemetry(terminal("APPLICATION", "COMPLETE"));
  assert.equal(noApplication.tokenApplicationObserved, "NO");
  assert.equal(noApplication.tokenApplicationTemporalRelation, "NOT_OBSERVED");
  assert.equal(extractClosedYtDlpStageTelemetry("").relevantOutboundRequestObserved, "UNKNOWN");
  assert.equal(
    extractClosedYtDlpStageTelemetry(terminal("REQUEST", "COMPLETE")).relevantOutboundRequestObserved,
    "NO",
  );

  const beforeBotCheck = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
    event("APPLICATION", "PLAYER", "PLAYER", "UNKNOWN", "YES", "YES"),
    event("REQUEST_PRE_DISPATCH", "PLAYER", "PLAYER", "UNKNOWN", "YES", "YES"),
    terminal("SELECTION", "COMPLETE"), terminal("APPLICATION", "COMPLETE"), terminal("REQUEST", "INCOMPLETE"),
    "ERROR: [youtube] Sign in to confirm you're not a bot",
  ].join("\n"));
  assert.equal(beforeBotCheck.tokenSelectionObserved, "YES");
  assert.equal(beforeBotCheck.tokenApplicationObserved, "YES");
  assert.equal(beforeBotCheck.tokenApplicationTarget, "PLAYER");
  assert.equal(beforeBotCheck.tokenApplicationTemporalRelation, "BEFORE_BOT_CHECK");
  assert.equal(beforeBotCheck.relevantOutboundRequestObserved, "YES");
  assert.equal(beforeBotCheck.tokenAppliedToRelevantOutboundRequest, "YES");
  assert.equal(beforeBotCheck.tokenAttachedToOutboundRequest, "YES");
});

test("instrumented event conflicts, impossible order, and malformed values fail closed", () => {
  const event = (phase: string, context = "UNKNOWN", target = "UNKNOWN", coverage = "UNKNOWN", observed = "UNKNOWN", applied = "UNKNOWN") =>
    `[debug] NEXCUT_POT_EVENT phase=${phase} context=${context} target=${target} coverage=${coverage} observed=${observed} applied=${applied}`;
  const terminal = (domain: "SELECTION" | "APPLICATION" | "REQUEST", coverage: "COMPLETE" | "INCOMPLETE" = "COMPLETE") =>
    event(`${domain}_COVERAGE_TERMINAL`, "UNKNOWN", "UNKNOWN", coverage);

  const conflictingSelection = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "YES"),
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "NO"),
    terminal("SELECTION"),
  ].join("\n"));
  assert.equal(conflictingSelection.tokenSelectionObserved, "UNKNOWN");
  assert.equal(conflictingSelection.tokenSelectionCoverage, "UNKNOWN");
  const selectionConflictPropagation = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "YES"),
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "NO"),
    event("APPLICATION", "GVS", "MEDIA", "UNKNOWN", "YES", "YES"),
    event("REQUEST_PRE_DISPATCH", "GVS", "MEDIA", "UNKNOWN", "YES", "YES"),
    terminal("SELECTION"), terminal("APPLICATION"), terminal("REQUEST", "INCOMPLETE"),
  ].join("\n"));
  assert.equal(selectionConflictPropagation.tokenApplicationObserved, "UNKNOWN");
  assert.equal(selectionConflictPropagation.tokenAppliedToRelevantOutboundRequest, "UNKNOWN");

  const conflictingTargets = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
    event("APPLICATION", "PLAYER", "PLAYER", "UNKNOWN", "YES", "YES"),
    event("APPLICATION", "PLAYER", "GVS", "UNKNOWN", "YES", "YES"),
    terminal("APPLICATION"),
  ].join("\n"));
  assert.equal(conflictingTargets.tokenApplicationObserved, "UNKNOWN");
  assert.equal(conflictingTargets.tokenApplicationTarget, "UNKNOWN");

  const identicalDuplicate = extractClosedYtDlpStageTelemetry([
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "YES"),
    event("APPLICATION", "GVS", "MEDIA", "UNKNOWN", "YES", "YES"),
    event("APPLICATION", "GVS", "MEDIA", "UNKNOWN", "YES", "YES"),
    terminal("APPLICATION"),
  ].join("\n"));
  assert.equal(identicalDuplicate.tokenApplicationObserved, "YES");
  assert.equal(identicalDuplicate.tokenApplicationTarget, "MEDIA");

  const afterClosure = extractClosedYtDlpStageTelemetry([
    terminal("SELECTION"), event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
  ].join("\n"));
  assert.equal(afterClosure.tokenSelectionObserved, "UNKNOWN");
  const impossibleOrder = extractClosedYtDlpStageTelemetry([
    event("APPLICATION", "PLAYER", "PLAYER", "UNKNOWN", "YES", "YES"),
    event("SELECTION", "PLAYER", "PLAYER", "UNKNOWN", "YES"),
    terminal("APPLICATION"),
  ].join("\n"));
  assert.equal(impossibleOrder.tokenApplicationObserved, "UNKNOWN");

  const malformedAndUnknown = extractClosedYtDlpStageTelemetry([
    "[debug] NEXCUT_POT_EVENT phase=APPLICATION context=GVS target=MEDIA coverage=UNKNOWN observed=YES applied=secret-value",
    "[debug] NEXCUT_POT_EVENT phase=UNRECOGNIZED context=GVS target=MEDIA coverage=UNKNOWN observed=YES applied=YES",
    event("SELECTION", "GVS", "GVS", "UNKNOWN", "YES"),
    terminal("SELECTION"),
  ].join("\n"));
  assert.equal(malformedAndUnknown.tokenSelectionObserved, "UNKNOWN");
  assert.equal(malformedAndUnknown.tokenApplicationObserved, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(malformedAndUnknown), /secret-value|UNRECOGNIZED/);
});

test("instrumentation patch places events only at authoritative lifecycle boundaries", () => {
  const patch = readFileSync("worker/acquisition/yt-dlp-token-observation.patch", "utf8");
  const playerAssignment = patch.indexOf("yt_query['serviceIntegrityDimensions'] = {'poToken': po_token}");
  const playerApplication = patch.indexOf("'APPLICATION', 'PLAYER', 'PLAYER'", playerAssignment);
  const finalPlayerContext = patch.indexOf("encrypted_context=encrypted_context))", playerApplication);
  const playerPreDispatch = patch.indexOf("'REQUEST_PRE_DISPATCH', 'PLAYER', 'PLAYER'", finalPlayerContext);
  const playerDispatch = patch.indexOf("return self._extract_response(", playerPreDispatch);
  assert.ok(playerAssignment >= 0 && playerAssignment < playerApplication);
  assert.ok(playerApplication < finalPlayerContext && finalPlayerContext < playerPreDispatch);
  assert.ok(playerPreDispatch < playerDispatch);

  const directStart = patch.indexOf("fmt_url = update_url_query(fmt_url, {'pot': po_token})");
  const directEnd = patch.indexOf("fmt['url'] = fmt_url", directStart);
  assert.ok(directStart >= 0 && directEnd > directStart);
  assert.doesNotMatch(patch.slice(directStart, directEnd), /REQUEST_PRE_DISPATCH/);
  assert.match(patch, /REQUEST_COVERAGE_TERMINAL[^\n]*'UNKNOWN', 'UNKNOWN', 'INCOMPLETE'/);
  assert.match(patch, /SELECTION_COVERAGE_TERMINAL[^\n]*'UNKNOWN', 'UNKNOWN', 'COMPLETE'/);
  assert.match(patch, /APPLICATION_COVERAGE_TERMINAL[^\n]*'UNKNOWN', 'UNKNOWN', 'COMPLETE'/);
});

test("runner projects authoritative markers split inside multiple stderr chunks", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const secret = "private-token-value";
    const split = fakeSpawn((child) => {
      child.stderr.write("[debug] [youtube] abc: Retrie");
      child.stderr.write(`ved a player PO Token for mweb client: ${secret}\n[youtube] abc: Down`);
      child.stderr.end("loading mweb player API JSON\n");
      child.emit("close", 1);
    });
    const error = await captureFailure(runPackagedYtDlp([], {
      projectRoot: root, timeoutMs: 100, spawnImpl: split.spawnImpl,
    }));
    assert.equal(error.diagnostic.closedStageTelemetry?.stderrCaptureComplete, "YES");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenRetrievedByYtDlp, "YES");
    assert.equal(error.diagnostic.closedStageTelemetry?.postRetrievalExternalRequestStage, "PLAYER_API");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenAttachedToOutboundRequest, "UNKNOWN");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenConsumedByYtDlp, "UNKNOWN");
    assert.doesNotMatch(JSON.stringify(error), /private-token-value|Downloading mweb player API JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner flushes an authoritative final stderr marker without a trailing newline", async () => {
  const root = await createRoot();
  try {
    await materializeFixture(root);
    const secret = "private-output-name";
    const tail = fakeSpawn((child) => {
      child.stderr.write("[debug] [youtube] abc: Retrieved a player PO Token for mweb client\n");
      child.stderr.end(`[download] Destination: ${secret}`);
      child.emit("close", 1);
    });
    const error = await captureFailure(runPackagedYtDlp([], {
      projectRoot: root, timeoutMs: 100, spawnImpl: tail.spawnImpl,
    }));
    assert.equal(error.diagnostic.closedStageTelemetry?.stderrCaptureComplete, "YES");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenRetrievedByYtDlp, "YES");
    assert.equal(error.diagnostic.closedStageTelemetry?.postRetrievalExternalRequestStage, "MEDIA");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenAttachedToOutboundRequest, "UNKNOWN");
    assert.equal(error.diagnostic.closedStageTelemetry?.tokenConsumedByYtDlp, "UNKNOWN");
    assert.doesNotMatch(JSON.stringify(error), /private-output-name|Destination:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.equal(stdoutLimited.diagnostic.closedStageTelemetry?.stderrCaptureComplete, "YES");

    const stderr = fakeSpawn((child) => child.stderr.write(Buffer.alloc(9)));
    const stderrLimited = await captureFailure(runPackagedYtDlp([], { projectRoot: root, timeoutMs: 100, outputLimitBytes: 8, spawnImpl: stderr.spawnImpl }));
    assert.equal(stderrLimited.diagnostic.stdoutLimitExceeded, false);
    assert.equal(stderrLimited.diagnostic.stderrLimitExceeded, true);
    assert.equal(stderrLimited.diagnostic.closedStageTelemetry?.stderrCaptureComplete, "NO");
    assert.equal(stderrLimited.diagnostic.closedStageTelemetry?.postRetrievalExternalRequestStage, "UNKNOWN");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
