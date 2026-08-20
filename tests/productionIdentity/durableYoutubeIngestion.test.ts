import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import {
  createYouTubeAcquisitionArguments,
  inspectIngestedVideo,
  MAX_INGESTED_MEDIA_BYTES,
  validateYouTubeVideoUrl,
  YOUTUBE_ACQUISITION_TIMEOUT_MS,
  YouTubeIngestionFailure,
} from "../../lib/server/youtubeIngestion";

const execFileAsync = promisify(execFile);
const route = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
const preview = readFileSync("app/api/media/[jobId]/[mediaId]/route.ts", "utf8");
const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
const rootPage = readFileSync("app/page.tsx", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

test("strict URL authority supports only explicit single-video YouTube forms", () => {
  const expected = "https://www.youtube.com/watch?v=abc123XYZ_-";
  for (const input of [
    expected,
    "https://youtube.com/watch?v=abc123XYZ_-&t=2",
    "https://m.youtube.com/watch?v=abc123XYZ_-",
    "https://youtu.be/abc123XYZ_-",
    "https://www.youtube.com/shorts/abc123XYZ_-",
  ]) assert.deepEqual(validateYouTubeVideoUrl(input), { videoId: "abc123XYZ_-", canonicalUrl: expected });
});

test("strict URL authority rejects generic download, credentials, playlist, and malformed forms", () => {
  for (const input of [
    "https://example.com/watch?v=abc123XYZ_-",
    "https://youtube.com.evil.test/watch?v=abc123XYZ_-",
    "https://user:pass@youtube.com/watch?v=abc123XYZ_-",
    "http://youtube.com/watch?v=abc123XYZ_-",
    "javascript:alert(1)",
    "file:///tmp/video.mp4",
    "https://youtube.com/playlist?list=PL123",
    "https://youtube.com/watch?v=abc123XYZ_-&list=PL123",
    "https://youtu.be/not-eleven",
    "https://youtube.com/embed/abc123XYZ_-",
  ]) assert.throws(() => validateYouTubeVideoUrl(input), (error: unknown) =>
    error instanceof YouTubeIngestionFailure && error.reason === "invalid-youtube-url");
});

test("yt-dlp invocation is deterministic, single-video, and server-output controlled", () => {
  const args = createYouTubeAcquisitionArguments(
    "https://www.youtube.com/watch?v=abc123XYZ_-",
    "/tmp/nexcut/jobs/server-id/input/youtube-source.mp4",
  );
  assert.deepEqual(args, [
    "--no-playlist", "--ignore-config", "--no-progress", "--no-warnings", "--no-write-info-json", "--no-write-thumbnail",
    "--max-filesize", "2G",
    "--format", "bv*+ba/b", "--merge-output-format", "mp4", "--remux-video", "mp4",
    "--output", "/tmp/nexcut/jobs/server-id/input/youtube-source.mp4",
    "https://www.youtube.com/watch?v=abc123XYZ_-",
  ]);
  assert.equal(YOUTUBE_ACQUISITION_TIMEOUT_MS, 240_000);
  assert.equal(MAX_INGESTED_MEDIA_BYTES, 2 * 1024 * 1024 * 1024);
  assert.doesNotMatch(JSON.stringify(args), /cookies|username|password|netrc|playlist-items/i);
});

test("route preserves auth, validation, server IDs, acquisition, validation, GCS, DB, response, cleanup order", () => {
  const ordered = [
    "requireAuthenticatedRequest(request)",
    "isSameOrigin(request)",
    "validateYouTubeVideoUrl(await readUrl(request))",
    "const jobId = randomUUID()",
    "const mediaId = randomUUID()",
    "createJobTempDirectories(jobId)",
    "runPackagedYtDlp(",
    "inspectIngestedVideo(resolvePackagedFfmpeg(), inputPath)",
    "createReadStream(inputPath)",
    "transaction.query(\"BEGIN\")",
    "repository.createJobWithId(jobId, ownerUid)",
    "repository.createMediaWithId(mediaId, jobId, ownerUid",
    "transaction.query(\"COMMIT\")",
    "NextResponse.json({ jobId, mediaId",
    "cleanupJobTempRoot(jobId)",
  ];
  let previous = -1;
  for (const marker of ordered) {
    const position = route.indexOf(marker);
    assert.ok(position > previous, `${marker} must follow prior boundary`);
    previous = position;
  }
});

test("route accepts no client authority beyond URL and leaks no storage authority", () => {
  assert.match(route, /Object\.keys\(value\)\.length !== 1/);
  assert.doesNotMatch(route, /(?:body|value)\.(?:uid|userId|ownerUid|jobId|mediaId|storageKey|filename|path)/);
  assert.match(route, /createMediaStorageKey\(jobId, mediaId, "input", VIDEO_MIME\)/);
  assert.match(route, /NextResponse\.json\(\{ jobId, mediaId, durationSeconds:/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*(?:ownerUid|storageKey|inputPath|canonicalUrl)/);
  assert.doesNotMatch(route, /cookies\.txt|browser-cookies|--cookies|--username|--password|--netrc/);
});

test("route uses packaged binaries, safe runner, and route-scoped tracing only", () => {
  assert.match(route, /runPackagedYtDlp/);
  assert.match(route, /resolvePackagedFfmpeg/);
  assert.doesNotMatch(route, /spawn\(["']yt-dlp|exec\(|shell:\s*true|\bPATH\b/);
  assert.match(nextConfig, /"\/api\/youtube\/ingest": \[[\s\S]*\.nexcut-runtime\/yt-dlp\/yt-dlp[\s\S]*\.nexcut-runtime\/ffmpeg\/ffmpeg\*/);
  assert.doesNotMatch(nextConfig, /"\/api\/ai-mv"[\s\S]*yt-dlp|"\/api\/\*"[\s\S]*yt-dlp|"\/\*"[\s\S]*yt-dlp/);
});

test("GCS and DB failures compensate object and transaction without partial authority", () => {
  assert.match(route, /uploaded = true[\s\S]*pipeline\(/);
  assert.match(route, /query\("ROLLBACK"\)\.catch/);
  assert.match(route, /if \(uploaded && !completed\) await object\.delete\(\{ ignoreNotFound: true \}\)/);
  assert.match(route, /finally \{[\s\S]*cleanupJobTempRoot\(jobId\)/);
  assert.doesNotMatch(route, /predefinedAcl|makePublic|makePrivate|\.acl\b/);
});

test("workspace projects the durable response into the same durableMedia state", () => {
  assert.match(workspace, /fetch\("\/api\/youtube\/ingest"/);
  assert.match(workspace, /setDurableMedia\(\{ jobId: result\.jobId, mediaId: result\.mediaId \}\)/);
  assert.match(workspace, /setVideoSrc\(`\/api\/media\/\$\{result\.jobId\}\/\$\{result\.mediaId\}`\)/);
  const handler = workspace.slice(workspace.indexOf("const handleFetchYoutube"), workspace.indexOf("const handleSubtitleFileUpload"));
  assert.doesNotMatch(handler, /\/api\/youtube-info|\/api\/youtube-download|\/api\/video/);
  assert.match(rootPage, /\/api\/youtube-(?:info|download)/);
});

test("preview validates owner-scoped Job and Media before DB-derived GCS streaming", () => {
  const ordered = [
    "requireAuthenticatedRequest(request)",
    "resolveOwnedJob(jobId, ownerUid)",
    "resolveOwnedMedia(mediaId, ownerUid)",
    "media.jobId !== jobId",
    "bucket.file(media.storageKey)",
    "createReadStream({ start, end })",
  ];
  let previous = -1;
  for (const marker of ordered) {
    const position = preview.indexOf(marker);
    assert.ok(position > previous, `${marker} must follow prior boundary`);
    previous = position;
  }
  assert.match(preview, /resource-not-found[\s\S]*status: 404/);
  assert.doesNotMatch(preview, /request.*storageKey|params.*storageKey|ownerUid.*params/);
});

test("media inspection accepts finite MP4 video with optional audio and rejects malformed media", async () => {
  assert.ok(ffmpegPath);
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-youtube-inspection-"));
  const valid = path.join(root, "video.mp4");
  const malformed = path.join(root, "bad.mp4");
  try {
    await execFileAsync(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1", "-c:v", "libx264", "-an", "-y", valid,
    ]);
    await writeFile(malformed, "not-media");
    const inspected = await inspectIngestedVideo(ffmpegPath, valid);
    assert.equal(inspected.mime, "video/mp4");
    assert.equal(inspected.durationSeconds, 1);
    assert.ok(inspected.sizeBytes > 0);
    await assert.rejects(inspectIngestedVideo(ffmpegPath, malformed), (error: unknown) =>
      error instanceof YouTubeIngestionFailure && error.reason === "invalid-media");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
