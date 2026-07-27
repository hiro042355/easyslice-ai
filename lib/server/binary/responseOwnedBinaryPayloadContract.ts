import type {
  ResponseOwnedBinaryPayload,
  ResponseOwnedBinaryPayloadMetadata,
} from "./responseOwnedBinaryPayloadTypes";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isResponseOwnedBinaryPayload = (
  value: unknown,
): value is ResponseOwnedBinaryPayload => {
  if (!isRecord(value) || value.schemaVersion !== "1.0") return false;
  if (!(value.bytes instanceof Uint8Array)) return false;
  if (!isRecord(value.metadata) || value.metadata.metadataVersion !== "1.0") {
    return false;
  }

  const contentLength = value.metadata.contentLength;
  return (
    typeof contentLength === "number" &&
    Number.isSafeInteger(contentLength) &&
    contentLength >= 0 &&
    contentLength === value.bytes.byteLength
  );
};

export const copyResponseOwnedBinaryPayload = (
  payload: ResponseOwnedBinaryPayload,
): ResponseOwnedBinaryPayload => {
  const metadata: ResponseOwnedBinaryPayloadMetadata = Object.freeze({
    metadataVersion: "1.0",
    contentLength: payload.metadata.contentLength,
    ...(payload.metadata.mediaType === undefined
      ? {}
      : { mediaType: payload.metadata.mediaType }),
    ...(payload.metadata.filename === undefined
      ? {}
      : { filename: payload.metadata.filename }),
  });

  return Object.freeze({
    schemaVersion: "1.0",
    bytes: Uint8Array.from(payload.bytes),
    metadata,
  });
};
