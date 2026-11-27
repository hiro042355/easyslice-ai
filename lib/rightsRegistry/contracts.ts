import { createHash } from "node:crypto";

export const RIGHTS_STATUSES = ["ACTIVE", "REVOKED", "EXPIRED", "SUPERSEDED"] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const RIGHTS_LICENSE_KINDS = [
  "OWNED",
  "LICENSED",
  "AI_GENERATED",
  "OFFICIAL_API_LICENSE",
  "ALLOWED_STORAGE",
] as const;
export type RightsLicenseKind = (typeof RIGHTS_LICENSE_KINDS)[number];

export const RIGHTS_PLATFORMS = ["youtube", "tiktok", "bilibili"] as const;
export type RightsPlatform = (typeof RIGHTS_PLATFORMS)[number];

export const RIGHTS_USAGES = [
  "PUBLICATION",
  "COMMERCIAL_USE",
  "MODIFICATION",
  "BINARY_ACQUISITION",
  "REDISTRIBUTION",
] as const;
export type RightsUsage = (typeof RIGHTS_USAGES)[number];

export type PlatformPermission = Readonly<{
  platform: RightsPlatform;
  allowed: boolean;
  usages: readonly RightsUsage[];
  expiresAtMs?: number;
}>;

export type RightsEvidenceInput = Readonly<{
  ownerUid: string;
  tenantId: string;
  rightsKey: string;
  sourceId: string;
  assetId?: string;
  licenseKind: RightsLicenseKind;
  licenseRef: string;
  evidenceRef: string;
  evidenceDigest: string;
  permittedUsage: readonly RightsUsage[];
  platformPermissions: readonly PlatformPermission[];
  effectiveAtMs: number;
  expiresAtMs?: number;
}>;

export type RightsRecord = Readonly<{
  id: string;
  rightsKey: string;
  ownerUid: string;
  tenantId: string;
  sourceId: string;
  assetId: string | null;
  licenseKind: RightsLicenseKind;
  licenseRef: string;
  evidenceRef: string;
  evidenceDigest: string;
  permittedUsage: readonly RightsUsage[];
  platformPermissions: readonly PlatformPermission[];
  status: RightsStatus;
  effectiveAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revision: number;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type RightsAuditEvent = Readonly<{
  eventId: number;
  rightsId: string;
  action: "CREATED" | "REVISED" | "REVOKED" | "REVALIDATED";
  revision: number;
  detail: string | null;
  createdAt: string;
}>;

export type RightsResult =
  | Readonly<{ code: "APPLIED"; record: RightsRecord }>
  | Readonly<{ code: "NOT_FOUND" }>
  | Readonly<{ code: "CONFLICT"; record?: RightsRecord }>
  | Readonly<{ code: "INVALID"; detail: string }>;

export type RightsValidation =
  | Readonly<{ allowed: true; record: RightsRecord; snapshot: PublicationRightsSnapshot }>
  | Readonly<{
      allowed: false;
      code:
        | "RIGHTS_NOT_FOUND"
        | "RIGHTS_REVOKED"
        | "RIGHTS_EXPIRED"
        | "RIGHTS_NOT_YET_EFFECTIVE"
        | "RIGHTS_PLATFORM_NOT_PERMITTED"
        | "RIGHTS_USAGE_NOT_PERMITTED";
    }>;

export type PublicationRightsSnapshot = Readonly<{
  rightsRecordId: string;
  rightsKey: string;
  revision: number;
  sourceId: string;
  assetId: string | null;
  licenseKind: RightsLicenseKind;
  licenseRef: string;
  evidenceRef: string;
  evidenceDigest: string;
  permittedUsage: readonly RightsUsage[];
  platform: RightsPlatform;
  platformPermission: PlatformPermission;
  effectiveAtMs: number;
  expiresAtMs?: number;
  capturedAtMs: number;
}>;

const REF = /^[A-Za-z0-9_.:@/-]{1,512}$/;
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isSafeTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function canonicalRightsDigest(input: Readonly<{
  licenseKind: RightsLicenseKind;
  licenseRef: string;
  evidenceRef: string;
  permittedUsage: readonly RightsUsage[];
  platformPermissions: readonly PlatformPermission[];
  effectiveAtMs: number;
  expiresAtMs?: number;
}>): string {
  return createHash("sha256").update(JSON.stringify({
    licenseKind: input.licenseKind,
    licenseRef: input.licenseRef,
    evidenceRef: input.evidenceRef,
    permittedUsage: [...input.permittedUsage].sort(),
    platformPermissions: input.platformPermissions
      .map(permission => ({ ...permission, usages: [...permission.usages].sort() }))
      .sort((left, right) => left.platform.localeCompare(right.platform)),
    effectiveAtMs: input.effectiveAtMs,
    expiresAtMs: input.expiresAtMs ?? null,
  })).digest("hex");
}

export function validateRightsEvidenceInput(value: unknown): RightsEvidenceInput | undefined {
  if (!isObject(value) || !ID.test(String(value.rightsKey ?? "")) ||
      !ID.test(String(value.sourceId ?? "")) || !REF.test(String(value.licenseRef ?? "")) ||
      !REF.test(String(value.evidenceRef ?? "")) || !HEX.test(String(value.evidenceDigest ?? ""))) {
    return undefined;
  }
  if (!RIGHTS_LICENSE_KINDS.includes(value.licenseKind as RightsLicenseKind) ||
      !isSafeTime(value.effectiveAtMs) ||
      (value.expiresAtMs !== undefined && (!isSafeTime(value.expiresAtMs) || value.expiresAtMs <= value.effectiveAtMs)) ||
      !Array.isArray(value.permittedUsage) || value.permittedUsage.length === 0 ||
      !value.permittedUsage.every(usage => RIGHTS_USAGES.includes(usage as RightsUsage)) ||
      !Array.isArray(value.platformPermissions) || value.platformPermissions.length === 0) {
    return undefined;
  }
  const permissions: PlatformPermission[] = [];
  for (const raw of value.platformPermissions) {
    if (!isObject(raw) || !RIGHTS_PLATFORMS.includes(raw.platform as RightsPlatform) ||
        typeof raw.allowed !== "boolean" || !Array.isArray(raw.usages) ||
        raw.usages.length === 0 || !raw.usages.every(usage => RIGHTS_USAGES.includes(usage as RightsUsage)) ||
        (raw.expiresAtMs !== undefined && !isSafeTime(raw.expiresAtMs))) {
      return undefined;
    }
    permissions.push(Object.freeze({
      platform: raw.platform as RightsPlatform,
      allowed: raw.allowed,
      usages: Object.freeze([...new Set(raw.usages as RightsUsage[])]),
      ...(raw.expiresAtMs !== undefined ? { expiresAtMs: raw.expiresAtMs as number } : {}),
    }));
  }
  if (typeof value.ownerUid !== "string" || value.ownerUid.length < 1 || value.ownerUid.length > 256 ||
      typeof value.tenantId !== "string" || value.tenantId.length < 1 || value.tenantId.length > 256) {
    return undefined;
  }
  return Object.freeze({
    ownerUid: value.ownerUid,
    tenantId: value.tenantId,
    rightsKey: value.rightsKey as string,
    sourceId: value.sourceId as string,
    ...(typeof value.assetId === "string" && ID.test(value.assetId) ? { assetId: value.assetId } : {}),
    licenseKind: value.licenseKind as RightsLicenseKind,
    licenseRef: value.licenseRef as string,
    evidenceRef: value.evidenceRef as string,
    evidenceDigest: value.evidenceDigest as string,
    permittedUsage: Object.freeze([...new Set(value.permittedUsage as RightsUsage[])]),
    platformPermissions: Object.freeze(permissions),
    effectiveAtMs: value.effectiveAtMs,
    ...(value.expiresAtMs !== undefined ? { expiresAtMs: value.expiresAtMs as number } : {}),
  });
}

export function validateRightsAt(
  record: RightsRecord,
  platform: RightsPlatform,
  nowMs = Date.now(),
  usage: RightsUsage = "PUBLICATION",
): RightsValidation {
  if (record.status === "REVOKED") return Object.freeze({ allowed: false, code: "RIGHTS_REVOKED" });
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= nowMs) {
    return Object.freeze({ allowed: false, code: "RIGHTS_EXPIRED" });
  }
  if (Date.parse(record.effectiveAt) > nowMs) {
    return Object.freeze({ allowed: false, code: "RIGHTS_NOT_YET_EFFECTIVE" });
  }
  if (!record.permittedUsage.includes(usage)) {
    return Object.freeze({ allowed: false, code: "RIGHTS_USAGE_NOT_PERMITTED" });
  }
  const permission = record.platformPermissions.find(entry => entry.platform === platform);
  if (!permission || !permission.allowed || !permission.usages.includes(usage) ||
      (permission.expiresAtMs !== undefined && permission.expiresAtMs <= nowMs)) {
    return Object.freeze({ allowed: false, code: "RIGHTS_PLATFORM_NOT_PERMITTED" });
  }
  return Object.freeze({
    allowed: true,
    record,
    snapshot: Object.freeze({
      rightsRecordId: record.id,
      rightsKey: record.rightsKey,
      revision: record.revision,
      sourceId: record.sourceId,
      assetId: record.assetId,
      licenseKind: record.licenseKind,
      licenseRef: record.licenseRef,
      evidenceRef: record.evidenceRef,
      evidenceDigest: record.evidenceDigest,
      permittedUsage: record.permittedUsage,
      platform,
      platformPermission: permission,
      effectiveAtMs: Date.parse(record.effectiveAt),
      ...(record.expiresAt ? { expiresAtMs: Date.parse(record.expiresAt) } : {}),
      capturedAtMs: nowMs,
    }),
  });
}

export function decodeRightsRecord(value: unknown): RightsRecord | undefined {
  if (!isObject(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : undefined;
  const status = value.status;
  const licenseKind = value.license_kind;
  const ownerUid = value.owner_uid;
  const tenantId = value.tenant_id;
  const revision = typeof value.revision === "number" ? value.revision : Number(value.revision);
  const effectiveAt = value.effective_at instanceof Date ? value.effective_at.toISOString() : value.effective_at;
  const expiresAt = value.expires_at === null || value.expires_at === undefined
    ? null
    : value.expires_at instanceof Date ? value.expires_at.toISOString() : value.expires_at;
  const revokedAt = value.revoked_at === null || value.revoked_at === undefined
    ? null
    : value.revoked_at instanceof Date ? value.revoked_at.toISOString() : value.revoked_at;
  const createdAt = value.created_at instanceof Date ? value.created_at.toISOString() : value.created_at;
  const updatedAt = value.updated_at instanceof Date ? value.updated_at.toISOString() : value.updated_at;
  if (!id || !RIGHTS_STATUSES.includes(status as RightsStatus) ||
      !RIGHTS_LICENSE_KINDS.includes(licenseKind as RightsLicenseKind) ||
      typeof ownerUid !== "string" || typeof tenantId !== "string" ||
      typeof value.rights_key !== "string" || typeof value.source_id !== "string" ||
      typeof value.license_ref !== "string" || typeof value.evidence_ref !== "string" ||
      !HEX.test(String(value.evidence_digest)) || !Number.isSafeInteger(revision) || revision < 1 ||
      typeof effectiveAt !== "string" || !Number.isFinite(Date.parse(effectiveAt)) ||
      (expiresAt !== null && (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)))) ||
      (revokedAt !== null && (typeof revokedAt !== "string" || !Number.isFinite(Date.parse(revokedAt)))) ||
      typeof createdAt !== "string" || typeof updatedAt !== "string" ||
      !Array.isArray(value.permitted_usage) || !Array.isArray(value.platform_permissions)) {
    return undefined;
  }
  const permittedUsage = value.permitted_usage.filter(
    (entry): entry is RightsUsage => RIGHTS_USAGES.includes(entry as RightsUsage),
  );
  const platformPermissions: PlatformPermission[] = [];
  for (const entry of value.platform_permissions) {
    if (!isObject(entry) || !RIGHTS_PLATFORMS.includes(entry.platform as RightsPlatform) ||
        typeof entry.allowed !== "boolean" || !Array.isArray(entry.usages)) return undefined;
    platformPermissions.push(Object.freeze({
      platform: entry.platform as RightsPlatform,
      allowed: entry.allowed,
      usages: Object.freeze(entry.usages.filter(
        (usage): usage is RightsUsage => RIGHTS_USAGES.includes(usage as RightsUsage),
      )),
      ...(typeof entry.expiresAtMs === "number" ? { expiresAtMs: entry.expiresAtMs } : {}),
    }));
  }
  return Object.freeze({
    id,
    rightsKey: value.rights_key,
    ownerUid,
    tenantId,
    sourceId: value.source_id,
    assetId: typeof value.asset_id === "string" ? value.asset_id : null,
    licenseKind: licenseKind as RightsLicenseKind,
    licenseRef: value.license_ref,
    evidenceRef: value.evidence_ref,
    evidenceDigest: value.evidence_digest as string,
    permittedUsage: Object.freeze(permittedUsage),
    platformPermissions: Object.freeze(platformPermissions),
    status: status as RightsStatus,
    effectiveAt: new Date(effectiveAt).toISOString(),
    expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
    revokedAt: revokedAt === null ? null : new Date(revokedAt).toISOString(),
    revision,
    supersedesId: typeof value.supersedes_id === "string" ? value.supersedes_id : null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  });
}
