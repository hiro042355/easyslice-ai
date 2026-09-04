import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { YouTubeIngestionFailure, validateYouTubeVideoUrl } from "../../lib/server/youtubeIngestion";
import { classifyUrl } from "../../lib/urlAcquisition/classifyUrl";
import { detectUrlSource } from "../../lib/urlImport";

const VIDEO_ID = "abc123XYZ_-";
const CANONICAL_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

test("canonical authority supports and normalizes the V1 YouTube forms", () => {
  for (const input of [
    CANONICAL_URL,
    `https://youtube.com/watch?v=${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&utm_source=test&t=10`,
  ]) {
    assert.deepEqual(classifyUrl(input), {
      kind: "SUPPORTED_YOUTUBE",
      platform: "youtube",
      videoId: VIDEO_ID,
      normalizedUrl: CANONICAL_URL,
    });
  }
});

test("recognized YouTube hosts with unsupported V1 shapes stay unsupported", () => {
  for (const input of [
    "https://youtube.com/watch",
    "https://youtube.com/watch?v=short",
    `https://youtube.com/watch?v=${VIDEO_ID}&list=PL123`,
    `https://youtu.be/${VIDEO_ID}/`,
    `https://youtu.be/${VIDEO_ID}//`,
    `https://youtu.be//${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}/extra`,
    "https://youtu.be/",
    `https://youtube.com/live/${VIDEO_ID}`,
    `https://youtube.com/embed/${VIDEO_ID}`,
    "https://youtube.com/channel/UC123",
    "https://youtube.com/@creator",
    "https://youtube.com/results?search_query=test",
    `http://youtube.com/watch?v=${VIDEO_ID}`,
    `https://user:pass@youtube.com/watch?v=${VIDEO_ID}`,
  ]) assert.equal(classifyUrl(input).kind, "UNSUPPORTED_YOUTUBE", input);
});

test("lookalike and unrelated hosts never receive YouTube authority", () => {
  for (const input of [
    `https://evil.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com.evil.example/watch?v=${VIDEO_ID}`,
    `https://notyoutube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com@evil.example/watch?v=${VIDEO_ID}`,
    `https://example.com/?next=${encodeURIComponent(CANONICAL_URL)}`,
  ]) assert.equal(classifyUrl(input).kind, "UNSUPPORTED_URL", input);
});

test("invalid input and non-http schemes fail closed without side effects", () => {
  for (const input of [
    "",
    "not a url",
    `\u00a0${CANONICAL_URL}\u00a0`,
    `\u2003${CANONICAL_URL}\u2003`,
    `www.youtube.com/watch?v=${VIDEO_ID}`,
    `m.youtube.com/watch?v=${VIDEO_ID}`,
    `youtu.be/${VIDEO_ID}`,
    "javascript:alert(1)",
    "ftp://youtube.com/video",
    "file:///tmp/video.mp4",
    null,
    42,
  ]) {
    assert.equal(classifyUrl(input).kind, "INVALID_INPUT", String(input));
  }
  const source = readFileSync("lib/urlAcquisition/classifyUrl.ts", "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|dns|child_process|node:fs|from ["']fs["']|\bexec\s*\(|\bspawn\s*\(/);
});

test("raw input length is enforced before trimming at the baseline boundary", () => {
  const paddingAtBoundary = " ".repeat(2048 - CANONICAL_URL.length);
  const atBoundary = `${paddingAtBoundary}${CANONICAL_URL}`;
  const overBoundary = ` ${atBoundary}`;
  assert.equal(atBoundary.length, 2048);
  assert.equal(classifyUrl(atBoundary).kind, "SUPPORTED_YOUTUBE");
  assert.equal(overBoundary.length, 2049);
  assert.equal(classifyUrl(overBoundary).kind, "INVALID_INPUT");
});

test("canonical support decisions match the baseline production validator", () => {
  const baselineSupports = (input: unknown): boolean => {
    if (typeof input !== "string" || input.length > 2048) return false;
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    let videoId = "";
    if (host === "youtu.be") {
      if (url.pathname.split("/").filter(Boolean).length !== 1) return false;
      videoId = url.pathname.slice(1);
    } else if (new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]).has(host)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
      else if (url.pathname.startsWith("/shorts/") && url.pathname.split("/").filter(Boolean).length === 2) {
        videoId = url.pathname.split("/")[2] ?? "";
      } else return false;
    } else return false;
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) && !url.searchParams.has("list");
  };

  const atBoundary = `${" ".repeat(2048 - CANONICAL_URL.length)}${CANONICAL_URL}`;
  const corpus = [
    CANONICAL_URL,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com/shorts/${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}/`,
    `https://youtu.be/${VIDEO_ID}//`,
    "https://youtu.be/",
    "https://youtu.be/malformed",
    `http://youtube.com/watch?v=${VIDEO_ID}`,
    `youtube.com/watch?v=${VIDEO_ID}`,
    ` ${CANONICAL_URL} `,
    `\u00a0${CANONICAL_URL}\u00a0`,
    `\u2003${CANONICAL_URL}\u2003`,
    atBoundary,
    ` ${atBoundary}`,
    `https://youtube.com/embed/${VIDEO_ID}`,
    `https://user:pass@youtube.com/watch?v=${VIDEO_ID}`,
  ];
  assert.equal(corpus.length, 17);
  for (const input of corpus) {
    assert.equal(classifyUrl(input).kind === "SUPPORTED_YOUTUBE", baselineSupports(input), input);
  }
});

test("UI and server delegate to the same support decision", () => {
  const corpus = [
    CANONICAL_URL,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://youtube.com/shorts/${VIDEO_ID}`,
    `m.youtube.com/watch?v=${VIDEO_ID}`,
    `youtu.be/${VIDEO_ID}`,
    `https://youtube.com/live/${VIDEO_ID}`,
    `https://evil.youtube.com/watch?v=${VIDEO_ID}`,
    "garbage",
  ];
  for (const input of corpus) {
    const supported = classifyUrl(input).kind === "SUPPORTED_YOUTUBE";
    assert.equal(detectUrlSource(input) === "youtube", supported, input);
    if (supported) assert.equal(validateYouTubeVideoUrl(input).canonicalUrl, CANONICAL_URL);
    else assert.throws(() => validateYouTubeVideoUrl(input), YouTubeIngestionFailure);
  }

  assert.match(readFileSync("lib/urlImport.ts", "utf8"), /classifyUrl\(value\)/);
  assert.match(readFileSync("lib/server/youtubeIngestion.ts", "utf8"), /classifyUrl\(input\)/);
});

test("legacy routes remain deterministic non-executing retirement endpoints", () => {
  for (const path of ["app/api/youtube-info/route.ts", "app/api/youtube-download/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /legacy-youtube-route-retired/);
    assert.match(source, /status:\s*410/);
    assert.doesNotMatch(source, /child_process|\bfetch\s*\(|yt-dlp|\bexec\s*\(|\bspawn\s*\(/);
  }
});
