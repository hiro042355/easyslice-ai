export type ResponseOwnedBinaryPayloadSchemaVersion = "1.0";

export type ResponseOwnedBinaryPayloadMetadata = Readonly<{
  metadataVersion: "1.0";
  contentLength: number;
  mediaType?: string;
  filename?: string;
}>;

export type ResponseOwnedBinaryPayload = Readonly<{
  schemaVersion: ResponseOwnedBinaryPayloadSchemaVersion;
  bytes: Readonly<Uint8Array>;
  metadata: ResponseOwnedBinaryPayloadMetadata;
}>;
