import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMultiCutZipEntryName,
  normalizeMultiCutInstructions,
} from "../../lib/server/durableMultiCut";

const route = readFileSync("app/api/multi-cut/route.ts", "utf8");
const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

test("workspace projects only server-issued durable media references into multi-cut", () => {
  const handler = workspace.slice(
    workspace.indexOf("const handleExportZip"),
    workspace.indexOf("const handleBurnSubtitle"),
  );
  assert.match(handler, /if \(!durableMedia\)/);
  assert.match(handler, /requestVersion:\s*"1\.0"/);
  assert.match(handler, /jobId:\s*durableMedia\.jobId/);
  assert.match(handler, /mediaId:\s*durableMedia\.mediaId/);
  assert.doesNotMatch(handler, /userId|ownerUid|storageKey|downloaded\.mp4|localPath/);
});

test("multi-cut rejects missing or malformed durable references before runtime access", () => {
  const validation = route.indexOf("!isUuid(body.jobId) || !isUuid(body.mediaId)");
  const runtime = route.indexOf("return await withProductionMediaRuntime");
  assert.ok(validation > 0 && runtime > validation);
  assert.match(route, /durable-media-required/);
  assert.match(route, /invalid-resource[\s\S]*status:\s*400/);
});

test("multi-cut enforces ownership before GCS, temp, or FFmpeg", () => {
  const job = route.indexOf("resolveOwnedJob(body.jobId, ownerUid)");
  const media = route.indexOf("resolveOwnedMedia(body.mediaId, ownerUid)");
  const relation = route.indexOf("media.jobId !== body.jobId");
  const temp = route.indexOf("createJobTempDirectories(body.jobId)");
  const gcs = route.indexOf("file(media.storageKey).download");
  const ffmpeg = route.indexOf("inspectDuration(executable, inputPath)");
  assert.ok(job > 0 && media > job && relation > media && temp > relation && gcs > temp && ffmpeg > gcs);
  assert.match(route, /resource-not-found[\s\S]*status:\s*404/);
});

test("multi-cut uses isolated paths and canonical packaged FFmpeg without a shell", () => {
  assert.doesNotMatch(route, /downloaded\.mp4|os\.tmpdir|from "node:os"|\bexec\s*\(|execAsync/);
  assert.match(route, /path\.join\(paths\.input, "source\.mp4"\)/);
  assert.match(route, /path\.join\(paths\.output, `clip-\$\{String\(index\)\.padStart\(4, "0"\)\}\.mp4`\)/);
  assert.match(route, /resolvePackagedFfmpeg\(\)/);
  assert.match(route, /spawn\(executable, \[\.\.\.args\], \{ shell: false/);
  assert.doesNotMatch(route, /spawn\(["']ffmpeg["']|shell:\s*true/);
  assert.match(nextConfig, /"\/api\/multi-cut": \["\.\/node_modules\/\.nexcut-runtime\/ffmpeg\/ffmpeg\*"\]/);
});

test("clip normalization preserves ordering and rejects out-of-media ranges", () => {
  const clips = normalizeMultiCutInstructions([
    { start: "8", end: "10", title: "second" },
    { start: 0, end: 4, title: "first" },
  ], 10);
  assert.deepEqual(clips, [
    { start: 8, end: 10, title: "second" },
    { start: 0, end: 4, title: "first" },
  ]);
  assert.equal(normalizeMultiCutInstructions([{ start: -1, end: 2 }], 10), undefined);
  assert.equal(normalizeMultiCutInstructions([{ start: 1, end: 11 }], 10), undefined);
  assert.equal(normalizeMultiCutInstructions([{ start: 2, end: 2 }], 10), undefined);
});

test("ZIP entry naming remains deterministic and cannot become a server path", () => {
  const clips = normalizeMultiCutInstructions([{ start: 1, end: 3, title: "a/b:clip" }], 5)!;
  assert.equal(createMultiCutZipEntryName(1, "original", clips[0]!), "clip1_original_a_b_clip_1-3.mp4");
  assert.equal(createMultiCutZipEntryName(1, "shorts-9x16", clips[0]!), "clip1_shorts-9x16_a_b_clip_1-3.mp4");
});

test("multi-cut cleanup is Job-scoped and ZIP remains download-only", () => {
  assert.match(route, /finally \{[\s\S]*cleanupJobTempRoot\(body\.jobId\)/);
  assert.doesNotMatch(route, /\.save\(|\.delete\(|createExport|INSERT INTO|UPDATE workflow|DELETE FROM/);
  assert.match(route, /"Content-Type": "application\/zip"/);
  assert.match(route, /filename=clips\.zip/);
});

test("AI MV has no multi-cut caller", () => {
  const aiMv = readFileSync("app/ai-mv/page.tsx", "utf8");
  const api = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.doesNotMatch(`${aiMv}\n${api}`, /\/api\/multi-cut/);
});
