import test from "node:test";
import assert from "node:assert/strict";
import { createCharacterReadClient } from "../../lib/server/characterEngine/clientCore";
import { createDevelopmentCastingStore } from "../../lib/server/characterEngine/developmentCasting";

test("Character production isolation rejects even an enabled compatibility config without transport", async () => {
  const previous = process.env;
  process.env = { ...previous, NODE_ENV: "production" };
  let calls = 0;
  try {
    for (const baseUrl of ["https://character.invalid/api/v1", "http://127.0.0.1/api/v1", "https://other.invalid/api/v1"]) {
      const client = createCharacterReadClient({ enabled: true, baseUrl, allowedOrigin: "https://character.invalid", bearerToken: "synthetic-not-a-real-credential" }, async (): Promise<never> => { calls++; throw new Error("unexpected-transport"); });
      assert.deepEqual(Object.keys(client), ["lockedIdentity"]);
      assert.deepEqual(await client.lockedIdentity("hero", "hero-rev-1"), { ok: false, code: "DISABLED" });
    }
    assert.equal(calls, 0);
  } finally { process.env = previous; }
});

test("development Casting and Scene storage cannot be constructed in production", () => {
  const previous = process.env;
  process.env = { ...previous, NODE_ENV: "production" };
  let authorityCalls = 0;
  const forbidden = async (): Promise<never> => { authorityCalls++; throw new Error("unexpected-authority-call"); };
  try {
    assert.throws(() => createDevelopmentCastingStore({ authorizeProject: forbidden, sceneBelongsToProject: forbidden, lockedIdentity: forbidden }), /DEVELOPMENT_ONLY/);
    assert.equal(authorityCalls, 0);
  } finally { process.env = previous; }
});
