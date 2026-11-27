import { canonicalJson, hmacSha256Base64Url, macEquals } from "./canonicalJson";
import type { PublicationPrincipal } from "./principal";
import type { AssetAdmission } from "./assetAdmission";
import { isPublicationContentFormatForPlatform, type PublicationContentFormat } from "../publicationRecords/metadata";

/**
 * Publication handoff grant (CORE_R11 PROPOSED item 3: Digest Attestation transport).
 *
 * The grant is a short-lived, audience-scoped, signed statement that this Core
 * publication id belongs to this owner for this exact artifact revision and digest.
 * It carries no provider credential and no OAuth token: the adapter still has to
 * resolve its own account/session before it may call TikTok.
 */
export const PUBLICATION_GRANT_VERSION = "publication-grant-v1" as const;
export const PUBLICATION_GRANT_AUDIENCE = "tiktok-publisher" as const;
export const PUBLICATION_GRANT_DEFAULT_TTL_MS = 10 * 60 * 1000;
export const PUBLICATION_GRANT_MAX_TTL_MS = 30 * 60 * 1000;

export type PublicationGrantClaims = Readonly<{
  grantVersion: typeof PUBLICATION_GRANT_VERSION;
  grantId: string;
  keyId: string;
  audience: typeof PUBLICATION_GRANT_AUDIENCE;
  platform: "tiktok";
  ownerUid: string;
  tenantId: string;
  publicationId: string;
  operationId: string;
  idempotencyKey: string;
  asset: Readonly<{ artifactId: string; revisionId: string; mediaDigest: string; mimeType: string; size: number }>;
  metadataDigest: string;
  contentFormat: PublicationContentFormat;
  admissionDigest: string;
  privacyStatus: "private";
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}>;

export type GrantIssueInput = Readonly<{
  principal: PublicationPrincipal;
  publicationId: string;
  admission: Extract<AssetAdmission, { code: "ASSET_ADMITTED" }>;
  contentFormat: PublicationContentFormat;
  signingKey: string;
  keyId: string;
  grantId: string;
  now?: number;
  ttlMs?: number;
}>;

export type GrantIssueResult =
  | Readonly<{ code: "GRANT_ISSUED"; token: string; claims: PublicationGrantClaims }>
  | Readonly<{ code: "GRANT_ISSUE_REJECTED"; reason: "PLATFORM_NOT_TIKTOK" | "CONTENT_FORMAT_MISMATCH" | "TTL_INVALID" | "INPUT_INVALID" }>;

const invalidIssue = (reason: "PLATFORM_NOT_TIKTOK" | "CONTENT_FORMAT_MISMATCH" | "TTL_INVALID" | "INPUT_INVALID"): GrantIssueResult =>
  Object.freeze({ code: "GRANT_ISSUE_REJECTED" as const, reason });

const encode = (value: unknown): string | undefined => {
  const json = canonicalJson(value);
  return json === undefined ? undefined : Buffer.from(json, "utf8").toString("base64url");
};

export function issuePublicationGrant(input: GrantIssueInput): GrantIssueResult {
  if (!input.publicationId || !input.grantId || !input.keyId || !input.signingKey) return invalidIssue("INPUT_INVALID");
  if (input.admission.platform !== "tiktok") return invalidIssue("PLATFORM_NOT_TIKTOK");
  if (!isPublicationContentFormatForPlatform(input.contentFormat, "tiktok")) return invalidIssue("CONTENT_FORMAT_MISMATCH");
  if (input.admission.ownerUid !== input.principal.ownerUid || input.admission.tenantId !== input.principal.tenantId) {
    return invalidIssue("INPUT_INVALID");
  }
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? PUBLICATION_GRANT_DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > PUBLICATION_GRANT_MAX_TTL_MS) return invalidIssue("TTL_INVALID");

  const asset = input.admission.intent.asset;
  const claims: PublicationGrantClaims = Object.freeze({
    grantVersion: PUBLICATION_GRANT_VERSION,
    grantId: input.grantId,
    keyId: input.keyId,
    audience: PUBLICATION_GRANT_AUDIENCE,
    platform: "tiktok" as const,
    ownerUid: input.principal.ownerUid,
    tenantId: input.principal.tenantId,
    publicationId: input.publicationId,
    operationId: input.admission.intent.operationId,
    idempotencyKey: input.admission.intent.idempotencyKey,
    asset: Object.freeze({
      artifactId: asset.artifactId,
      revisionId: asset.revisionId,
      mediaDigest: asset.mediaDigest,
      mimeType: asset.mimeType,
      size: asset.size,
    }),
    metadataDigest: input.admission.intent.metadataDigest,
    contentFormat: input.contentFormat,
    admissionDigest: input.admission.admissionDigest,
    privacyStatus: "private" as const,
    issuedAtEpochMs: now,
    expiresAtEpochMs: now + ttlMs,
  });
  const payload = encode(claims);
  if (!payload) return invalidIssue("INPUT_INVALID");
  const mac = hmacSha256Base64Url(input.signingKey, `${PUBLICATION_GRANT_VERSION}.${payload}`);
  return Object.freeze({ code: "GRANT_ISSUED" as const, token: `${PUBLICATION_GRANT_VERSION}.${payload}.${mac}`, claims });
}

export type GrantVerification =
  | Readonly<{ code: "GRANT_VERIFIED"; claims: PublicationGrantClaims }>
  | Readonly<{
      code: "GRANT_REJECTED";
      reason:
        | "MALFORMED"
        | "UNKNOWN_KEY"
        | "INVALID_SIGNATURE"
        | "AUDIENCE_MISMATCH"
        | "PLATFORM_MISMATCH"
        | "EXPIRED"
        | "NOT_YET_VALID"
        | "TTL_OUT_OF_RANGE"
        | "CONTENT_FORMAT_INVALID";
    }>;

const verifyRejected = (reason: Extract<GrantVerification, { code: "GRANT_REJECTED" }>["reason"]): GrantVerification =>
  Object.freeze({ code: "GRANT_REJECTED" as const, reason });

export type GrantVerifyInput = Readonly<{
  token: unknown;
  /** Key material by key id; the token selects its own key so rotation is possible. */
  signingKeys: Readonly<Record<string, string>>;
  expectedAudience?: string;
  expectedPlatform?: string;
  now?: number;
  skewMs?: number;
  maxTtlMs?: number;
}>;

const identifier = /^[A-Za-z0-9_.:@-]{1,256}$/;
const sha256Declaration = /^[a-f0-9]{64}$/;

const CLAIM_KEYS = [
  "admissionDigest", "asset", "audience", "contentFormat", "expiresAtEpochMs", "grantId", "grantVersion",
  "idempotencyKey", "issuedAtEpochMs", "keyId", "metadataDigest", "operationId", "ownerUid", "platform",
  "privacyStatus", "publicationId", "tenantId",
];
const ASSET_KEYS = ["artifactId", "mediaDigest", "mimeType", "revisionId", "size"];

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/** Structural validation of decoded claims, shared by Core and the adapter. */
export function validatePublicationGrantClaims(value: unknown): PublicationGrantClaims | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const claims = value as Record<string, unknown>;
  const asset = claims.asset;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const a = asset as Record<string, unknown>;
  if (!hasExactKeys(claims, CLAIM_KEYS) || !hasExactKeys(a, ASSET_KEYS)) return undefined;
  if (claims.grantVersion !== PUBLICATION_GRANT_VERSION) return undefined;
  if (claims.privacyStatus !== "private") return undefined;
  for (const key of ["grantId", "keyId", "ownerUid", "tenantId", "publicationId", "operationId", "idempotencyKey"]) {
    if (typeof claims[key] !== "string" || !identifier.test(claims[key] as string)) return undefined;
  }
  for (const key of ["artifactId", "revisionId"]) {
    if (typeof a[key] !== "string" || !identifier.test(a[key] as string)) return undefined;
  }
  if (typeof a.mimeType !== "string" || !/^video\/[A-Za-z0-9.+-]+$/.test(a.mimeType)) return undefined;
  if (typeof a.size !== "number" || !Number.isSafeInteger(a.size) || a.size < 1) return undefined;
  for (const digest of [a.mediaDigest, claims.metadataDigest, claims.admissionDigest]) {
    if (typeof digest !== "string" || !sha256Declaration.test(digest)) return undefined;
  }
  if (typeof claims.contentFormat !== "string") return undefined;
  const issued = claims.issuedAtEpochMs;
  const expires = claims.expiresAtEpochMs;
  if (typeof issued !== "number" || !Number.isSafeInteger(issued)) return undefined;
  if (typeof expires !== "number" || !Number.isSafeInteger(expires)) return undefined;
  return claims as unknown as PublicationGrantClaims;
}

export function verifyPublicationGrant(input: GrantVerifyInput): GrantVerification {
  const token = input.token;
  if (typeof token !== "string" || token.length > 8192) return verifyRejected("MALFORMED");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PUBLICATION_GRANT_VERSION || !parts[1] || !parts[2]) {
    return verifyRejected("MALFORMED");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return verifyRejected("MALFORMED");
  }
  const claims = validatePublicationGrantClaims(decoded);
  if (!claims) return verifyRejected("MALFORMED");
  // Re-encoding must reproduce the received payload byte-for-byte; this rejects
  // duplicate/unsorted keys and any non-canonical serialization that could sign
  // different bytes on each side.
  if (encode(claims) !== parts[1]) return verifyRejected("MALFORMED");
  const key = input.signingKeys[claims.keyId];
  if (!key) return verifyRejected("UNKNOWN_KEY");
  if (!macEquals(hmacSha256Base64Url(key, `${PUBLICATION_GRANT_VERSION}.${parts[1]}`), parts[2])) {
    return verifyRejected("INVALID_SIGNATURE");
  }
  if ((input.expectedAudience ?? PUBLICATION_GRANT_AUDIENCE) !== claims.audience) return verifyRejected("AUDIENCE_MISMATCH");
  if ((input.expectedPlatform ?? "tiktok") !== claims.platform) return verifyRejected("PLATFORM_MISMATCH");
  if (!isPublicationContentFormatForPlatform(claims.contentFormat, claims.platform)) return verifyRejected("CONTENT_FORMAT_INVALID");
  const now = input.now ?? Date.now();
  const skew = input.skewMs ?? 30_000;
  const maxTtl = input.maxTtlMs ?? PUBLICATION_GRANT_MAX_TTL_MS;
  if (claims.expiresAtEpochMs - claims.issuedAtEpochMs > maxTtl) return verifyRejected("TTL_OUT_OF_RANGE");
  if (claims.issuedAtEpochMs - skew > now) return verifyRejected("NOT_YET_VALID");
  if (claims.expiresAtEpochMs + skew <= now) return verifyRejected("EXPIRED");
  return Object.freeze({ code: "GRANT_VERIFIED" as const, claims });
}
