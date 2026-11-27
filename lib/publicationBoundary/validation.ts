import type { PublicationIntent, PublicationValidation } from "./contracts";

const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export const isPublicationDataIdentifier = identifier;
export const isPublicationSha256Declaration = digest;

// Capture data descriptors once; never invoke accessor properties or re-read
// the input through `get`. Reflection on a Proxy can still run its traps;
// this is data validation, not a sandbox for arbitrary JavaScript objects.
function record(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return undefined;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) return undefined;
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

/** Total snapshot helper for candidate declaration validators, not a proof issuer. */
export function snapshotPublicationDataRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | undefined {
  try { return record(value, keys); } catch { return undefined; }
}

/** Pure request validation; does not resolve media, certify digests or authorize. */
export function validatePublicationIntent(value: unknown): PublicationValidation {
  const invalid = Object.freeze({ code: "INVALID_REQUEST", authenticated: false, uploadAuthorized: false } as const);
  try {
    const data = record(value, ["schemaVersion", "platform", "operationId", "idempotencyKey", "asset", "metadataDigest", "privacyStatus"]);
    if (!data) return invalid;
    if (data.schemaVersion !== 1 || typeof data.platform !== "string"
      || !["youtube", "tiktok", "bilibili"].includes(data.platform)
      || !identifier(data.operationId) || !identifier(data.idempotencyKey)
      || !digest(data.metadataDigest) || data.privacyStatus !== "private") return invalid;
    const asset = record(data.asset, ["artifactId", "revisionId", "mediaDigest", "mimeType", "size"]);
    if (!asset
      || !identifier(asset.artifactId) || !identifier(asset.revisionId) || !digest(asset.mediaDigest)
      || typeof asset.mimeType !== "string" || !/^video\/[A-Za-z0-9.+-]+$/.test(asset.mimeType)
      || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size < 1) return invalid;
    const intent: PublicationIntent = Object.freeze({
      schemaVersion: 1,
      platform: data.platform === "youtube" ? "youtube" : data.platform === "tiktok" ? "tiktok" : "bilibili",
      operationId: data.operationId, idempotencyKey: data.idempotencyKey,
      asset: Object.freeze({ artifactId: asset.artifactId, revisionId: asset.revisionId,
        mediaDigest: asset.mediaDigest, mimeType: asset.mimeType, size: asset.size }),
      metadataDigest: data.metadataDigest, privacyStatus: "private",
    });
    return Object.freeze({ code: "REQUEST_DATA_VALID", authenticated: false, uploadAuthorized: false, intent });
  } catch {
    return invalid;
  }
}
