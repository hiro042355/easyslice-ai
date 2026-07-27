import { copyResponseOwnedBinaryPayload } from "./responseOwnedBinaryPayloadContract";
import type { ResponseOwnedBinaryPayload } from "./responseOwnedBinaryPayloadTypes";

const REFERENCE_BYTES = Object.freeze([80, 75, 3, 4] as const);

export const createReferenceResponseOwnedBinaryPayload =
  (): ResponseOwnedBinaryPayload =>
    copyResponseOwnedBinaryPayload({
      schemaVersion: "1.0",
      bytes: Uint8Array.from(REFERENCE_BYTES),
      metadata: {
        metadataVersion: "1.0",
        contentLength: REFERENCE_BYTES.length,
        mediaType: "application/octet-stream",
        filename: "reference-output.bin",
      },
    });

export const createReferenceResponseOwnedBinaryPayloadWithoutOptionalMetadata =
  (): ResponseOwnedBinaryPayload =>
    copyResponseOwnedBinaryPayload({
      schemaVersion: "1.0",
      bytes: Uint8Array.from([1, 2, 3]),
      metadata: {
        metadataVersion: "1.0",
        contentLength: 3,
      },
    });

export const createInvalidResponseOwnedBinaryPayloadVersionCandidate =
  (): unknown => ({
    schemaVersion: "2.0",
    bytes: Uint8Array.from(REFERENCE_BYTES),
    metadata: {
      metadataVersion: "1.0",
      contentLength: REFERENCE_BYTES.length,
    },
  });

export const createInvalidResponseOwnedBinaryPayloadLengthCandidate =
  (): unknown => ({
    schemaVersion: "1.0",
    bytes: Uint8Array.from(REFERENCE_BYTES),
    metadata: {
      metadataVersion: "1.0",
      contentLength: REFERENCE_BYTES.length + 1,
    },
  });
