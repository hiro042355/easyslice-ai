import assert from "node:assert/strict";
import test from "node:test";
import {
  createSingleFlight,
  establishGoogleIdentitySession,
} from "../../lib/client/googleIdentitySignIn";

const credential = (idToken = "opaque-id-token") => ({
  user: { async getIdToken(forceRefresh: boolean) {
    assert.equal(forceRefresh, true);
    return idToken;
  } },
});

test("popup success establishes the canonical server session without exposing token material", async () => {
  let receivedToken = "";
  const result = await establishGoogleIdentitySession({
    async openPopup() { return credential(); },
    async createSession(idToken) { receivedToken = idToken; return { ok: true }; },
  });
  assert.deepEqual(result, { status: "authenticated" });
  assert.equal(receivedToken, "opaque-id-token");
  assert.equal(JSON.stringify(result).includes("opaque-id-token"), false);
});

test("popup failures retain only safe classifications", async () => {
  for (const [code, reason] of [
    ["auth/popup-blocked", "popup-blocked"],
    ["auth/popup-closed-by-user", "popup-closed"],
    ["auth/cancelled-popup-request", "popup-closed"],
    ["auth/internal-error", "unexpected"],
  ] as const) {
    const result = await establishGoogleIdentitySession({
      async openPopup() { throw Object.assign(new Error("sensitive provider detail"), { code }); },
      async createSession() { throw new Error("must not run"); },
    });
    assert.deepEqual(result, { status: "failed", reason });
    assert.equal(JSON.stringify(result).includes("sensitive provider detail"), false);
  }
});

test("a popup that never settles is recovered as a retryable UI timeout", async () => {
  let sessionCalls = 0;
  const result = await establishGoogleIdentitySession({
    openPopup: () => new Promise(() => undefined),
    async createSession() { sessionCalls += 1; return { ok: true }; },
    popupTimeoutMs: 5,
  });
  assert.deepEqual(result, { status: "failed", reason: "popup-timeout" });
  assert.equal(sessionCalls, 0);
});

test("session rejection remains distinct from popup failure", async () => {
  const result = await establishGoogleIdentitySession({
    async openPopup() { return credential(); },
    async createSession() { return { ok: false }; },
  });
  assert.deepEqual(result, { status: "failed", reason: "session-rejected" });
});

test("single-flight prevents duplicate popup invocation and recovers after completion", async () => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const run = createSingleFlight(async () => { calls += 1; await pending; return "done"; });

  const first = run();
  assert.deepEqual(await run(), { status: "already-running" });
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, { status: "started", value: "done" });
  assert.deepEqual(await run(), { status: "started", value: "done" });
  assert.equal(calls, 2);
});
