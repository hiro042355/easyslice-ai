import type { AssetKind, AssetReference } from "@/lib/mvContracts";
import { TRANSFER_MODES, deepCopy, isMime, isObject, isSafeOpaqueId, issue, normalizeMimeType, ttlFor, unique } from "./assetResolverUtils";
import type { AssetMetadataRequirement, AssetPolicyContext, AssetResolutionInput, AssetResolutionIssue, AssetResolutionPlanItem, AssetResolutionPlanResult, AssetResolutionPurpose, AssetUsage, ProviderAssetTransferMode } from "./types";

const PURPOSES: AssetResolutionPurpose[] = ["vocal-generation", "music-generation", "mv-generation", "provider-upload", "preview", "export"];
const USAGES: AssetUsage[] = ["audio-conditioning", "reference-image", "reference-video", "character-identity", "location-reference", "guide-vocal", "guide-melody", "lyrics-input", "preview-source", "export-source"];
const KINDS: AssetKind[] = ["audio", "voice", "image", "video", "character", "brand", "melody"];

function refValid(ref: unknown): ref is AssetReference {
  if (!isObject(ref) || !isSafeOpaqueId(ref.assetId) || !KINDS.includes(ref.kind as AssetKind)) return false;
  if (ref.mimeType !== undefined && !isMime(ref.mimeType)) return false;
  for (const key of ["durationSeconds", "width", "height"] as const) if (ref[key] !== undefined && (typeof ref[key] !== "number" || !Number.isFinite(ref[key]) || ref[key] <= 0)) return false;
  return ref.checksum === undefined || (typeof ref.checksum === "string" && ref.checksum.length > 0);
}

function selectMode(access: Record<string, unknown>, policy: AssetPolicyContext): ProviderAssetTransferMode | undefined {
  const allowed = access.allowedModes === undefined ? [...TRANSFER_MODES] : access.allowedModes as ProviderAssetTransferMode[];
  const permitted = policy.externalTransferAllowed ? allowed : allowed.filter(mode => mode === "internal-stream");
  const preferred = access.preferredMode as ProviderAssetTransferMode;
  return permitted.includes(preferred) ? preferred : TRANSFER_MODES.find(mode => permitted.includes(mode));
}

export function buildAssetResolutionPlan(input: AssetResolutionInput): AssetResolutionPlanResult {
  const raw: unknown = input;
  const issues: AssetResolutionIssue[] = [];
  if (!isObject(raw)) return { status: "invalid", issues: [issue("input-shape-invalid", "validation")] };
  if (raw.contractVersion !== "1.0") issues.push(issue("contract-version-unsupported", "validation"));
  if (!PURPOSES.includes(raw.purpose as AssetResolutionPurpose)) issues.push(issue("purpose-unsupported", "validation"));
  const policy = raw.policyContext;
  if (!isObject(policy)) issues.push(issue("policy-context-invalid", "validation"));
  else {
    if (typeof policy.policyVersion !== "string" || policy.policyVersion.length === 0) issues.push(issue("policy-version-unsupported", "validation"));
    if (typeof policy.externalTransferAllowed !== "boolean" || (policy.deletionPending !== undefined && typeof policy.deletionPending !== "boolean")) issues.push(issue("policy-context-invalid", "validation"));
  }
  const access = raw.accessRequirements;
  if (!isObject(access)) issues.push(issue("access-requirements-invalid", "validation"));
  else {
    for (const key of ["requireChecksum", "requireDurationMetadata", "requireDimensions"] as const) if (access[key] !== undefined && typeof access[key] !== "boolean") issues.push(issue("access-requirements-invalid", "validation"));
  }
  if (!Array.isArray(raw.items)) issues.push(issue("items-invalid", "validation"));
  if (issues.length) return { status: "invalid", issues };

  const items = raw.items as unknown[];
  items.forEach((item, index) => {
    if (!isObject(item) || !refValid(item.assetRef)) issues.push(issue("asset-reference-invalid", "validation", false, index));
    if (!isObject(item) || (item.requirement !== "required" && item.requirement !== "optional")) issues.push(issue("requirement-invalid", "validation", false, index));
    if (!isObject(item) || !USAGES.includes(item.usage as AssetUsage)) issues.push(issue("usage-invalid", "validation", false, index));
  });
  if (issues.length) return { status: "invalid", issues };

  const typed = items as AssetResolutionInput["items"];
  const seenRefs = new Map<string, AssetReference>();
  for (const [index, item] of typed.entries()) {
    const old = seenRefs.get(item.assetRef.assetId);
    if (old && (old.kind !== item.assetRef.kind || old.mimeType !== item.assetRef.mimeType || old.checksum !== item.assetRef.checksum)) issues.push(issue("duplicate-asset-conflict", "validation", false, index, item.usage, item.assetRef.kind));
    else seenRefs.set(item.assetRef.assetId, item.assetRef);
  }
  const allowed = (access as Record<string, unknown>).allowedModes;
  if (!TRANSFER_MODES.includes((access as Record<string, unknown>).preferredMode as ProviderAssetTransferMode) || (allowed !== undefined && (!Array.isArray(allowed) || allowed.length === 0 || allowed.some(v => !TRANSFER_MODES.includes(v as ProviderAssetTransferMode))))) issues.push(issue("access-mode-unsupported", "validation"));
  const requestedTtl = (access as Record<string, unknown>).requestedTtlSeconds;
  if (requestedTtl !== undefined && (typeof requestedTtl !== "number" || !Number.isFinite(requestedTtl) || requestedTtl < 1)) issues.push(issue("access-requirements-invalid", "validation"));
  const mime = (access as Record<string, unknown>).requiredMimeTypes;
  if (mime !== undefined && (!Array.isArray(mime) || mime.some(v => !isMime(v)) || unique(mime.map(normalizeMimeType)).length !== mime.length)) issues.push(issue("access-requirements-invalid", "validation"));
  const maxSize = (access as Record<string, unknown>).maxSizeBytes;
  if (maxSize !== undefined && (typeof maxSize !== "number" || !Number.isFinite(maxSize) || maxSize < 0)) issues.push(issue("access-requirements-invalid", "validation"));
  if (issues.length) return { status: "invalid", issues: issues.filter((value, index, all) => all.findIndex(other => other.reasonCode === value.reasonCode && other.itemIndex === value.itemIndex) === index) };
  const mode = selectMode(access as Record<string, unknown>, policy as AssetPolicyContext);
  if (!mode) issues.push(issue((policy as AssetPolicyContext).externalTransferAllowed ? "access-mode-unsupported" : "external-transfer-blocked", "policy"));
  if ((policy as AssetPolicyContext).deletionPending) issues.push(issue("deletion-pending", "policy"));
  if ((policy as AssetPolicyContext).sourceRegion && (policy as AssetPolicyContext).destinationRegion && (policy as AssetPolicyContext).sourceRegion !== (policy as AssetPolicyContext).destinationRegion) issues.push(issue("region-policy-blocked", "policy"));
  if (issues.length) return { status: "invalid", issues };

  const normalized: typeof typed[number][] = [];
  const warnings = [] as NonNullable<Extract<AssetResolutionPlanResult, { status: "planned" }>["plan"]>["warnings"];
  for (const [index, item] of typed.entries()) {
    const previous = normalized.find(v => v.assetRef.assetId === item.assetRef.assetId && v.usage === item.usage);
    if (!previous) normalized.push(deepCopy(item));
    else {
      if (item.requirement === "required") previous.requirement = "required";
      warnings.push({ reasonCode: "duplicate-item-normalized", itemIndex: index, usage: item.usage, kind: item.assetRef.kind });
    }
  }
  const preferredMode = (access as Record<string, unknown>).preferredMode as ProviderAssetTransferMode;
  if (mode !== preferredMode) warnings.push({ reasonCode: "access-mode-unsupported" });
  const requiredMetadata: AssetMetadataRequirement[] = [...((access as Record<string, unknown>).requireDurationMetadata ? ["duration" as const] : []), ...((access as Record<string, unknown>).requireDimensions ? ["dimensions" as const] : [])];
  const planItems: AssetResolutionPlanItem[] = normalized.map((item, index) => {
    const ttl = ttlFor(item.assetRef.kind, mode!, (access as Record<string, unknown>).requestedTtlSeconds as number | undefined);
    if (ttl.adjusted) warnings.push({ reasonCode: "signed-url-ttl-adjusted", itemIndex: index, usage: item.usage, kind: item.assetRef.kind });
    return { assetRef: deepCopy(item.assetRef), requirement: item.requirement, usage: item.usage, transferMode: mode!, ttlClass: ttl.ttlClass, ttlSeconds: ttl.ttlSeconds, requiredMetadata: [...requiredMetadata], requireChecksum: (access as Record<string, unknown>).requireChecksum === true, requiredMimeTypes: (((access as Record<string, unknown>).requiredMimeTypes as string[] | undefined) ?? []).map(value => normalizeMimeType(value)!), ...((access as Record<string, unknown>).maxSizeBytes === undefined ? {} : { maxSizeBytes: (access as Record<string, unknown>).maxSizeBytes as number }) };
  });
  return { status: "planned", plan: { planVersion: "1.0", resolverVersion: "rule-v1", purpose: raw.purpose as AssetResolutionPurpose, items: planItems, warnings: deepCopy(warnings) }, issues: [] };
}
