import type { AssetReference } from "@/lib/mvContracts";
import type { AssetRequirement, AssetUsage } from "@/lib/assets/types";
import { createReferenceLogicalAssetReferenceFromCatalog } from "@/lib/assets/referenceAssetFixtureCatalog";

export type ReferenceLogicalAssetFixtureInput =
  | Readonly<{ fixtureVersion: "1.0"; fixtureId: "reference-logical-audio-fixture-v1"; operation: "generate-vocal"; slot: "reference-voice"; usage: "guide-vocal"; requirement: "optional" }>
  | Readonly<{ fixtureVersion: "1.0"; fixtureId: "reference-logical-audio-fixture-v1"; operation: "generate-music"; slot: "reference-audio"; usage: "audio-conditioning"; requirement: "optional" }>
  | Readonly<{ fixtureVersion: "1.0"; fixtureId: "reference-logical-audio-fixture-v1"; operation: "generate-mv"; slot: "audio"; usage: "audio-conditioning"; requirement: "required" }>
  | Readonly<{ fixtureVersion: "1.0"; fixtureId: "reference-logical-image-fixture-v1"; operation: "generate-mv"; slot: "reference-image"; usage: "reference-image"; requirement: "optional" }>
  | Readonly<{ fixtureVersion: "1.0"; fixtureId: "reference-logical-video-fixture-v1"; operation: "generate-mv"; slot: "reference-video"; usage: "reference-video"; requirement: "optional" }>;

export type ReferenceLogicalAssetFixtureResult =
  | Readonly<{ status: "ready"; operation: ReferenceLogicalAssetFixtureInput["operation"]; slot: ReferenceLogicalAssetFixtureInput["slot"]; usage: AssetUsage; requirement: AssetRequirement; asset: AssetReference }>
  | Readonly<{ status: "invalid" | "unsupported"; issues: readonly Readonly<{ reasonCode: "logical-asset-fixture-invalid" | "logical-asset-fixture-unsupported" | "fixture-operation-mismatch" | "fixture-slot-mismatch" }>[] }>;

const keys = ["fixtureVersion", "fixtureId", "operation", "slot", "usage", "requirement"] as const;
const combinations: readonly ReferenceLogicalAssetFixtureInput[] = Object.freeze([
  Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-vocal", slot: "reference-voice", usage: "guide-vocal", requirement: "optional" }),
  Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-music", slot: "reference-audio", usage: "audio-conditioning", requirement: "optional" }),
  Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-audio-fixture-v1", operation: "generate-mv", slot: "audio", usage: "audio-conditioning", requirement: "required" }),
  Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-image-fixture-v1", operation: "generate-mv", slot: "reference-image", usage: "reference-image", requirement: "optional" }),
  Object.freeze({ fixtureVersion: "1.0", fixtureId: "reference-logical-video-fixture-v1", operation: "generate-mv", slot: "reference-video", usage: "reference-video", requirement: "optional" }),
]);

function isPlainData(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => "value" in descriptor);
}
function read(value: object, key: string): unknown { return Object.getOwnPropertyDescriptor(value, key)?.value; }
function matches(value: object, candidate: ReferenceLogicalAssetFixtureInput): boolean { return keys.every(key => read(value, key) === candidate[key]); }

export function createReferenceLogicalAssetFixture(value: unknown): ReferenceLogicalAssetFixtureResult {
  if (!isPlainData(value) || Object.keys(value).length !== keys.length || !Object.keys(value).every(key => keys.some(expected => expected === key))) return { status: "invalid", issues: [{ reasonCode: "logical-asset-fixture-invalid" }] };
  const candidate = combinations.find(combination => matches(value, combination));
  if (!candidate) return { status: "unsupported", issues: [{ reasonCode: "logical-asset-fixture-unsupported" }] };
  const asset = createReferenceLogicalAssetReferenceFromCatalog(candidate.fixtureId);
  if (!asset) return { status: "invalid", issues: [{ reasonCode: "logical-asset-fixture-invalid" }] };
  return structuredClone({ status: "ready", operation: candidate.operation, slot: candidate.slot, usage: candidate.usage, requirement: candidate.requirement, asset });
}
