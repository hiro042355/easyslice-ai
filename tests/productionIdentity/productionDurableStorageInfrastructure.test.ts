import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(`infra/production/gcp/${name}`, "utf8");
const all = ["cloud-sql.tf", "identities.tf", "media-storage.tf", "services.tf", "vercel-wif.tf"].map(read).join("\n");

test("Production durable storage foundation is private, keyless, and isolated", () => {
  const sql = read("cloud-sql.tf");
  const storage = read("media-storage.tf");
  const wif = read("vercel-wif.tf");

  assert.match(sql, /database_version\s*=\s*"POSTGRES_18"/);
  assert.match(sql, /tier\s*=\s*"db-custom-1-3840"/);
  assert.match(sql, /connector_enforcement\s*=\s*"REQUIRED"/);
  assert.match(sql, /cloudsql\.iam_authentication/);
  assert.doesNotMatch(sql, /authorized_networks|password\s*=/);
  assert.match(storage, /uniform_bucket_level_access\s*=\s*true/);
  assert.match(storage, /public_access_prevention\s*=\s*"enforced"/);
  assert.match(storage, /days_since_custom_time\s*=\s*7/);
  assert.doesNotMatch(storage, /allUsers|allAuthenticatedUsers|nexcut-production-tfstate/);
  assert.match(wif, /google_service_account\.media_runtime\.name/);
  assert.doesNotMatch(wif, /web_auth[^\n]*(storage|cloudsql)|roles\/(storage|cloudsql)/);
  assert.doesNotMatch(all, /google_service_account_key|roles\/owner|roles\/editor/);
});
