import assert from "node:assert/strict";
import test from "node:test";
import { isOwnershipRuntimeProbeAuthorized } from "../../lib/server/productionMediaRuntime/ownershipRuntimeProbeAccess";

const secret = "temporary-production-proof-secret-0001";

test("ownership runtime probe is production-only and fail-closed", () => {
  assert.equal(isOwnershipRuntimeProbeAuthorized(secret, { VERCEL_ENV: "preview", OWNERSHIP_RUNTIME_PROBE_SECRET: secret }), false);
  assert.equal(isOwnershipRuntimeProbeAuthorized(null, { VERCEL_ENV: "production", OWNERSHIP_RUNTIME_PROBE_SECRET: secret }), false);
  assert.equal(isOwnershipRuntimeProbeAuthorized("wrong-secret-value-with-safe-length", { VERCEL_ENV: "production", OWNERSHIP_RUNTIME_PROBE_SECRET: secret }), false);
  assert.equal(isOwnershipRuntimeProbeAuthorized(secret, { VERCEL_ENV: "production", OWNERSHIP_RUNTIME_PROBE_SECRET: secret }), true);
});

test("short or missing server authority never enables the probe", () => {
  assert.equal(isOwnershipRuntimeProbeAuthorized("short", { VERCEL_ENV: "production", OWNERSHIP_RUNTIME_PROBE_SECRET: "short" }), false);
  assert.equal(isOwnershipRuntimeProbeAuthorized(secret, { VERCEL_ENV: "production" }), false);
});
