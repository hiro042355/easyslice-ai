import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/internal/wif-readiness/route";
import {
  executeWifReadiness,
  type WifReadinessOperations,
} from "../../lib/server/productionIdentity/wifReadiness";

const successfulOperations = (): WifReadinessOperations => Object.freeze({
  verifyVercelOidc: async () => undefined,
  verifyFederatedCredential: async () => undefined,
  verifyFirebaseAdmin: async () => undefined,
});

test("readiness progresses through every safe stage", async () => {
  const calls: string[] = [];
  const result = await executeWifReadiness({
    verifyVercelOidc: async () => { calls.push("oidc"); },
    verifyFederatedCredential: async () => { calls.push("federated"); },
    verifyFirebaseAdmin: async () => { calls.push("firebase"); },
  });
  assert.deepEqual(calls, ["oidc", "federated", "firebase"]);
  assert.deepEqual(result, {
    status: "ready",
    stages: {
      vercelOidc: "pass",
      stsExchange: "pass",
      serviceAccountImpersonation: "pass",
      firebaseAdmin: "pass",
    },
  });
});

for (const [name, stage, override] of [
  ["missing OIDC", "vercel-oidc", { verifyVercelOidc: async () => { throw new Error("raw-oidc-token"); } }],
  ["STS or impersonation failure", "federated-credential", { verifyFederatedCredential: async () => { throw new Error("access-token"); } }],
  ["Firebase initialization failure", "firebase-admin", { verifyFirebaseAdmin: async () => { throw new Error("credential-json"); } }],
] as const) {
  test(`${name} returns only a neutral failure stage`, async () => {
    const result = await executeWifReadiness({ ...successfulOperations(), ...override });
    assert.deepEqual(result, { status: "not-ready", stage });
    assert.doesNotMatch(JSON.stringify(result), /token|credential-json|stack|private/i);
  });
}

test("unauthorized route invocation is concealed", async () => {
  const previous = process.env.WIF_READINESS_PROBE_SECRET;
  process.env.WIF_READINESS_PROBE_SECRET = "expected-probe-secret";
  try {
    const response = await POST(new Request("https://www.nexcutai.com/api/internal/wif-readiness", {
      method: "POST",
      headers: { "x-nexcut-wif-readiness-key": "wrong-probe-secret" },
    }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { status: "not-found" });
  } finally {
    if (previous === undefined) delete process.env.WIF_READINESS_PROBE_SECRET;
    else process.env.WIF_READINESS_PROBE_SECRET = previous;
  }
});
