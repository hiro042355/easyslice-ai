import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { parseSubtitleText, projectTimedTextForHighlight } from "../../lib/client/subtitleState";
import { extractTranscriptAudio } from "../../lib/server/durableTranscript";
import {
  GeminiTranscriptProvider,
  TranscriptFailure,
  validateTimedTranscript,
} from "../../lib/server/transcriptProvider";

const execFileAsync = promisify(execFile);
const route = readFileSync("app/api/transcript/durable/route.ts", "utf8");
const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
const config = readFileSync("next.config.ts", "utf8");

test("durable transcript resolves ownership before GCS, FFmpeg, and provider", () => {
  const markers = [
    "requireAuthenticatedRequest(request)", "!isUuid(body.jobId) || !isUuid(body.mediaId)",
    "resolveOwnedJob(body.jobId, ownerUid)", "resolveOwnedMedia(body.mediaId, ownerUid)",
    "media.jobId !== body.jobId", "file(media.storageKey).download", "inspectAudioMedia(executable, inputPath)",
    "extractTranscriptAudio(executable, inputPath, audioPath)", "new GeminiTranscriptProvider(apiKey)",
    "transcribeExtractedAudio(provider, audioPath, inspection.durationSeconds)",
  ];
  let prior = -1;
  for (const marker of markers) {
    const current = route.indexOf(marker);
    assert.ok(current > prior, `${marker} must follow the prior boundary`);
    prior = current;
  }
  assert.doesNotMatch(route, /body\.(?:uid|userId|ownerUid|storageKey|path|filename)/);
  assert.match(route, /failureResponse\("resource-not-found", 404\)/);
});

test("durable transcript uses isolated files, packaged FFmpeg, and cleanup", () => {
  assert.match(route, /path\.join\(paths\.input, "source\.mp4"\)/);
  assert.match(route, /path\.join\(paths\.work, "transcript\.flac"\)/);
  assert.match(route, /resolvePackagedFfmpeg\(\)/);
  assert.match(route, /finally \{[\s\S]*cleanupJobTempRoot\(body\.jobId\)/);
  assert.doesNotMatch(route, /downloaded\.mp4|transcript-audio\.wav|os\.tmpdir|execFileAsync\("ffmpeg"|shell:\s*true/);
  assert.match(config, /"\/api\/transcript\/durable": \["\.\/node_modules\/\.nexcut-runtime\/ffmpeg\/ffmpeg\*"\]/);
});

test("timed transcript validation preserves Japanese and rejects unsafe timelines", () => {
  assert.deepEqual(validateTimedTranscript([{ start: 0, end: 1.5, text: " 日本語 " }], 10), [
    { start: 0, end: 1.5, text: "日本語" },
  ]);
  for (const value of [
    [], [{ start: 1, end: 1, text: "x" }], [{ start: 0, end: 11, text: "x" }],
    [{ start: 2, end: 3, text: "x" }, { start: 1, end: 2, text: "y" }],
    [{ start: 0, end: 1, text: " " }],
  ]) {
    assert.throws(() => validateTimedTranscript(value, 10), TranscriptFailure);
  }
});

test("Gemini provider classifies rate limits, empty output, invalid JSON, and timeout", async () => {
  const input = { audio: Buffer.from("safe"), mimeType: "audio/flac" as const, durationSeconds: 10 };
  const response = (status: number, text?: string) => async () => new Response(JSON.stringify(
    text === undefined ? {} : { candidates: [{ content: { parts: [{ text }] } }] },
  ), { status, headers: { "Content-Type": "application/json" } });
  await assert.rejects(new GeminiTranscriptProvider("secret", response(429) as typeof fetch).transcribe(input),
    (error: unknown) => error instanceof TranscriptFailure && error.reason === "provider-rate-limited");
  await assert.rejects(new GeminiTranscriptProvider("secret", response(200) as typeof fetch).transcribe(input),
    (error: unknown) => error instanceof TranscriptFailure && error.reason === "empty-transcript");
  await assert.rejects(new GeminiTranscriptProvider("secret", response(200, "not-json") as typeof fetch).transcribe(input),
    (error: unknown) => error instanceof TranscriptFailure && error.reason === "invalid-provider-response");
  const stalled = ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })) as typeof fetch;
  await assert.rejects(new GeminiTranscriptProvider("secret", stalled, 5).transcribe(input),
    (error: unknown) => error instanceof TranscriptFailure && error.reason === "provider-timeout");
});

test("manual SRT/VTT and plain text share ClipTimedTextV1 state", () => {
  assert.deepEqual(parseSubtitleText("1\n00:00:01,250 --> 00:00:03,500\nこんにちは"), [
    { start: 1.25, end: 3.5, text: "こんにちは" },
  ]);
  assert.deepEqual(parseSubtitleText("WEBVTT\n\n00:01.000 --> 00:02.250\nHello"), [
    { start: 1, end: 2.25, text: "Hello" },
  ]);
  assert.deepEqual(parseSubtitleText("一行目\n二行目"), [
    { start: 0, end: 2, text: "一行目" }, { start: 2, end: 4, text: "二行目" },
  ]);
  assert.deepEqual(projectTimedTextForHighlight([{ start: 1.25, end: 3.5, text: "x" }]), [
    { second: 1.25, text: "x" },
  ]);
});

test("workspace exposes one auto-subtitle action backed only by durable references", () => {
  assert.match(workspace, /fetch\("\/api\/transcript\/durable"[\s\S]*JSON\.stringify\(\{ jobId: durableMedia\.jobId, mediaId: durableMedia\.mediaId \}\)/);
  assert.match(workspace, /音声から字幕を生成/);
  assert.match(workspace, /setSubtitles\(result\.subtitles\)/);
  assert.match(workspace, /subtitles: projectTimedTextForHighlight\(subtitles\)/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf("handleGenerateSubtitles"), workspace.indexOf("handleAnalyze")), /ownerUid|userId|storageKey|localPath/);
});

test("packaged FFmpeg extracts FLAC from valid 10-second AAC media", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-transcript-"));
  const input = path.join(root, "input.mp4");
  const audio = path.join(root, "transcript.flac");
  try {
    await execFileAsync(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=10",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", input,
    ]);
    await extractTranscriptAudio(ffmpegPath, input, audio);
    const bytes = await readFile(audio);
    assert.ok(bytes.length > 0);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "fLaC");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
