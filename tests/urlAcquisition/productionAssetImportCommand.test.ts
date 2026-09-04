import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAssetImportFingerprint } from "../../lib/server/assetImport/fingerprint";
import { readAssetImportRequest } from "../../lib/server/assetImport/requestBoundary";
import { finalizeImportedAsset, projectExistingAssetImport } from "../../lib/server/assetImport/service";
import type { AssetImportRecord } from "../../lib/server/assetImport/idempotencyRepository";

const URL = "https://www.youtube.com/watch?v=abc123XYZ_-";
const request = (body: string, headers: Record<string, string> = {}) => new Request("https://nexcut.example/api/v1/assets/import", {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-1", ...headers }, body,
});

test("request boundary accepts only the frozen canonical V1 contract", async () => {
  const accepted = await readAssetImportRequest(request(JSON.stringify({ requestVersion: "1.0", sourceUrl: URL })));
  assert.equal(accepted.status, "accepted");
  if (accepted.status === "accepted") assert.deepEqual(accepted.source, { platform: "youtube", videoId: "abc123XYZ_-", normalizedUrl: URL });
  for (const body of [" ", "{", JSON.stringify({ requestVersion: "2.0", sourceUrl: URL }),
    JSON.stringify({ requestVersion: "1.0", sourceUrl: URL, ownerUid: "attacker" }),
    JSON.stringify({ requestVersion: "1.0", sourceUrl: "https://example.com/video" })]) {
    assert.equal((await readAssetImportRequest(request(body))).status, "rejected");
  }
});

test("request boundary enforces body and opaque-key limits", async () => {
  assert.deepEqual(await readAssetImportRequest(request("x".repeat(4097))), { status: "rejected", statusCode: 413, code: "invalid_request" });
  assert.equal((await readAssetImportRequest(request(JSON.stringify({ requestVersion: "1.0", sourceUrl: URL }), { "idempotency-key": "x".repeat(129) }))).status, "rejected");
  assert.equal((await readAssetImportRequest(request(JSON.stringify({ requestVersion: "1.0", sourceUrl: URL }), { "idempotency-key": "secret value" }))).status, "rejected");
});

test("fingerprint is deterministic, canonical, and framed", () => {
  const source = { platform: "youtube" as const, videoId: "abc123XYZ_-", normalizedUrl: URL };
  const first = createAssetImportFingerprint(source);
  assert.equal(first.byteLength, 32);
  assert.deepEqual(first, createAssetImportFingerprint({ ...source }));
  assert.notDeepEqual(first, createAssetImportFingerprint({ ...source, videoId: "zzz123XYZ_-", normalizedUrl: "https://www.youtube.com/watch?v=zzz123XYZ_-" }));
});

test("route uses established security authorities and contains no acquisition implementation", () => {
  const route = readFileSync("app/api/v1/assets/import/route.ts", "utf8");
  for (const required of ["requireAuthenticatedRequest", "validateSameOriginMutation", "validateAssetImportCsrf", "readAssetImportRequest", "executeAssetImport"]) assert.match(route, new RegExp(required));
  assert.doesNotMatch(route, /yt-dlp|execFile|child_process|createWriteStream|OWNER_ATTEMPT/);
  const retired = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  assert.match(retired, /status:\s*410/);
  assert.match(retired, /legacy-youtube-route-retired/);
});

test("migration freezes owner-scoped uniqueness and terminal invariants", () => {
  const sql = readFileSync("db/workflow/migrations/V000008__add_asset_import_idempotency.sql", "utf8");
  assert.match(sql, /PRIMARY KEY \(owner_uid, idempotency_key\)/);
  assert.match(sql, /octet_length\(request_fingerprint\) = 32/);
  assert.match(sql, /state IN \('acquiring','reconciliation_required'\) AND job_id IS NULL AND media_id IS NULL/);
  assert.match(sql, /state = 'succeeded' AND job_id IS NOT NULL AND media_id IS NOT NULL AND duration_seconds > 0/);
  assert.match(sql, /state = 'failed_retryable'[\s\S]*failure_code = 'acquisition_retryable' AND retryable IS TRUE/);
  assert.match(sql, /FOREIGN KEY \(media_id, job_id\) REFERENCES workflow\.media\(id, job_id\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(job_id, owner_uid\) REFERENCES workflow\.jobs\(id, owner_uid\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /result jsonb/);
});

test("compensation is limited to failures before commit is attempted", async () => {
  const run = async (failureAt: "complete" | "coded-commit" | "uncoded-commit" | "none") => {
    const calls: string[] = [];
    const operation = finalizeImportedAsset({
      complete: async () => { calls.push("complete"); if (failureAt === "complete") throw new Error("not-committed"); },
      commit: async () => { calls.push("commit"); if (failureAt === "coded-commit") throw Object.assign(new Error("rejected"), { code: "23503" });
        if (failureAt === "uncoded-commit") throw new Error("connection-lost"); },
      rollback: async () => { calls.push("rollback"); }, compensate: async () => { calls.push("compensate"); },
    });
    if (failureAt === "none") await assert.doesNotReject(operation);
    else await assert.rejects(operation);
    return calls;
  };
  assert.deepEqual(await run("complete"), ["complete", "rollback", "compensate"]);
  assert.deepEqual(await run("uncoded-commit"), ["complete", "commit", "rollback"]);
  assert.deepEqual(await run("coded-commit"), ["complete", "commit", "rollback"]);
  assert.deepEqual(await run("none"), ["complete", "commit"]);
});

test("duration is durable, replayed, and required by the workspace Analyze handoff", () => {
  const migration = readFileSync("db/workflow/migrations/V000008__add_asset_import_idempotency.sql", "utf8");
  const repository = readFileSync("lib/server/assetImport/idempotencyRepository.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  assert.match(migration, /duration_seconds double precision/);
  assert.match(repository, /durationSeconds: row\.duration_seconds/);
  assert.match(workspace, /!Number\.isFinite\(result\.durationSeconds\)/);
  assert.match(workspace, /setVideoDuration\(result\.durationSeconds!\)/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf("const handleFetchYoutube"), workspace.indexOf("const handleSubtitleFileUpload")), /durationSeconds \|\| 0/);
});

test("all formerly active internal acquisition routes are fixed non-executing endpoints", () => {
  for (const path of ["app/api/internal/acquisition-worker-owner-e2e/route.ts", "app/api/internal/environment-b-owner-youtube-e2e/route.ts"]) {
    const route = readFileSync(path, "utf8");
    assert.match(route, /status: 410/);
    assert.match(route, /internal-acquisition-route-retired/);
    assert.doesNotMatch(route, /invokeProductionAcquisitionWorker|randomUUID|runPackagedYtDlp|sourceUrl/);
  }
});

test("durable duplicates replay terminal state and never imply a second execution", () => {
  const fingerprint = createAssetImportFingerprint({ platform: "youtube", videoId: "abc123XYZ_-", normalizedUrl: URL });
  const base = { ownerUid: "owner-a", idempotencyKey: "request-1", fingerprint, source: {
    platform: "youtube" as const, videoId: "abc123XYZ_-", normalizedUrl: URL,
  }, jobId: "11111111-1111-4111-8111-111111111111", mediaId: "22222222-2222-4222-8222-222222222222", durationSeconds: 42, revision: 1 };
  const active = projectExistingAssetImport({ ...base, state: "acquiring" }, fingerprint);
  assert.deepEqual(active, { statusCode: 202, body: { responseVersion: "1.0", status: "in_progress", retryAfterClass: "short" } });
  const success = { responseVersion: "1.0" as const, status: "succeeded" as const, jobId: base.jobId, mediaId: base.mediaId, durationSeconds: 42, source: base.source };
  assert.deepEqual(projectExistingAssetImport({ ...base, state: "succeeded", result: success }, fingerprint), { statusCode: 200, body: success });
  const retryable = { responseVersion: "1.0" as const, status: "failed" as const, code: "acquisition_retryable" as const, retryable: true };
  assert.deepEqual(projectExistingAssetImport({ ...base, state: "failed_retryable", result: retryable }, fingerprint), { statusCode: 503, body: retryable });
  const final = { responseVersion: "1.0" as const, status: "failed" as const, code: "acquisition_final" as const, retryable: false };
  assert.deepEqual(projectExistingAssetImport({ ...base, state: "failed_final", result: final }, fingerprint), { statusCode: 422, body: final });
});

test("same owner/key with a different fingerprint fails closed", () => {
  const fingerprint = Buffer.alloc(32, 1);
  const record: AssetImportRecord = { ownerUid: "owner-a", idempotencyKey: "request-1", fingerprint: Buffer.alloc(32, 2),
    state: "acquiring", source: { platform: "youtube", videoId: "abc123XYZ_-", normalizedUrl: URL }, revision: 0 };
  assert.deepEqual(projectExistingAssetImport(record, fingerprint), { statusCode: 409,
    body: { responseVersion: "1.0", status: "failed", code: "duplicate_conflict", retryable: false } });
});

test("repository SQL provides owner independence, one concurrent winner, and revision CAS", () => {
  const repository = readFileSync("lib/server/assetImport/idempotencyRepository.ts", "utf8");
  assert.match(repository, /PRIMARY KEY \(owner_uid, idempotency_key\)|ON CONFLICT DO NOTHING/);
  assert.match(repository, /WHERE owner_uid=\$1 AND idempotency_key=\$2 FOR UPDATE/);
  assert.match(repository, /revision=\$9 AND state='acquiring'/);
});
