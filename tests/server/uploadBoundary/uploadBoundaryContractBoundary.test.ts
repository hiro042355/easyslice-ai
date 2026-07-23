import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Upload Boundary contract is type-only, opaque, and storage-neutral", async () => {
  const source = await readFile(new URL("../../../lib/server/uploadBoundary/types.ts", import.meta.url), "utf8");
  assert.equal(/^import\s/mu.test(source), false);
  assert.equal(/\b(?:function|class|enum)\b/u.test(source), false);
  assert.equal(/:\s*(?:Request|Response|NextRequest|NextResponse|File|Blob|Buffer|Uint8Array|ReadableStream)(?:\W|$)/u.test(source), false);
  for (const forbidden of [
    "next/server", "react", "node:fs", "filesystemPath", "absolutePath", "relativePath", "signedUrl",
    "publicUrl", "downloadUrl", "storageBucket", "objectKey", "accessToken", "providerLocator",
    "rawReceipt", "rawChecksum", "database", "Promise<",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
