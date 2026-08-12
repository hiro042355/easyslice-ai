import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createVercelWifCredential, readVercelWifConfiguration } from "../../lib/server/productionIdentity/vercelWifCredential";

const configuration = Object.freeze({
  projectId: "nexcut-prod-jp-2026",
  providerResource: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  serviceAccountEmail: "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com",
});

test("Production WIF configuration is explicit and contains no credential material", () => {
  const result = readVercelWifConfiguration({
    GCP_PROJECT_ID: configuration.projectId,
    GCP_WIF_PROVIDER_RESOURCE: configuration.providerResource,
    GCP_WIF_SERVICE_ACCOUNT: configuration.serviceAccountEmail,
  });
  assert.deepEqual(result, configuration);
  assert.equal(JSON.stringify(result).includes("private_key"), false);
  assert.equal(JSON.stringify(result).includes("client_secret"), false);
});

test("missing federation configuration fails closed", () => {
  assert.throws(() => readVercelWifConfiguration({}), /Missing Vercel WIF configuration/);
});

for (const invalid of [
  { ...configuration, projectId: "nexcut-staging" },
  { ...configuration, providerResource: "projects/566365202495/locations/global/workloadIdentityPools/other/providers/vercel-production" },
  { ...configuration, serviceAccountEmail: "nexcut-prod-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com" },
]) {
  test("cross-authority federation configuration is rejected", () => {
    assert.throws(() => createVercelWifCredential(invalid, { getOidcToken: async () => "opaque" }), /Invalid Production/);
  });
}

test("missing Vercel OIDC token fails closed without exposing token material", async () => {
  const credential = createVercelWifCredential(configuration, { getOidcToken: async () => "" });
  await assert.rejects(credential.getAccessToken(), /Vercel OIDC authority is unavailable/);
});

test("WIF exchange failure does not include the raw OIDC token in the application contract", async () => {
  const rawToken = "raw-oidc-token-must-not-leak";
  const credential = createVercelWifCredential(configuration, { getOidcToken: async () => rawToken });
  await assert.rejects(credential.getAccessToken(), (error: unknown) => {
    assert.equal(String(error).includes(rawToken), false);
    return true;
  });
});

test("Terraform trusts only the exact Vercel Production owner and project", () => {
  const source = readFileSync("infra/production/gcp/vercel-wif.tf", "utf8");
  const variables = readFileSync("infra/production/gcp/variables.tf", "utf8");
  assert.match(source, /assertion\.owner_id == '\$\{local\.vercel_owner_id\}'/);
  assert.match(source, /assertion\.project_id == '\$\{local\.vercel_project_id\}'/);
  assert.match(source, /assertion\.environment == 'production'/);
  assert.match(source, /"google\.subject"\s*= "assertion\.sub"/);
  assert.match(source, /allowed_audiences = \["https:\/\/vercel\.com\/\$\{local\.vercel_team_slug\}"\]/);
  assert.match(variables, /vercel_owner_id\s*= "team_DBeBBBY39xi5l6rkzBzAwQ4A"/);
  assert.match(variables, /vercel_project_id\s*= "prj_sfZiLkSZAtz0Mr6v1fW58vNhCxfu"/);
  assert.doesNotMatch(source, /google_service_account_key|roles\/owner|roles\/editor|allUsers/);
});
