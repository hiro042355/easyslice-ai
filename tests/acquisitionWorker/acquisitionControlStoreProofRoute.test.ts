import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("temporary control-store proof route is Beta, same-origin, bodyless, and safe-projected", () => {
  const route = readFileSync("app/api/internal/acquisition-control-proof/route.ts", "utf8");
  const client = readFileSync("lib/server/acquisitionWorkerTrust/client.ts", "utf8");
  assert.match(route, /requireAuthenticatedRequest/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /content-length/);
  assert.match(route, /control-store-proof-failed/);
  assert.doesNotMatch(route, /token|credential|cookie|uid|storageKey/iu);
  assert.match(client, /\/internal\/control-store-proof/);
  assert.match(client, /Object\.keys\(evidence\)\.length !== keys\.length/);
});
