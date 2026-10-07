import assert from "node:assert/strict";
import test from "node:test";
import { restoreServerSession, type RestoredSessionDependencies } from "../../lib/client/restoredServerSession";

const response = (status: number) => ({ status, ok: status === 200 });
function harness(statuses: number[], overrides: Partial<RestoredSessionDependencies> = {}) {
  const calls: string[] = [];
  return { calls, dependencies: {
    async checkSession() { calls.push("GET"); return response(statuses.shift() ?? 500); },
    async restoredUser() { calls.push("restore"); return { async getIdToken(force: boolean) { assert.equal(force, true); calls.push("token"); return "fake-token"; } }; },
    async createSession(token: string) { assert.equal(token, "fake-token"); calls.push("POST"); return response(200); },
    ...overrides,
  } };
}
test("accepted server session does not invoke Firebase or exchange credentials", async () => {
  const h = harness([200]);
  assert.equal(await restoreServerSession(h.dependencies), "authenticated");
  assert.deepEqual(h.calls, ["GET"]);
});
test("restored auth repairs a missing/expired server session and rechecks authorization", async () => {
  const h = harness([401, 200]);
  assert.equal(await restoreServerSession(h.dependencies), "authenticated");
  assert.deepEqual(h.calls, ["GET", "restore", "token", "POST", "GET"]);
});
test("waits for settled Firebase restoration before attempting an exchange", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const h = harness([401, 200], { async restoredUser() { await pending; return { async getIdToken() { return "fake-token"; } }; } });
  const result = restoreServerSession(h.dependencies);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, ["GET"]);
  release();
  assert.equal(await result, "authenticated");
});
test("anonymous Firebase client remains unauthenticated without exchange", async () => {
  const h = harness([401], { async restoredUser() { return null; } });
  assert.equal(await restoreServerSession(h.dependencies), "unauthenticated");
  assert.deepEqual(h.calls, ["GET"]);
});
for (const status of [403, 500, 503]) test(`initial ${status} never attempts session repair`, async () => {
  const h = harness([status]);
  assert.equal(await restoreServerSession(h.dependencies), status === 403 ? "forbidden" : "unavailable");
  assert.deepEqual(h.calls, ["GET"]);
});
for (const status of [401, 403, 500]) test(`exchange rejection ${status} fails closed without recheck/retry`, async () => {
  const h = harness([401], { async createSession() { return response(status); } });
  assert.equal(await restoreServerSession(h.dependencies), status === 401 ? "unauthenticated" : status === 403 ? "forbidden" : "unavailable");
  assert.equal(h.calls.filter(call => call === "GET").length, 1);
});
for (const status of [401, 403, 500]) test(`POST success with subsequent ${status} is never signed in`, async () => {
  const h = harness([401, status]);
  assert.notEqual(await restoreServerSession(h.dependencies), "authenticated");
  assert.equal(h.calls.filter(call => call === "POST").length, 1);
});
test("network and token failures yield safe unavailable state without token output", async () => {
  for (const overrides of [
    { async checkSession(): Promise<never> { throw new Error("secret"); } },
    { async restoredUser() { return { async getIdToken(): Promise<never> { throw new Error("secret"); } }; } },
    { async createSession(): Promise<never> { throw new Error("secret"); } },
  ]) {
    assert.equal(await restoreServerSession(harness([401], overrides).dependencies), "unavailable");
  }
});
