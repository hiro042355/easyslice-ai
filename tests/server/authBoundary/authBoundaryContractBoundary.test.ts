import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Auth Boundary contract remains type-only and provider-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/authBoundary/types.ts", import.meta.url), "utf8");
  assert.equal(/^import\s/mu.test(source), false);
  assert.equal(/\b(?:function|class|enum)\b/u.test(source), false);
  assert.equal(/=>\s*(?:Promise|void|boolean|string|number)/u.test(source), false);
  for (const forbidden of [
    "next/server", "react", "supabase", "firebase", "clerk", "nextauth", "auth.js", "jose", "jsonwebtoken",
    "database", "httpAdapter", "JWT", "accessToken", "refreshToken",
    "password", "apiSecret", "rawCredential", "signedCookieValue",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(/from\s+["'][^"']*(?:workflow|httpAdapter)[^"']*["']/iu.test(source), false);
  assert.equal(/:\s*(?:Request|Response|NextRequest|NextResponse)(?:\W|$)/u.test(source), false);
});
