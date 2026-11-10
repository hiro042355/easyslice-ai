import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V000008 defines baseline asset_import_requests schema and youtube constraint", () => {
  const sql = readFileSync("db/workflow/migrations/V000008__add_asset_import_idempotency.sql", "utf8");
  assert.match(sql, /CREATE TABLE workflow\.asset_import_requests/);
  assert.match(sql, /owner_uid text NOT NULL/);
  assert.match(sql, /idempotency_key text NOT NULL/);
  assert.match(sql, /command_version text NOT NULL/);
  assert.match(sql, /request_fingerprint bytea NOT NULL/);
  assert.match(sql, /platform text NOT NULL/);
  assert.match(sql, /canonical_source_id text NOT NULL/);
  assert.match(sql, /normalized_url text NOT NULL/);
  assert.match(sql, /state text NOT NULL/);
  assert.match(sql, /job_id uuid/);
  assert.match(sql, /media_id uuid/);
  assert.match(sql, /CONSTRAINT ck_asset_import_authority CHECK \(command_version = '1\.0' AND platform = 'youtube'\)/);
  assert.match(sql, /CONSTRAINT ck_asset_import_key CHECK \(idempotency_key ~ '\^\[A-Za-z0-9\._~-\]\{1,128\}\$'\)/);
  assert.match(sql, /FOREIGN KEY \(job_id, owner_uid\) REFERENCES workflow\.jobs\(id, owner_uid\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(media_id, job_id\) REFERENCES workflow\.media\(id, job_id\) ON DELETE RESTRICT/);
});

test("V000009 safely drops and recreates ck_asset_import_authority for youtube and tiktok", () => {
  const sql = readFileSync("db/workflow/migrations/V000009__expand_asset_import_platform.sql", "utf8");
  assert.match(sql, /ALTER TABLE workflow\.asset_import_requests[\s\S]+DROP CONSTRAINT ck_asset_import_authority;/);
  assert.match(sql, /ALTER TABLE workflow\.asset_import_requests[\s\S]+ADD CONSTRAINT ck_asset_import_authority[\s\S]+CHECK \(command_version = '1\.0' AND platform IN \('youtube', 'tiktok'\)\);/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE|DROP COLUMN/);
});
