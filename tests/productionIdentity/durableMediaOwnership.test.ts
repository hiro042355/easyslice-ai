import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createDurableMediaOwnershipRepository, type OwnershipQueryClient } from "../../lib/server/durableMediaOwnership/repository";
import { createExportStorageKey, createMediaStorageKey } from "../../lib/server/durableMediaOwnership/storageKey";
import { cleanupJobTempRoot, createJobTempDirectories, resolveJobTempPaths } from "../../lib/server/durableMediaOwnership/tempIsolation";

const JOB_A = "11111111-1111-4111-8111-111111111111";
const JOB_B = "22222222-2222-4222-8222-222222222222";
const MEDIA_A = "33333333-3333-4333-8333-333333333333";
const EXPORT_A = "44444444-4444-4444-8444-444444444444";

test("storage keys use only validated server authority", () => {
  assert.equal(createMediaStorageKey(JOB_A, MEDIA_A, "input", "video/mp4"), `jobs/${JOB_A}/input/${MEDIA_A}.mp4`);
  assert.equal(createExportStorageKey(JOB_A, EXPORT_A, "application/zip"), `jobs/${JOB_A}/output/${EXPORT_A}.zip`);
  assert.throws(() => createMediaStorageKey("../foreign", MEDIA_A, "input", "video/mp4"), /Invalid job ID/);
  assert.throws(() => createMediaStorageKey(JOB_A, MEDIA_A, "input", "text/plain"), /Unsupported/);
});

test("all resource lookups enforce canonical owner in SQL and malformed IDs do not query", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const client: OwnershipQueryClient = { async query(text, values) { calls.push({ text, values }); return { rows: [], rowCount: 0 }; } };
  const repository = createDurableMediaOwnershipRepository(client);
  assert.equal(await repository.resolveOwnedJob("malformed", "owner-a"), undefined);
  assert.equal(calls.length, 0);
  await repository.resolveOwnedJob(JOB_A, "owner-a");
  await repository.resolveOwnedMedia(MEDIA_A, "owner-a");
  await repository.resolveOwnedExport(EXPORT_A, "owner-a");
  assert.equal(calls.length, 3);
  assert.match(calls[0]!.text, /id = \$1 AND owner_uid = \$2/);
  assert.match(calls[1]!.text, /JOIN workflow\.jobs[\s\S]*owner_uid = \$2/);
  assert.match(calls[2]!.text, /JOIN workflow\.jobs[\s\S]*owner_uid = \$2/);
  assert.deepEqual(calls.map((call) => call.values[1]), ["owner-a", "owner-a", "owner-a"]);
});

test("foreign and unknown resources share the same absent result", async () => {
  const client: OwnershipQueryClient = { async query() { return { rows: [], rowCount: 0 }; } };
  const repository = createDurableMediaOwnershipRepository(client);
  assert.equal(await repository.resolveOwnedJob(JOB_B, "owner-a"), undefined);
  assert.equal(await repository.resolveOwnedMedia(MEDIA_A, "owner-a"), undefined);
  assert.equal(await repository.resolveOwnedExport(EXPORT_A, "owner-a"), undefined);
});

test("owned media and exports are inserted only through an owner-scoped job selection", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const client: OwnershipQueryClient = { async query(text, values) { calls.push({ text, values }); return { rows: [], rowCount: 0 }; } };
  const repository = createDurableMediaOwnershipRepository(client);
  assert.equal(await repository.createMedia(JOB_A, "owner-a", "input", "video/mp4"), undefined);
  assert.equal(await repository.createExport(JOB_A, "owner-a", "application/zip"), undefined);
  assert.match(calls[0]!.text, /INSERT INTO workflow\.media[\s\S]*FROM workflow\.jobs[\s\S]*owner_uid = \$5/);
  assert.match(calls[1]!.text, /INSERT INTO workflow\.exports[\s\S]*FROM workflow\.jobs[\s\S]*owner_uid = \$4/);
  assert.equal(String(calls[0]!.values[1]).startsWith(`jobs/${JOB_A}/input/`), true);
  assert.equal(String(calls[1]!.values[1]).startsWith(`jobs/${JOB_A}/output/`), true);
  assert.equal(calls[0]!.values.includes("client-storage-key"), false);
});

test("job temp roots isolate collisions and cleanup only the selected job", async () => {
  const authorityRoot = resolve(".ownership-temp-test");
  const a = await createJobTempDirectories(JOB_A, authorityRoot);
  const b = await createJobTempDirectories(JOB_B, authorityRoot);
  assert.notEqual(a.root, b.root);
  assert.match(a.input, /11111111-1111-4111-8111-111111111111[\\/]input$/);
  await writeFile(`${a.work}/work.mp4`, "a");
  await writeFile(`${b.work}/work.mp4`, "b");
  await cleanupJobTempRoot(JOB_A, authorityRoot);
  await assert.rejects(access(a.root));
  await access(`${b.work}/work.mp4`);
  await cleanupJobTempRoot(JOB_B, authorityRoot);
  assert.throws(() => resolveJobTempPaths("../../shared"), /Invalid job ID/);
});
