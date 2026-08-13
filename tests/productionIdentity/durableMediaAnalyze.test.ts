import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(analyze, /execFileAsync\("ffprobe", \[/);
  assert.match(analyze, /execFileAsync\("ffmpeg", \[/);
  assert.doesNotMatch(analyze, /\bexec\s*\(/);
  assert.match(analyze, /finally \{[\s\S]*cleanupJobTempRoot\(jobId\)/);
});
