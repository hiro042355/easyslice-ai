import type { AssetResolutionExecutionResult, AssetUsage, ResolvedAsset, ResolvedAssetAccess } from "@/lib/assets/types";
import type { ReferenceMusicRequest, ReferenceMVRequest, ReferenceVocalRequest } from "@/lib/providerRequests/types";

export const BASELINE = "2030-01-01T00:00:00.000Z";
export const FUTURE = "2030-01-01T00:10:00.000Z";
export const EXPIRED = "2029-12-31T23:59:59.000Z";

export function asset(assetId: string, usage: AssetUsage, kind: ResolvedAsset["assetRef"]["kind"], access: ResolvedAssetAccess, requirement: ResolvedAsset["requirement"] = "optional"): ResolvedAsset {
  return {
    assetRef: { assetId, kind },
    usage,
    requirement,
    access,
    sizeBytes: 1,
    metadata: { type: kind === "image" || kind === "character" || kind === "brand" ? "image" : kind === "video" ? "video" : "audio", durationPresent: true, dimensionsPresent: true },
    integrity: { checksumVerified: true, sizeVerified: true },
  };
}

export function resolved(...assets: ResolvedAsset[]): AssetResolutionExecutionResult {
  return {
    status: "resolved",
    assets,
    warnings: [],
    audit: { requiredCount: assets.filter((value) => value.requirement === "required").length, optionalCount: assets.filter((value) => value.requirement === "optional").length, resolvedCount: assets.length, omittedCount: 0, kinds: assets.map((value) => value.assetRef.kind), usages: assets.map((value) => value.usage), transferModes: [], ttlClasses: [], metadataComplete: true, checksumVerified: true, status: "resolved", reasonCodes: [] },
  } as unknown as AssetResolutionExecutionResult;
}

export const signed = (value: string): ResolvedAssetAccess => ({ mode: "signed-url", url: value, expiresAt: FUTURE });

export function vocalRequest(): ReferenceVocalRequest {
  return { requestSchemaVersion: "1.0", language: "ja", lyrics: "private lyrics", durationSeconds: 30, outputFormat: "wav", performance: { delivery: "intimate", dynamics: "gradual", breathiness: 0.2, vibrato: 0.3, articulation: "natural", emotionalExpression: "hope" }, timeline: [{ section: "verse", startSeconds: 0, endSeconds: 30, vocalIntensity: 0.5, tension: 0.4, release: 0.3, isMainPeak: false }], peakTreatment: "lift", outroTreatment: "release" };
}

export function musicRequest(): ReferenceMusicRequest {
  return { requestSchemaVersion: "1.0", durationSeconds: 30, outputFormat: "wav", outputMode: "mix", lyricsMode: "instrumental", tempo: { minBpm: 90, maxBpm: 110, targetBpm: 100 }, performance: { energyCurve: "steady-rise", instrumentationDensity: 0.5, rhythmIntensity: 0.6, harmonicTension: 0.4, dynamicRange: "moderate" }, timeline: [{ section: "verse", startSeconds: 0, endSeconds: 30, musicIntensity: 0.5, tension: 0.4, release: 0.3, densityChange: "hold", transitionStyle: "gentle", purpose: "establish", isMainPeak: false }], peakTreatment: "full-arrangement", afterglowTreatment: "gentle-pulse" };
}

export function mvRequest(): ReferenceMVRequest {
  return { requestSchemaVersion: "1.0", durationSeconds: 30, aspectRatio: "16:9", resolution: "1080p", frameRate: 30, outputFormat: "mp4", audioAssetId: "audio-1", globalDirection: { visualMood: "hope", color: "warm", lighting: "soft", cameraEnergy: 0.5, movement: "controlled", shotDensity: 0.5, transitionIntensity: 0.4, subjectFocus: "intimate", environment: "grounded" }, scenes: [{ sceneId: "scene-1", section: "verse", startSeconds: 0, endSeconds: 15, narrativePurpose: "establish", subject: { type: "abstract", motif: { kind: "light" } }, setting: { environment: "room", timeOfDay: "day" }, action: { actionType: "pause", direction: "still" }, emotionalIntent: "hope", temporalMode: "present", visualIntensity: 0.4, cameraEnergy: 0.3, transitionIntensity: 0.2, isMainPeak: false, isAfterglow: false, assetIds: [] }, { sceneId: "scene-2", section: "outro", startSeconds: 15, endSeconds: 30, narrativePurpose: "resolve", subject: { type: "abstract", motif: { kind: "light" } }, setting: { environment: "room", timeOfDay: "night" }, action: { actionType: "pause", direction: "still" }, emotionalIntent: "hope", temporalMode: "present", visualIntensity: 0.3, cameraEnergy: 0.2, transitionIntensity: 0.1, isMainPeak: false, isAfterglow: true, assetIds: [] }], peak: { sceneId: "scene-1", treatment: "scale-expansion" }, afterglow: { sceneId: "scene-2", treatment: "soft-departure" } };
}

export function safeFailure(value: unknown): string {
  return JSON.stringify(value);
}
