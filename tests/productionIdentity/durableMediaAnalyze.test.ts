import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const page = readFileSync("app/workspace-flow/page.tsx", "utf8");
const analyze = readFileSync("app/api/audio-energy/route.ts", "utf8");

test("Creator Flow sends only server-issued durable media references to Analyze", () => {
  assert.match(page, /fetch\("\/api\/audio-energy", durableMedia \? \{[\s\S]*JSON\.stringify\(\{ jobId: durableMedia\.jobId, mediaId: durableMedia\.mediaId \}\)/);
  assert.doesNotMatch(page, /audio-energy[\s\S]{0,300}(?:ownerUid|userId|storageKey)/);
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

test("legacy YouTube/import input remains available only when no durable request is supplied", () => {
  const durableBranch = analyze.indexOf("if (durableRequest)");
  const legacyBranch = analyze.indexOf('path.join(os.tmpdir(), "downloaded.mp4")');
  assert.ok(durableBranch > 0 && legacyBranch > durableBranch);
  assert.match(analyze, /if \(!request\.headers\.get\("content-type"\).*return undefined/);
});

test("Analyze uses argument arrays and cleans the isolated durable temp root", () => {
  assert.match(analyze, /import ffmpegPath from "ffmpeg-static"/);
  assert.match(analyze, /execFileAsync\(ffmpegExecutable\(\), \[/);
  assert.doesNotMatch(analyze, /spawn ffprobe|execFileAsync\("ffprobe"/);
  assert.doesNotMatch(analyze, /\bexec\s*\(/);
  assert.match(analyze, /finally \{[\s\S]*cleanupJobTempRoot\(jobId\)/);
});

test("Analyze detects an audio stream and duration before calculating energy", () => {
  const inspection = analyze.indexOf("const inspection = await execFileAsync");
  const audioDetection = analyze.indexOf("if (!audioMatch)");
  const durationValidation = analyze.indexOf("if (!Number.isFinite(duration)");
  const energyLoop = analyze.indexOf("for (let second = 0; second < duration");
  assert.ok(inspection > 0 && audioDetection > inspection);
  assert.ok(durationValidation > audioDetection && energyLoop > durationValidation);
  assert.match(analyze, /Audio:\\s\*\(\[\^,\\s\]\+\)/);
});

test("the packaged FFmpeg detects AAC music and produces audio-energy evidence", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-audio-analysis-"));
  const input = path.join(root, "music.mp4");
  try {
    await execFileAsync(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", input,
    ]);
    const inspection = await execFileAsync(ffmpegPath, [
      "-hide_banner", "-i", input, "-map", "0:a:0", "-t", "0.001", "-f", "null", "-",
    ]);
    assert.match(inspection.stderr, /Duration:\s*00:00:02/);
    assert.match(inspection.stderr, /Audio:\s*aac/);

    const energy = await execFileAsync(ffmpegPath, [
      "-hide_banner", "-t", "2", "-i", input, "-af", "volumedetect", "-f", "null", "-",
    ]);
    assert.match(energy.stderr, /mean_volume:\s*-?\d+(?:\.\d+)? dB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
