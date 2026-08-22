import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ENVIRONMENT_B_PROOF_DESTINATIONS,
  runEnvironmentBProof,
} from "../../lib/server/acquisitionWorkerTrust/environmentBProofContract";

test("Environment B proof accepts correct audience, rejects wrong audience, and projects safe booleans", async () => {
  const audiences: string[] = [];
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const result = await runEnvironmentBProof({
    async getIdToken(audience) {
      audiences.push(audience);
      return audience === ENVIRONMENT_B_PROOF_DESTINATIONS.worker ? "opaque-correct" : "opaque-wrong";
    },
    async fetch(input, init) {
      const authorization = new Headers(init?.headers).get("authorization");
      requests.push({ url: input, authorization });
      if (authorization === "Bearer opaque-wrong") return new Response(null, { status: 403 });
      if (input.endsWith("/readyz")) return Response.json({ ready: true });
      if (input.endsWith("/internal/structured-log-proof")) return Response.json({ success: true, youtubeAttemptCount: 0 });
      return Response.json({
        staticEgressAuthorityConfigured: true,
        observedEgressMatchesReservedAuthority: true,
        youtubeAttemptCount: 0,
      });
    },
  });
  assert.deepEqual(audiences, [ENVIRONMENT_B_PROOF_DESTINATIONS.worker, ENVIRONMENT_B_PROOF_DESTINATIONS.wrongAudience]);
  assert.deepEqual(requests.map(({ url }) => url), [
    `${ENVIRONMENT_B_PROOF_DESTINATIONS.worker}/readyz`,
    `${ENVIRONMENT_B_PROOF_DESTINATIONS.worker}/readyz`,
    `${ENVIRONMENT_B_PROOF_DESTINATIONS.worker}/internal/network-readiness`,
    `${ENVIRONMENT_B_PROOF_DESTINATIONS.worker}/internal/structured-log-proof`,
  ]);
  assert.deepEqual(result, {
    success: true,
    evidence: {
      environmentBReady: true,
      correctAudienceAccepted: true,
      wrongAudienceRejected: true,
      staticEgressAuthorityConfigured: true,
      observedEgressMatchesReservedAuthority: true,
      structuredLogProof: true,
      youtubeAttemptCount: 0,
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /opaque-|authorization|token|credential|cookie|uid|ipify/i);
});

test("temporary Owner route is session, Beta, same-origin, and safe-projection gated", () => {
  const route = readFileSync("app/api/internal/environment-b-network-proof/route.ts", "utf8");
  const proof = readFileSync("lib/server/acquisitionWorkerTrust/environmentBProofContract.ts", "utf8");
  assert.match(route, /requireAuthenticatedRequest/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /environment-b-proof-failed/);
  assert.doesNotMatch(route, /request\.json|searchParams|NEXT_PUBLIC_|allUsers|allAuthenticatedUsers/);
  assert.match(proof, /youtubeAttemptCount: 0/);
  assert.doesNotMatch(`${route}\n${proof}`, /youtube\.com|youtu\.be|sourceUrl|yt-dlp|storageKey|ownerUid/);
});

test("Environment A and acquisition route remain disconnected from temporary proof", () => {
  const a = readFileSync("infra/production/gcp/acquisition-worker.tf", "utf8");
  const ingest = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  assert.doesNotMatch(`${a}\n${ingest}\n${aiMv}\n${workspace}`, /environment-b-network-proof|EXPECTED_EGRESS_IP|internal\/network-readiness/);
});
