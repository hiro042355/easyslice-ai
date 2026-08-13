import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V000006 defines the minimal durable ownership schema", async () => {
  const sql = await readFile("db/workflow/migrations/V000006__add_durable_media_ownership.sql", "utf8");
  for (const table of ["workflow.jobs", "workflow.media", "workflow.exports"]) assert.match(sql, new RegExp(`CREATE TABLE ${table.replace(".", "\\.")}`));
  assert.match(sql, /owner_uid text NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(job_id\) REFERENCES workflow\.jobs\(id\)/);
  assert.equal((sql.match(/owner_uid text/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /email|filename|client|GRANT|CREATE ROLE/);
});
