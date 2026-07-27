import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  ResponseOwnedBinaryPayload,
  ResponseOwnedBinaryPayloadMetadata,
} from "../../../lib/server/binary/responseOwnedBinaryPayloadTypes";

test("public contract is readonly, versioned, and based on Uint8Array", () => {
  const metadata: ResponseOwnedBinaryPayloadMetadata = {
    metadataVersion: "1.0",
    contentLength: 2,
  };
  const payload: ResponseOwnedBinaryPayload = {
    schemaVersion: "1.0",
    bytes: Uint8Array.from([1, 2]),
    metadata,
  };

  assert.equal(payload.bytes.byteLength, payload.metadata.contentLength);
});

test("existing foundations have no reverse dependency on the binary contract", () => {
  const existingSources = [
    "../../../lib/server/mediaExecutionComposition/types.ts",
    "../../../lib/server/routeMigration/types.ts",
    "../../../lib/server/httpAdapter/types.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  for (const source of existingSources) {
    assert.doesNotMatch(source, /server\/binary|responseOwnedBinaryPayload/);
  }
});
