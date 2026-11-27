import assert from "node:assert/strict";
import test from "node:test";
import type { IdentityPoolClient } from "google-auth-library";
import {
  AUTHORIZED_BUCKET_MAP,
  createProductionMediaBucket,
  resolveAuthorizedBucketName,
} from "../../lib/server/productionMediaRuntime/gcsAdapter";

test("resolveAuthorizedBucketName: 1. Production + production bucket succeeds", () => {
  const result = resolveAuthorizedBucketName("production", AUTHORIZED_BUCKET_MAP.production);
  assert.equal(result, "nexcut-prod-jp-2026-media");
});

test("resolveAuthorizedBucketName: 2. Production + staging bucket throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName("production", AUTHORIZED_BUCKET_MAP.staging),
    /Invalid Production media bucket authority: expected "nexcut-prod-jp-2026-media", received "easyslice-staging-media-artifacts"/,
  );
});

test("resolveAuthorizedBucketName: 3. Staging + staging bucket succeeds", () => {
  const result = resolveAuthorizedBucketName("staging", AUTHORIZED_BUCKET_MAP.staging);
  assert.equal(result, "easyslice-staging-media-artifacts");
});

test("resolveAuthorizedBucketName: 4. Staging + production bucket throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName("staging", AUTHORIZED_BUCKET_MAP.production),
    /Invalid Production media bucket authority: expected "easyslice-staging-media-artifacts", received "nexcut-prod-jp-2026-media"/,
  );
});

test("resolveAuthorizedBucketName: 5. Missing environment throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName(undefined, AUTHORIZED_BUCKET_MAP.production),
    /Invalid Production media bucket authority: unauthorized environment undefined/,
  );
});

test("resolveAuthorizedBucketName: 6. Unknown environment throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName("development", AUTHORIZED_BUCKET_MAP.production),
    /Invalid Production media bucket authority: unauthorized environment development/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("test", AUTHORIZED_BUCKET_MAP.staging),
    /Invalid Production media bucket authority: unauthorized environment test/,
  );
});

test("resolveAuthorizedBucketName: 7. Missing bucket name throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName("production", undefined),
    /Invalid Production media bucket authority: missing bucket name/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("staging", ""),
    /Invalid Production media bucket authority: missing bucket name/,
  );
});

test("resolveAuthorizedBucketName: 8. Arbitrary bucket name throws", () => {
  assert.throws(
    () => resolveAuthorizedBucketName("production", "arbitrary-unknown-bucket"),
    /Invalid Production media bucket authority: expected "nexcut-prod-jp-2026-media", received "arbitrary-unknown-bucket"/,
  );
  assert.throws(
    () => resolveAuthorizedBucketName("staging", "arbitrary-unknown-bucket"),
    /Invalid Production media bucket authority: expected "easyslice-staging-media-artifacts", received "arbitrary-unknown-bucket"/,
  );
});

test("createProductionMediaBucket: enforces environment-specific bucket creation", () => {
  const authClient = {} as IdentityPoolClient;
  const prodBucket = createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "production");
  assert.equal(prodBucket.name, "nexcut-prod-jp-2026-media");

  const stagingBucket = createProductionMediaBucket(authClient, "easyslice-staging-media-artifacts", "staging");
  assert.equal(stagingBucket.name, "easyslice-staging-media-artifacts");

  assert.throws(
    () => createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", "staging"),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => createProductionMediaBucket(authClient, "easyslice-staging-media-artifacts", "production"),
    /Invalid Production media bucket authority/,
  );
  assert.throws(
    () => createProductionMediaBucket(authClient, "nexcut-prod-jp-2026-media", undefined),
    /unauthorized environment undefined/,
  );
});
