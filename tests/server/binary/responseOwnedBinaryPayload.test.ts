import assert from "node:assert/strict";
import test from "node:test";
import {
  copyResponseOwnedBinaryPayload,
  isResponseOwnedBinaryPayload,
} from "../../../lib/server/binary/responseOwnedBinaryPayloadContract";
import {
  createInvalidResponseOwnedBinaryPayloadLengthCandidate,
  createInvalidResponseOwnedBinaryPayloadVersionCandidate,
  createReferenceResponseOwnedBinaryPayload,
  createReferenceResponseOwnedBinaryPayloadWithoutOptionalMetadata,
} from "../../../lib/server/binary/referenceResponseOwnedBinaryPayloadFixtures";

test("reference payload represents deterministic bytes and metadata", () => {
  const payload = createReferenceResponseOwnedBinaryPayload();

  assert.equal(payload.schemaVersion, "1.0");
  assert.deepEqual(payload.bytes, Uint8Array.from([80, 75, 3, 4]));
  assert.deepEqual(payload.metadata, {
    metadataVersion: "1.0",
    contentLength: 4,
    mediaType: "application/octet-stream",
    filename: "reference-output.bin",
  });
  assert.equal(isResponseOwnedBinaryPayload(payload), true);
  assert.equal(
    isResponseOwnedBinaryPayload(
      createReferenceResponseOwnedBinaryPayloadWithoutOptionalMetadata(),
    ),
    true,
  );
});

test("shape guard rejects unsupported versions and inconsistent lengths", () => {
  assert.equal(
    isResponseOwnedBinaryPayload(
      createInvalidResponseOwnedBinaryPayloadVersionCandidate(),
    ),
    false,
  );
  assert.equal(
    isResponseOwnedBinaryPayload(
      createInvalidResponseOwnedBinaryPayloadLengthCandidate(),
    ),
    false,
  );
  assert.equal(isResponseOwnedBinaryPayload(undefined), false);
  assert.equal(isResponseOwnedBinaryPayload({}), false);
});

test("fixture and copy operations isolate mutable byte views", () => {
  const first = createReferenceResponseOwnedBinaryPayload();
  const second = createReferenceResponseOwnedBinaryPayload();

  (first.bytes as Uint8Array)[0] = 0;
  assert.equal(second.bytes[0], 80);

  const copied = copyResponseOwnedBinaryPayload(second);
  (second.bytes as Uint8Array)[1] = 0;
  assert.equal(copied.bytes[1], 75);
  assert.notEqual(copied.bytes, second.bytes);
  assert.equal(Object.isFrozen(copied), true);
  assert.equal(Object.isFrozen(copied.metadata), true);
});
