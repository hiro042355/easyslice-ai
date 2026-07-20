import type { AssetReference } from "@/lib/mvContracts";
import type { AssetMetadata, AssetRecord, ReferenceAssetInspection } from "./types";

export type ReferenceLogicalAssetFixtureId =
  | "reference-logical-audio-fixture-v1"
  | "reference-logical-image-fixture-v1"
  | "reference-logical-video-fixture-v1";

export type ReferenceLogicalAssetFixtureDescriptor = Readonly<{
  fixtureVersion: "1.0";
  fixtureId: ReferenceLogicalAssetFixtureId;
  kind: "audio" | "image" | "video";
  mimeClass: "audio" | "image" | "video";
  supportedOperations: readonly string[];
  availability: "reference-test-only";
}>;

type CatalogEntry = Readonly<{
  descriptor: ReferenceLogicalAssetFixtureDescriptor;
  internalStoreKey: "fixture-audio" | "fixture-image" | "fixture-video";
  logicalAssetId: "reference-logical-audio-asset-v1" | "reference-logical-image-asset-v1" | "reference-logical-video-asset-v1";
  mimeType: "audio/wav" | "image/png" | "video/mp4";
  sizeBytes: 1024;
  checksum: "sha256:reference-fixture";
  metadata: AssetMetadata;
}>;

const entries: readonly CatalogEntry[] = Object.freeze([
  Object.freeze({ descriptor: Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", kind: "audio", mimeClass: "audio", supportedOperations: Object.freeze(["generate-vocal", "generate-music", "generate-mv"]), availability: "reference-test-only" }), internalStoreKey: "fixture-audio", logicalAssetId: "reference-logical-audio-asset-v1", mimeType: "audio/wav", sizeBytes: 1024, checksum: "sha256:reference-fixture", metadata: Object.freeze({ type: "audio", durationSeconds: 30, sampleRateHz: 48000, channels: 2, codec: "reference-codec" }) }),
  Object.freeze({ descriptor: Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-image-fixture-v1", kind: "image", mimeClass: "image", supportedOperations: Object.freeze(["generate-mv"]), availability: "reference-test-only" }), internalStoreKey: "fixture-image", logicalAssetId: "reference-logical-image-asset-v1", mimeType: "image/png", sizeBytes: 1024, checksum: "sha256:reference-fixture", metadata: Object.freeze({ type: "image", width: 1280, height: 720, orientation: 1, hasAlpha: false }) }),
  Object.freeze({ descriptor: Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-video-fixture-v1", kind: "video", mimeClass: "video", supportedOperations: Object.freeze(["generate-mv"]), availability: "reference-test-only" }), internalStoreKey: "fixture-video", logicalAssetId: "reference-logical-video-asset-v1", mimeType: "video/mp4", sizeBytes: 1024, checksum: "sha256:reference-fixture", metadata: Object.freeze({ type: "video", durationSeconds: 30, width: 1280, height: 720, frameRate: 30, codec: "reference-codec" }) }),
]);

const copy = <T>(value: T): T => structuredClone(value);
const findPublic = (fixtureId: ReferenceLogicalAssetFixtureId) => entries.find(entry => entry.descriptor.fixtureId === fixtureId);

export function listReferenceLogicalAssetFixtureDescriptors(): readonly ReferenceLogicalAssetFixtureDescriptor[] {
  return copy(entries.map(entry => entry.descriptor));
}

export function getReferenceLogicalAssetFixtureDescriptor(fixtureId: ReferenceLogicalAssetFixtureId): ReferenceLogicalAssetFixtureDescriptor | undefined {
  const entry = findPublic(fixtureId);
  return entry ? copy(entry.descriptor) : undefined;
}

export function createReferenceLogicalAssetReferenceFromCatalog(fixtureId: ReferenceLogicalAssetFixtureId): AssetReference | undefined {
  const entry = findPublic(fixtureId);
  if (!entry) return undefined;
  const metadata = entry.metadata;
  return {
    assetId: entry.logicalAssetId,
    kind: entry.descriptor.kind,
    mimeType: entry.mimeType,
    ...(metadata.type === "audio" || metadata.type === "video" ? { durationSeconds: metadata.durationSeconds } : {}),
    ...(metadata.type === "image" || metadata.type === "video" ? { width: metadata.width, height: metadata.height } : {}),
    checksum: entry.checksum,
  };
}

function createStoreRecord(entry: CatalogEntry, assetId: string): AssetRecord {
  const schemaVersion: "1.0" = "1.0", locatorVersion: "1.0" = "1.0", status: "available" = "available", retentionClass: "project" = "project", integrityState: "verified" = "verified";
  const base = { schemaVersion, assetId, mimeType: entry.mimeType, sizeBytes: entry.sizeBytes, checksum: entry.checksum, storageLocator: { locatorVersion, locatorId: `opaque-${entry.internalStoreKey}` }, status, region: "reference-region", retentionClass, integrityState };
  if (entry.descriptor.kind === "audio" && entry.metadata.type === "audio") return { ...base, kind: "audio", metadata: copy(entry.metadata) };
  if (entry.descriptor.kind === "image" && entry.metadata.type === "image") return { ...base, kind: "image", metadata: copy(entry.metadata) };
  if (entry.descriptor.kind === "video" && entry.metadata.type === "video") return { ...base, kind: "video", metadata: copy(entry.metadata) };
  throw new Error("reference-asset-fixture-catalog-invalid");
}

export function getReferenceAssetStoreFixture(lookupKey: string): Readonly<{ record: AssetRecord; inspection: ReferenceAssetInspection }> | undefined {
  const entry = entries.find(candidate => candidate.internalStoreKey === lookupKey || candidate.logicalAssetId === lookupKey);
  if (!entry) return undefined;
  const record = createStoreRecord(entry, lookupKey);
  const inspection: ReferenceAssetInspection = { contentType: entry.mimeType, detectedMimeType: entry.mimeType, actualSizeBytes: entry.sizeBytes, actualChecksum: entry.checksum };
  return { record, inspection };
}
