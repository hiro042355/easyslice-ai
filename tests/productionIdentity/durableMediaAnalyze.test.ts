import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants, readFileSync } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import {
  AudioInspectionFailure,
  collectFfmpegBinaryDiagnostic,
  inspectAudioMedia,
  projectFfmpegSpawnFailure,
} from "../../lib/server/audioHighlightInspection";
import { decideCanonicalClipBoundary } from "../../lib/clipBoundary";
import { resolvePackagedFfmpeg } from "../../lib/server/packagedFfmpeg";
import {
  materializeFfmpegBinary,
  packagedFfmpegFilename,
} from "../../scripts/materializeFfmpegBinary.mjs";

const execFileAsync = promisify(execFile);

const page = readFileSync("app/workspace-flow/page.tsx", "utf8");
const rootPage = readFileSync("app/page.tsx", "utf8");
const analyze = readFileSync("app/api/audio-energy/route.ts", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("Creator Flow sends only server-issued durable media references to Analyze", () => {
  assert.match(page, /if \(!durableMedia\)[\s\S]*fetch\("\/api\/audio-energy", \{[\s\S]*JSON\.stringify\(\{ jobId: durableMedia\.jobId, mediaId: durableMedia\.mediaId \}\)/);
  assert.doesNotMatch(page, /audio-energy[\s\S]{0,300}(?:ownerUid|userId|storageKey)/);
});

test("root Creator Flow uses the same durable Analyze DTO", () => {
  const durableDto = /fetch\("\/api\/audio-energy", \{[\s\S]{0,250}headers: \{ "Content-Type": "application\/json" \}[\s\S]{0,250}JSON\.stringify\(\{ jobId: durableMedia\.jobId, mediaId: durableMedia\.mediaId \}\)/;
  assert.match(page, durableDto);
  assert.match(rootPage, durableDto);
  assert.match(rootPage, /if \(!durableMedia\)[\s\S]{0,200}Durable media registration is required before audio analysis/);
});

test("durable Analyze resolves owner-scoped Job and Media before GCS or filesystem access", () => {
  const ordered = [
    "requireAuthenticatedRequest(request)",
    "resolveOwnedJob(jobId, ownerUid)",
    "resolveOwnedMedia(mediaId, ownerUid)",
    "media.jobId !== jobId",
    "createJobTempDirectories(jobId)",
    "file(media.storageKey).download({ destination: inputPath })",
    "analyzeVideo(inputPath)",
  ];
  let prior = -1;
  for (const marker of ordered) {
    const position = analyze.indexOf(marker);
    assert.ok(position > prior, `${marker} must follow the prior authority boundary`);
    prior = position;
  }
});

test("Analyze keeps privacy-safe rejection and rejects client ownership or storage authority", () => {
  assert.match(analyze, /!media \|\| media\.jobId !== jobId[\s\S]*resource-not-found/);
  assert.doesNotMatch(analyze, /body\.(?:ownerUid|userId|storageKey)/);
  assert.match(analyze, /bucket\.file\(media\.storageKey\)\.download\(\{ destination: inputPath \}\)/);
});

test("missing durable references fail closed without legacy filesystem access", () => {
  assert.match(analyze, /if \(!durableRequest\)[\s\S]*durable-media-required[\s\S]*status: 400/);
  assert.doesNotMatch(analyze, /downloaded\.mp4|os\.tmpdir|node:os|\baccess\(/);
  assert.doesNotMatch(page, /audio-energy", durableMedia \?/);
});

test("malformed IDs fail before runtime, ownership, GCS, temp, or FFmpeg", () => {
  const validation = analyze.indexOf("!isUuid(jobId) || !isUuid(mediaId)");
  const runtime = analyze.indexOf("withProductionMediaRuntime", validation);
  assert.ok(validation > 0 && runtime > validation);
  assert.match(analyze.slice(validation, runtime), /invalid-resource[\s\S]*status: 400/);
});

test("Analyze uses argument arrays and cleans the isolated durable temp root", () => {
  assert.match(analyze, /resolvePackagedFfmpeg/);
  assert.match(analyze, /execFileAsync\(ffmpegExecutable\(\), \[/);
  assert.doesNotMatch(analyze, /spawn ffprobe|execFileAsync\("ffprobe"/);
  assert.doesNotMatch(analyze, /\bexec\s*\(/);
  assert.match(analyze, /finally \{[\s\S]*cleanupJobTempRoot\(jobId\)/);
});

test("Production build materializes only the audio route FFmpeg runtime asset", () => {
  assert.equal(packageJson.scripts.prebuild, "node scripts/materializeFfmpegBinary.mjs");
  assert.match(nextConfig, /"\/api\/audio-energy": \["\.\/node_modules\/\.nexcut-runtime\/ffmpeg\/ffmpeg\*"\]/);
  assert.doesNotMatch(nextConfig, /"\/api\/ai-mv|"\/ai-mv|"\/api\/\*"|"\/\*"/);
});

test("packaged FFmpeg resolver is deterministic and platform-specific", () => {
  const linux = resolvePackagedFfmpeg("/srv/app", "linux");
  const windows = resolvePackagedFfmpeg("C:\\app", "win32");
  assert.equal(linux.replaceAll("\\", "/"), "/srv/app/node_modules/.nexcut-runtime/ffmpeg/ffmpeg");
  assert.equal(windows.replaceAll("\\", "/"), "C:/app/node_modules/.nexcut-runtime/ffmpeg/ffmpeg.exe");
  assert.doesNotMatch(linux, /jobs|media|storage|uid|token/i);
});

test("build materialization copies the platform binary with executable mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-ffmpeg-package-"));
  const source = path.join(root, "source-ffmpeg");
  try {
    await writeFile(source, "fixture-binary");
    const target = await materializeFfmpegBinary({ sourcePath: source, projectRoot: root, platform: "linux" });
    assert.equal(path.basename(target), packagedFfmpegFilename("linux"));
    assert.equal(target, resolvePackagedFfmpeg(root, "linux"));
    await access(target, constants.F_OK | constants.X_OK);
    const diagnostic = await collectFfmpegBinaryDiagnostic(target);
    assert.equal(diagnostic.exists, true);
    assert.equal(diagnostic.xOk, true);
    if (process.platform !== "win32") assert.equal(diagnostic.executableBit, true);
    assert.match(readFileSync("scripts/materializeFfmpegBinary.mjs", "utf8"), /chmod\(targetPath, 0o755\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Analyze detects an audio stream and duration before calculating energy", () => {
  const inspection = analyze.indexOf("inspectAudioMedia(ffmpegExecutable(), inputPath)");
  const energyLoop = analyze.indexOf("for (let second = 0; second < duration");
  assert.ok(inspection > 0 && energyLoop > inspection);
  assert.match(analyze, /duration = inspection\.durationSeconds/);
  assert.match(analyze, /error instanceof AudioInspectionFailure/);
});

test("the packaged FFmpeg detects a 10-second AAC source and returns a bounded whole-media highlight", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-audio-analysis-"));
  const input = path.join(root, "music.mp4");
  try {
    await execFileAsync(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=10",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", input,
    ]);
    const inspection = await inspectAudioMedia(ffmpegPath, input);
    assert.equal(inspection.durationSeconds, 10);
    assert.equal(inspection.codec, "aac");
    assert.equal(inspection.sampleRateHz, 48000);

    const boundary = decideCanonicalClipBoundary({
      candidateKind: "audio-energy",
      anchorSecond: 0,
      sourceDurationSeconds: inspection.durationSeconds,
      evidence: [{ kind: "audio-window", second: inspection.durationSeconds }],
    });
    assert.deepEqual({ start: boundary.start, end: boundary.end }, { start: 0, end: 10 });

    const energy = await execFileAsync(ffmpegPath, [
      "-hide_banner", "-t", "10", "-i", input, "-af", "volumedetect", "-f", "null", "-",
    ]);
    assert.match(energy.stderr, /mean_volume:\s*-?\d+(?:\.\d+)? dB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio inspection distinguishes no-audio and malformed media from executable failure", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-audio-inspection-"));
  const silentVideo = path.join(root, "silent.mp4");
  const malformed = path.join(root, "malformed.mp4");
  try {
    await execFileAsync(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1",
      "-c:v", "libx264", "-an", "-y", silentVideo,
    ]);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(malformed, "not-media"));

    await assert.rejects(
      inspectAudioMedia(ffmpegPath, silentVideo),
      (error: unknown) => error instanceof AudioInspectionFailure && error.reason === "audio-stream-not-found",
    );
    await assert.rejects(
      inspectAudioMedia(ffmpegPath, malformed),
      (error: unknown) => error instanceof AudioInspectionFailure && error.reason === "media-inspection-failed",
    );
    await assert.rejects(
      inspectAudioMedia(path.join(root, "missing-ffmpeg"), malformed),
      (error: unknown) => error instanceof AudioInspectionFailure &&
        error.reason === "ffmpeg-binary-missing" &&
        error.diagnostic?.spawn?.code === "ENOENT" &&
        error.diagnostic.binary.exists === false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FFmpeg binary diagnostics expose only safe packaged metadata", async () => {
  assert.ok(ffmpegPath);
  const diagnostic = await collectFfmpegBinaryDiagnostic(ffmpegPath);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.pathClassification, "node_modules/ffmpeg-static");
  assert.equal(diagnostic.exists, true);
  assert.equal(diagnostic.statSucceeded, true);
  assert.equal(diagnostic.fOk, true);
  assert.equal(diagnostic.xOk, true);
  assert.ok((diagnostic.fileSize ?? 0) > 0);
  assert.doesNotMatch(serialized, /(?:Users|tmp|jobs|storageKey|ownerUid|token|cookie)/i);
  assert.doesNotMatch(serialized, new RegExp(ffmpegPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("spawn diagnostics preserve ENOENT and EACCES without leaking executable or media paths", () => {
  const missing = projectFfmpegSpawnFailure(Object.assign(new Error("private path"), {
    code: "ENOENT",
    errno: -4058,
    syscall: "spawn /private/node_modules/ffmpeg-static/ffmpeg",
  }));
  const denied = projectFfmpegSpawnFailure(Object.assign(new Error("private path"), {
    code: "EACCES",
    errno: -13,
    syscall: "spawn /private/node_modules/ffmpeg-static/ffmpeg",
  }));
  assert.deepEqual(missing, { code: "ENOENT", errno: -4058, syscall: "spawn" });
  assert.deepEqual(denied, { code: "EACCES", errno: -13, syscall: "spawn" });
  assert.doesNotMatch(JSON.stringify({ missing, denied }), /private|ffmpeg-static\/ffmpeg|media|token|uid/i);
});
