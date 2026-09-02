import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SessionId } from "../../lib/server/productionIdentity/types";
import {
  PRODUCTION_WORKFLOW_API_CSRF_ACTIVE_TOKEN_CEILING,
  PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION,
  PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_LIFETIME_MS,
  type ProductionWorkflowApiCsrfRandomAuthority,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfTypes";
import {
  PRODUCTION_WORKFLOW_API_CSRF_DIGEST_DOMAIN,
  PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_RAW_TOKEN_LENGTH,
  calculateProductionWorkflowApiCsrfExpiry,
  compareProductionWorkflowApiCsrfDigests,
  createProductionWorkflowApiCsrfMaterial,
  digestParsedProductionWorkflowApiCsrfToken,
  generateProductionWorkflowApiCsrfToken,
  isProductionWorkflowApiCsrfExpired,
  parseProductionWorkflowApiCsrfToken,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfToken";

const TOKEN_ID = Uint8Array.from({ length: 16 }, (_, index) => index);
const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index + 32);

function deterministicAuthority(requests: number[] = []): ProductionWorkflowApiCsrfRandomAuthority {
  return {
    randomBytes(byteLength) {
      requests.push(byteLength);
      return byteLength === 16 ? TOKEN_ID.slice() : SECRET.slice();
    },
  };
}

function generatedToken() {
  const generated = generateProductionWorkflowApiCsrfToken(deterministicAuthority());
  assert.equal(generated.status, "generated");
  if (generated.status !== "generated") throw new Error("deterministic generation failed");
  return generated;
}

function frame(component: Uint8Array): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(component.byteLength, 0);
  return Buffer.concat([length, component]);
}

test("generates the exact canonical csrf1 token with required entropy", () => {
  const requests: number[] = [];
  const generated = generateProductionWorkflowApiCsrfToken(deterministicAuthority(requests));
  assert.equal(generated.status, "generated");
  assert.deepEqual(requests, [16, 32]);
  if (generated.status !== "generated") return;
  assert.equal(generated.token.length, PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_RAW_TOKEN_LENGTH);
  assert.equal(generated.token.includes("="), false);
  const parsed = parseProductionWorkflowApiCsrfToken(generated.token);
  assert.equal(parsed.status, "parsed");
  if (parsed.status === "parsed") {
    assert.equal(parsed.value.tokenVersion, "csrf1");
    assert.equal(parsed.value.tokenIdBytes.byteLength, 16);
    assert.equal(parsed.value.secretBytes.byteLength, 32);
    assert.deepEqual(parsed.value.tokenIdBytes, TOKEN_ID);
    assert.deepEqual(parsed.value.secretBytes, SECRET);
  }
});

test("strict parsing rejects malformed, noncanonical, truncated, and oversized values", () => {
  const valid = generatedToken().token;
  const [, tokenId, secret] = valid.split(".");
  for (const malformed of [
    `${valid}=`,
    valid.replace(tokenId, `${tokenId.slice(0, -1)}+`),
    `csrf1.${tokenId}`,
    `csrf1.${tokenId}.${secret}.extra`,
    `csrf2.${tokenId}.${secret}`,
    `csrf1..${secret}`,
    `csrf1.${tokenId.slice(0, -1)}.${secret}`,
    `csrf1.${tokenId}.${secret.slice(0, -1)}`,
    `csrf1.${tokenId}A.${secret}`,
    ` ${valid}`,
    `${valid} `,
    `${valid}${"A".repeat(100)}`,
  ]) assert.deepEqual(parseProductionWorkflowApiCsrfToken(malformed), { status: "invalid" }, malformed);
});

test("digest is deterministic, domain-separated, explicitly framed, and 32 bytes", () => {
  const generated = generatedToken();
  const parsed = parseProductionWorkflowApiCsrfToken(generated.token);
  assert.equal(parsed.status, "parsed");
  if (parsed.status !== "parsed") return;
  const digest = digestParsedProductionWorkflowApiCsrfToken(parsed.value);
  const expected = createHash("sha256")
    .update(frame(Buffer.from(PRODUCTION_WORKFLOW_API_CSRF_DIGEST_DOMAIN, "utf8")))
    .update(frame(Buffer.from(PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION, "utf8")))
    .update(frame(Buffer.from("csrf1", "utf8")))
    .update(frame(TOKEN_ID))
    .update(frame(SECRET))
    .digest();
  assert.equal(digest.byteLength, 32);
  assert.deepEqual(digest, new Uint8Array(expected));
  assert.deepEqual(digestParsedProductionWorkflowApiCsrfToken(parsed.value), digest);

  const changedId = generateProductionWorkflowApiCsrfToken({ randomBytes: (length) => length === 16 ? Uint8Array.from(TOKEN_ID, (byte) => byte ^ 1) : SECRET });
  const changedSecret = generateProductionWorkflowApiCsrfToken({ randomBytes: (length) => length === 16 ? TOKEN_ID : Uint8Array.from(SECRET, (byte) => byte ^ 1) });
  assert.equal(changedId.status, "generated");
  assert.equal(changedSecret.status, "generated");
  if (changedId.status === "generated") assert.notDeepEqual(changedId.digest, digest);
  if (changedSecret.status === "generated") assert.notDeepEqual(changedSecret.digest, digest);
  assert.notDeepEqual(createHash("sha256").update(generated.token).digest(), digest);
});

test("digest comparison succeeds only for equal fixed-length digests", () => {
  const digest = generatedToken().digest;
  assert.equal(compareProductionWorkflowApiCsrfDigests(digest, digest.slice()), true);
  const unequal = digest.slice();
  unequal[0] ^= 1;
  assert.equal(compareProductionWorkflowApiCsrfDigests(digest, unequal), false);
  assert.equal(compareProductionWorkflowApiCsrfDigests(digest, digest.slice(1)), false);
  assert.doesNotThrow(() => compareProductionWorkflowApiCsrfDigests(digest, new Uint8Array()));
});

test("expiry is capped by policy and exact authenticated-session expiry", () => {
  const issuedAt = 2_000_000;
  assert.deepEqual(calculateProductionWorkflowApiCsrfExpiry(issuedAt, issuedAt + 60 * 60 * 1000), {
    status: "valid",
    expiresAt: issuedAt + PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_LIFETIME_MS,
  });
  assert.deepEqual(calculateProductionWorkflowApiCsrfExpiry(issuedAt, issuedAt + 60_000), {
    status: "valid",
    expiresAt: issuedAt + 60_000,
  });
  assert.deepEqual(calculateProductionWorkflowApiCsrfExpiry(issuedAt, issuedAt), { status: "invalid" });
  assert.deepEqual(calculateProductionWorkflowApiCsrfExpiry(issuedAt, issuedAt - 1), { status: "invalid" });
  assert.equal(isProductionWorkflowApiCsrfExpired(issuedAt + 60_000, issuedAt + 60_000), true);
  assert.equal(isProductionWorkflowApiCsrfExpired(issuedAt + 60_001, issuedAt + 60_000), true);
  assert.equal(isProductionWorkflowApiCsrfExpired(issuedAt + 59_999, issuedAt + 60_000), false);
});

test("persistence material is exact-session scoped and excludes raw token and secret", () => {
  const result = createProductionWorkflowApiCsrfMaterial({
    sessionId: "trusted-session" as SessionId,
    issuedAt: 10_000,
    sessionExpiresAt: 20_000,
    randomAuthority: deterministicAuthority(),
  });
  assert.equal(result.status, "created");
  assert.equal(PRODUCTION_WORKFLOW_API_CSRF_ACTIVE_TOKEN_CEILING, 4);
  if (result.status !== "created") return;
  assert.deepEqual(Object.keys(result.material).sort(), [
    "digest",
    "digestAlgorithm",
    "digestVersion",
    "expiresAt",
    "issuedAt",
    "lifecycleState",
    "materialVersion",
    "sessionId",
    "tokenId",
  ]);
  assert.equal(result.material.sessionId, "trusted-session");
  assert.equal(result.material.expiresAt, 20_000);
  assert.equal("token" in result.material, false);
  assert.equal("secret" in result.material, false);
  assert.equal(JSON.stringify(result.material).includes(result.token), false);
});

test("production CSRF foundation has a fixture-free, route-free, database-free runtime closure", () => {
  const files = ["productionWorkflowApiCsrfTypes.ts", "productionWorkflowApiCsrfToken.ts"];
  const source = files
    .map((file) => readFileSync(join(process.cwd(), "lib", "server", "workflowApi", file), "utf8"))
    .join("\n");
  for (const forbidden of [
    /from ["']pg["']/u,
    /postgres|\bSQL\b|\bSELECT\b|\bINSERT\b|\bDELETE\s+FROM\b/iu,
    /fixture|referenceWorkflow|test helper/iu,
    /BrowserSession|localStorage|sessionStorage/iu,
    /route\.ts|\bRequest\b|\bResponse\b/u,
    /\bfetch\s*\(|youtube|provider call|\baws\b|\bgcp\b/iu,
    /new Map|globalThis/u,
    /lib\/workflowApi\/types|lib\/workflowUi\/types/u,
  ]) assert.doesNotMatch(source, forbidden);
});
