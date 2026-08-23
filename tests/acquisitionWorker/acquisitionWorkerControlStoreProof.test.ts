import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("temporary control-store proof uses ADC and exposes only a fixed private route", () => {
  const proof = readFileSync("worker/acquisition/controlStoreProof.ts", "utf8");
  const service = readFileSync("worker/acquisition/httpService.ts", "utf8");
  const main = readFileSync("worker/acquisition/main.ts", "utf8");
  assert.match(proof, /createAdcAccessTokenSupplier/);
  assert.match(proof, /ACQUISITION_CONTROL_PREFIX/);
  assert.match(proof, /mediaPrefixDenied/);
  assert.match(proof, /listingCallCount: 0/);
  assert.doesNotMatch(proof, /metadata\.google\.internal|169\.254\.169\.254|createMetadataAccessTokenSupplier/);
  assert.match(service, /POST.*\/internal\/control-store-proof/s);
  assert.match(main, /controlStoreProof: execution\.controlStoreProof/);
});

test("temporary proof remains disconnected from acquisition and product routes", () => {
  const acquisition = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/page.tsx", "utf8");
  assert.doesNotMatch(`${acquisition}\n${workspace}\n${aiMv}`, /control-store-proof|runProductionControlStoreProof/);
});
