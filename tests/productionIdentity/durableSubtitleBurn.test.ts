import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSubtitleFilter, createSubtitleLines, escapeAssText, getCreatorSubtitleRenderConfig,
  subtitleLinesToCreatorAss, subtitleLinesToSrt,
} from "../../lib/server/durableSubtitleBurn";

const route = readFileSync("app/api/burn-subtitle/route.ts", "utf8");
const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
const config = readFileSync("next.config.ts", "utf8");

test("workspace sends durable references and consumes a binary result", () => {
  const start = workspace.indexOf("const handleBurnSubtitle");
  const handler = workspace.slice(start, workspace.indexOf("return (", start));
  assert.match(handler, /if \(!hasVideo \|\| !durableMedia\)/);
  assert.match(handler, /requestVersion:\s*"1\.0"/);
  assert.match(handler, /jobId:\s*durableMedia\.jobId/);
  assert.match(handler, /mediaId:\s*durableMedia\.mediaId/);
  assert.match(handler, /URL\.createObjectURL\(await res\.blob\(\)\)/);
  assert.doesNotMatch(handler, /userId|ownerUid|storageKey|localPath|downloaded\.mp4|\/api\/video/);
});

test("missing and malformed durable references fail before runtime access", () => {
  const malformed = route.indexOf("!isUuid(body.jobId) || !isUuid(body.mediaId)");
  const runtime = route.indexOf("return await withProductionMediaRuntime");
  assert.ok(malformed > 0 && runtime > malformed);
  assert.match(route, /durable-media-required/);
  assert.match(route, /invalid-resource[\s\S]*status:\s*400/);
});

test("ownership and relationship precede GCS, temp, subtitle generation, and FFmpeg", () => {
  const job = route.indexOf("resolveOwnedJob(body.jobId, ownerUid)");
  const media = route.indexOf("resolveOwnedMedia(body.mediaId, ownerUid)");
  const relation = route.indexOf("media.jobId !== body.jobId");
  const temp = route.indexOf("createJobTempDirectories(body.jobId)");
  const gcs = route.indexOf("file(media.storageKey).download");
  const subtitle = route.indexOf("createSubtitleLines(");
  const ffmpeg = route.indexOf("await runFfmpeg");
  assert.ok(job > 0 && media > job && relation > media && temp > relation && gcs > temp && subtitle > gcs && ffmpeg > subtitle);
  assert.match(route, /resource-not-found[\s\S]*status:\s*404/);
});

test("burn uses isolated files, packaged FFmpeg, argument arrays, and cleanup", () => {
  assert.doesNotMatch(route, /downloaded\.mp4|burned-subtitle\.mp4|os\.tmpdir|execFile|execAsync|spawn\(["']ffmpeg["']|shell:\s*true/);
  assert.match(route, /path\.join\(paths\.input, "source\.mp4"\)/);
  assert.match(route, /path\.join\(paths\.work, renderConfig\.enabled \? "subtitle\.ass" : "subtitle\.srt"\)/);
  assert.match(route, /path\.join\(paths\.output, "subtitled\.mp4"\)/);
  assert.match(route, /spawn\(executable, \[\.\.\.args\], \{ shell: false/);
  assert.match(route, /resolvePackagedFfmpeg\(\)/);
  assert.match(route, /finally \{[\s\S]*cleanupJobTempRoot\(body\.jobId\)/);
  assert.match(config, /"\/api\/burn-subtitle": \["\.\/node_modules\/\.nexcut-runtime\/ffmpeg\/ffmpeg\*"\]/);
});

test("SRT preserves Japanese and timing behavior", () => {
  const lines = createSubtitleLines("こんにちは\n世界");
  assert.deepEqual(lines, [{ start: 0, end: 2, text: "こんにちは" }, { start: 1.7, end: 3.7, text: "世界" }]);
  const srt = subtitleLinesToSrt(lines);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000[\s\S]*こんにちは/);
  assert.match(srt, /00:00:01,000 --> 00:00:03,000[\s\S]*世界/);
});

test("ASS preserves dual-language Unicode and escapes control syntax", () => {
  const lines = createSubtitleLines("日本語{tag}\\x\n次", "English\nSecond", true);
  const ass = subtitleLinesToCreatorAss(lines, getCreatorSubtitleRenderConfig({ style: "creator", enabled: true, intensity: 3 }));
  assert.match(ass, /日本語tag\\\\x\\NEnglish/);
  assert.match(ass, /次\\NSecond/);
  assert.equal(escapeAssText("a{b}\\c\nd"), "ab\\\\c\\Nd");
});

test("subtitle filter escapes only the server-owned subtitle path", () => {
  assert.equal(createSubtitleFilter("C:\\safe\\subtitle.ass", true), "subtitles='C\\:/safe/subtitle.ass'");
  assert.doesNotMatch(route, /body\.(?:userId|ownerUid|storageKey|localPath)/);
});

test("output remains download-only with no Export, DB, or GCS mutation", () => {
  assert.match(route, /"Content-Type": "video\/mp4"/);
  assert.match(route, /filename=subtitled\.mp4/);
  assert.doesNotMatch(route, /createExport|INSERT INTO|UPDATE workflow|DELETE FROM|\.save\(|\.delete\(/);
  assert.doesNotMatch(route, /\/api\/video\?type=burned/);
});

test("AI MV has no subtitle burn caller", () => {
  const aiMv = `${readFileSync("app/ai-mv/page.tsx", "utf8")}\n${readFileSync("app/api/ai-mv/route.ts", "utf8")}`;
  assert.doesNotMatch(aiMv, /\/api\/burn-subtitle/);
});
