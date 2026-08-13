import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cut = readFileSync("app/api/cut/route.ts", "utf8");
const admission = readFileSync("app/api/media/admit/route.ts", "utf8");

test("cut preserves authentication, ownership, materialization, process, upload, and export ordering", () => {
  const ordered = [
    "requireAuthenticatedRequest(request)",
    "resolveOwnedJob(jobId, ownerUid)",
    "resolveOwnedMedia(mediaId, ownerUid)",
    "Number(form.get(\"start\"))",
    "file(media.storageKey).download()",
    "writeFile(input, bytes)",
    "runFfmpeg([",
    "file(uploadedKey).save(rendered",
    "createExportWithId(exportId, jobId, ownerUid",
  ];
  let prior = -1;
  for (const marker of ordered) {
    const position = cut.indexOf(marker);
    assert.ok(position > prior, `${marker} must follow the prior authority boundary`);
    prior = position;
  }
});

test("cut does not accept client ownership, storage, filename, or shell authority", () => {
  assert.doesNotMatch(cut, /form\.get\(["'](?:userId|ownerUid|storageKey|filename)["']\)/);
  assert.match(cut, /spawn\("ffmpeg", args, \{ shell: false/);
  assert.doesNotMatch(cut, /\bexec(?:Sync)?\s*\(/);
  assert.match(cut, /createExportStorageKey\(jobId, exportId/);
  assert.match(cut, /cleanupJobTempRoot\(jobId\)/);
});

test("ownership rejection precedes GCS, filesystem, and FFmpeg work", () => {
  const ownershipEnd = cut.indexOf("media.jobId !== jobId");
  assert.ok(ownershipEnd > 0);
  assert.ok(cut.indexOf(".download()") > ownershipEnd);
  assert.ok(cut.indexOf("writeFile(input") > ownershipEnd);
  assert.ok(cut.indexOf("runFfmpeg([") > ownershipEnd);
});

test("admission compensates GCS when its DB transaction fails", () => {
  assert.match(admission, /query\("BEGIN"\)/);
  assert.match(admission, /query\("ROLLBACK"\)/);
  assert.match(admission, /file\(storageKey\)\.delete\(\{ ignoreNotFound: true \}\)/);
  assert.doesNotMatch(admission, /form\.get\(["'](?:userId|ownerUid|storageKey)["']\)/);
});

test("export insert failure compensates only the newly generated output object", () => {
  assert.match(cut, /uploadedKey = createExportStorageKey\(jobId, exportId/);
  assert.match(cut, /if \(uploadedKey\) await bucket\.file\(uploadedKey\)\.delete/);
  assert.doesNotMatch(cut, /file\(media\.storageKey\)\.delete/);
});
