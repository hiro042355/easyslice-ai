import { createHash } from "node:crypto";
import type { ResolvedAsset } from "@/lib/assets/types";
import type { ProviderOperation } from "@/lib/providerClients/types";
import type { OperationAdapterRequest } from "./referenceOperationResumeTypes";

export type SafeFingerprintProjection = Readonly<{
  projectionVersion: "1.0";
  projectionKind: "adapter-request" | "ready-assets" | "materialized-body";
  digest: string;
}>;

type FingerprintInput = {
  operation: ProviderOperation;
  adapterRequest: OperationAdapterRequest;
  readyAssets: readonly ResolvedAsset[];
  materializedBody: unknown;
  pollRevision: number;
  materializerBindingId: string;
  materializerBindingVersion: string;
  providerId: string;
  providerApiVersion: string;
  baselineTime: string;
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const frame = (tag: string, value: string) => `${tag.length}:${tag}${value.length}:${value}`;

export function canonicalizeLengthPrefixed(value: unknown): string {
  if (value === null) return frame("null", "");
  if (value === undefined) return frame("undefined", "");
  if (typeof value === "string") return frame("string", value);
  if (typeof value === "number") return frame("number", Object.is(value, -0) ? "-0" : String(value));
  if (typeof value === "boolean") return frame("boolean", value ? "1" : "0");
  if (Array.isArray(value)) return frame("array", value.map(canonicalizeLengthPrefixed).join(""));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return frame("object", entries.map(([key, item]) => frame("key", key) + canonicalizeLengthPrefixed(item)).join(""));
  }
  return frame("unsupported", typeof value);
}

const expiryClass = (expiresAt: unknown, baselineTime: string) => {
  if (expiresAt === undefined) return "not-required";
  if (typeof expiresAt !== "string") return "invalid";
  const expiry = Date.parse(expiresAt), baseline = Date.parse(baselineTime);
  if (!Number.isFinite(expiry) || !Number.isFinite(baseline)) return "invalid";
  const seconds = (expiry - baseline) / 1000;
  return seconds <= 0 ? "expired" : seconds < 120 ? "under-minimum" : seconds < 3600 ? "short" : seconds < 86400 ? "standard" : "long";
};

const secretKeys = /^(assetId|assetIds|url|streamToken|uploadSourceToken|providerAssetHandle|handle|credentialRef|providerOutputReferences)$/i;
const semanticProjection = (value: unknown, baselineTime: string): unknown => {
  if (Array.isArray(value)) return value.map(item => semanticProjection(item, baselineTime));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>, output: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (secretKeys.test(key)) continue;
    if (key === "expiresAt") output.expiryClass = expiryClass(source[key], baselineTime);
    else output[key] = semanticProjection(source[key], baselineTime);
  }
  return output;
};

const safe = (kind: SafeFingerprintProjection["projectionKind"], value: unknown): SafeFingerprintProjection => Object.freeze({
  projectionVersion: "1.0",
  projectionKind: kind,
  digest: `sha256:${sha256(canonicalizeLengthPrefixed(value))}`,
});

export function createAdapterRequestSafeFingerprintProjection(operation: ProviderOperation, request: OperationAdapterRequest): SafeFingerprintProjection {
  return safe("adapter-request", { operation, request: semanticProjection(request, "1970-01-01T00:00:00.000Z") });
}

export function createReadyAssetSafeFingerprintProjection(operation: ProviderOperation, assets: readonly ResolvedAsset[], baselineTime: string): SafeFingerprintProjection {
  const projection = assets.map(asset => ({
    kind: asset.assetRef.kind,
    usage: asset.usage,
    requirement: asset.requirement,
    sizeBytes: asset.sizeBytes,
    metadata: semanticProjection(asset.metadata, baselineTime),
    integrity: semanticProjection(asset.integrity, baselineTime),
    access: { mode: asset.access.mode, expiryClass: expiryClass("expiresAt" in asset.access ? asset.access.expiresAt : undefined, baselineTime) },
  }));
  return safe("ready-assets", { operation, assets: projection });
}

export function createMaterializedBodySafeFingerprintProjection(operation: ProviderOperation, body: unknown, baselineTime: string): SafeFingerprintProjection {
  return safe("materialized-body", { operation, body: semanticProjection(body, baselineTime) });
}

export function createReferenceMaterializationFingerprint(input: FingerprintInput): string {
  const adapter = createAdapterRequestSafeFingerprintProjection(input.operation, input.adapterRequest);
  const assets = createReadyAssetSafeFingerprintProjection(input.operation, input.readyAssets, input.baselineTime);
  const body = createMaterializedBodySafeFingerprintProjection(input.operation, input.materializedBody, input.baselineTime);
  return `materialization-v1:${sha256(canonicalizeLengthPrefixed({
    operation: input.operation,
    adapter: adapter.digest,
    pollRevision: input.pollRevision,
    materializerBindingId: input.materializerBindingId,
    materializerBindingVersion: input.materializerBindingVersion,
    providerId: input.providerId,
    providerApiVersion: input.providerApiVersion,
    readyAssets: assets.digest,
    materializedBody: body.digest,
  }))}`;
}

export function createReferenceGenerationFingerprint(materializationFingerprint: string, generationClientBindingId: string): string {
  return `generation-v1:${sha256(canonicalizeLengthPrefixed({ materializationFingerprint, generationClientBindingId }))}`;
}
