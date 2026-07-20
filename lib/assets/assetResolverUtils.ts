import type { AssetKind } from "@/lib/mvContracts";
import type { AssetMetadata, AssetResolutionErrorCategory, AssetResolutionIssue, AssetResolutionReasonCode, AssetTtlClass, NormalizedAssetResolutionError, ProviderAssetTransferMode } from "./types";

export const TRANSFER_MODES: readonly ProviderAssetTransferMode[] = ["provider-fetch", "nexcut-upload", "provider-native-asset", "internal-stream"];
export const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isSafeOpaqueId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && !/^https?:\/\//i.test(value) && !/[\\/]/.test(value);
export const normalizeMimeType = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return /^[^\s/]+\/[^\s/]+$/.test(mediaType) ? mediaType : undefined;
};
export const isMime = (value: unknown): value is string => normalizeMimeType(value) !== undefined;
export const isFiniteNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
export const issue = (reasonCode: AssetResolutionReasonCode, classification: AssetResolutionIssue["classification"], retryable = false, itemIndex?: number, usage?: AssetResolutionIssue["usage"], kind?: AssetKind): AssetResolutionIssue => ({ reasonCode, classification, ...(itemIndex === undefined ? {} : { itemIndex }), ...(usage ? { usage } : {}), ...(kind ? { kind } : {}), retryable });
export const unique = <T>(values: readonly T[]): T[] => values.filter((value, index) => values.indexOf(value) === index);

export function ttlFor(kind: AssetKind, mode: ProviderAssetTransferMode, requested?: number): { ttlClass: AssetTtlClass; ttlSeconds: number; adjusted: boolean } {
  const internal = mode === "internal-stream";
  const ttlClass: AssetTtlClass = internal ? "stream-short" : kind === "video" ? "video-long" : kind === "image" || kind === "character" || kind === "brand" ? "image-short" : "audio-standard";
  const maximum = internal ? 300 : ttlClass === "video-long" ? 1800 : ttlClass === "image-short" ? 600 : 1200;
  if (requested === undefined) return { ttlClass, ttlSeconds: maximum, adjusted: false };
  const rounded = Math.floor(requested);
  return { ttlClass, ttlSeconds: Math.min(3600, maximum, rounded), adjusted: rounded !== requested || requested > maximum };
}

export function metadataIsValid(metadata: AssetMetadata, kind: AssetKind): boolean {
  const expected = kind === "video" ? "video" : kind === "image" || kind === "character" || kind === "brand" ? "image" : "audio";
  if (metadata.type !== expected) return false;
  const positive = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v > 0);
  const positiveInteger = (v: unknown) => v === undefined || (positive(v) && Number.isInteger(v));
  const nonEmpty = (v: unknown) => v === undefined || (typeof v === "string" && v.trim().length > 0);
  if (metadata.type === "audio") return positive(metadata.durationSeconds) && positiveInteger(metadata.sampleRateHz) && positiveInteger(metadata.channels) && nonEmpty(metadata.codec);
  if (metadata.type === "video") return positive(metadata.durationSeconds) && positiveInteger(metadata.width) && positiveInteger(metadata.height) && positive(metadata.frameRate) && nonEmpty(metadata.codec);
  return positiveInteger(metadata.width) && positiveInteger(metadata.height);
}

const RETRYABLE = new Set<AssetResolutionErrorCategory>(["unavailable", "storage-rate-limit", "storage-timeout", "storage-unavailable", "signed-access-failed"]);
export function normalizeAssetResolutionError(category: unknown): NormalizedAssetResolutionError {
  const categories: AssetResolutionErrorCategory[] = ["not-found", "unavailable", "policy-blocked", "integrity-failed", "metadata-invalid", "storage-authentication", "storage-rate-limit", "storage-timeout", "storage-unavailable", "signed-access-failed", "cancelled", "unknown"];
  const safe = typeof category === "string" && categories.includes(category as AssetResolutionErrorCategory) ? category as AssetResolutionErrorCategory : "unknown";
  return { category: safe, message: `Asset resolution ${safe}.`, retryable: RETRYABLE.has(safe) };
}

export function addSecondsToReferenceIso(base: string, seconds: number): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/.exec(base);
  if (!match) return "[mock-ephemeral]";
  const total = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]) + seconds;
  if (total >= 86400) return "[mock-ephemeral]";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${match[1]}T${pad(Math.floor(total / 3600))}:${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}.000Z`;
}
