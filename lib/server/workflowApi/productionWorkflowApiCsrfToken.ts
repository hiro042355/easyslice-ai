import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { SessionId } from "../productionIdentity/types";
import {
  PRODUCTION_WORKFLOW_API_CSRF_DIGEST_ALGORITHM,
  PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION,
  PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_LIFETIME_MS,
  PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION,
  type ProductionWorkflowApiCsrfDigest,
  type ProductionWorkflowApiCsrfPersistenceMaterial,
  type ProductionWorkflowApiCsrfRandomAuthority,
  type ProductionWorkflowApiCsrfRawToken,
  type ProductionWorkflowApiCsrfTokenId,
} from "./productionWorkflowApiCsrfTypes";

export const PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_BYTES = 16 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_SECRET_BYTES = 32 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_DIGEST_BYTES = 32 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_ENCODED_LENGTH = 22 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_SECRET_ENCODED_LENGTH = 43 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_RAW_TOKEN_LENGTH = 72 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_DIGEST_DOMAIN =
  "nexcut.production-workflow-api.csrf-token-digest" as const;

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

export type ParsedProductionWorkflowApiCsrfToken = Readonly<{
  tokenVersion: typeof PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION;
  tokenId: ProductionWorkflowApiCsrfTokenId;
  tokenIdBytes: Uint8Array;
  secretBytes: Uint8Array;
}>;

export type ProductionWorkflowApiCsrfTokenParseResult =
  | Readonly<{ status: "parsed"; value: ParsedProductionWorkflowApiCsrfToken }>
  | Readonly<{ status: "invalid" }>;

export type ProductionWorkflowApiCsrfTokenGenerationResult =
  | Readonly<{
      status: "generated";
      token: ProductionWorkflowApiCsrfRawToken;
      tokenId: ProductionWorkflowApiCsrfTokenId;
      digest: ProductionWorkflowApiCsrfDigest;
    }>
  | Readonly<{ status: "unavailable" }>;

export type ProductionWorkflowApiCsrfExpiryResult =
  | Readonly<{ status: "valid"; expiresAt: number }>
  | Readonly<{ status: "invalid" }>;

export type ProductionWorkflowApiCsrfMaterialResult =
  | Readonly<{ status: "created"; token: ProductionWorkflowApiCsrfRawToken; material: ProductionWorkflowApiCsrfPersistenceMaterial }>
  | Readonly<{ status: "invalid" | "unavailable" }>;

export const nodeProductionWorkflowApiCsrfRandomAuthority: ProductionWorkflowApiCsrfRandomAuthority =
  Object.freeze({
    randomBytes: (byteLength: 16 | 32) => new Uint8Array(randomBytes(byteLength)),
  });

function decodeCanonicalBase64Url(value: string, expectedBytes: number, expectedCharacters: number): Uint8Array | undefined {
  if (value.length !== expectedCharacters || !BASE64URL.test(value) || value.includes("=")) return undefined;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== expectedBytes || decoded.toString("base64url") !== value) return undefined;
  return new Uint8Array(decoded);
}

export function parseProductionWorkflowApiCsrfToken(rawToken: string): ProductionWorkflowApiCsrfTokenParseResult {
  if (typeof rawToken !== "string" || rawToken.length > PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_RAW_TOKEN_LENGTH) {
    return Object.freeze({ status: "invalid" });
  }
  const parts = rawToken.split(".");
  if (parts.length !== 3 || parts[0] !== PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION) {
    return Object.freeze({ status: "invalid" });
  }
  const tokenIdBytes = decodeCanonicalBase64Url(
    parts[1],
    PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_BYTES,
    PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_ENCODED_LENGTH,
  );
  const secretBytes = decodeCanonicalBase64Url(
    parts[2],
    PRODUCTION_WORKFLOW_API_CSRF_SECRET_BYTES,
    PRODUCTION_WORKFLOW_API_CSRF_SECRET_ENCODED_LENGTH,
  );
  if (!tokenIdBytes || !secretBytes) return Object.freeze({ status: "invalid" });
  return Object.freeze({
    status: "parsed",
    value: Object.freeze({
      tokenVersion: PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION,
      tokenId: parts[1] as ProductionWorkflowApiCsrfTokenId,
      tokenIdBytes,
      secretBytes,
    }),
  });
}

function frame(component: Uint8Array): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(component.byteLength, 0);
  return Buffer.concat([length, component]);
}

export function digestParsedProductionWorkflowApiCsrfToken(
  parsed: ParsedProductionWorkflowApiCsrfToken,
): ProductionWorkflowApiCsrfDigest {
  const domain = Buffer.from(PRODUCTION_WORKFLOW_API_CSRF_DIGEST_DOMAIN, "utf8");
  const digestVersion = Buffer.from(PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION, "utf8");
  const tokenVersion = Buffer.from(parsed.tokenVersion, "utf8");
  return new Uint8Array(
    createHash("sha256")
      .update(frame(domain))
      .update(frame(digestVersion))
      .update(frame(tokenVersion))
      .update(frame(parsed.tokenIdBytes))
      .update(frame(parsed.secretBytes))
      .digest(),
  ) as ProductionWorkflowApiCsrfDigest;
}

export function generateProductionWorkflowApiCsrfToken(
  authority: ProductionWorkflowApiCsrfRandomAuthority,
): ProductionWorkflowApiCsrfTokenGenerationResult {
  try {
    const tokenIdBytes = authority.randomBytes(PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_BYTES);
    const secretBytes = authority.randomBytes(PRODUCTION_WORKFLOW_API_CSRF_SECRET_BYTES);
    if (tokenIdBytes.byteLength !== PRODUCTION_WORKFLOW_API_CSRF_TOKEN_ID_BYTES || secretBytes.byteLength !== PRODUCTION_WORKFLOW_API_CSRF_SECRET_BYTES) {
      return Object.freeze({ status: "unavailable" });
    }
    const tokenId = Buffer.from(tokenIdBytes).toString("base64url") as ProductionWorkflowApiCsrfTokenId;
    const secret = Buffer.from(secretBytes).toString("base64url");
    const token = `${PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION}.${tokenId}.${secret}` as ProductionWorkflowApiCsrfRawToken;
    const parsed = parseProductionWorkflowApiCsrfToken(token);
    if (parsed.status !== "parsed") return Object.freeze({ status: "unavailable" });
    return Object.freeze({
      status: "generated",
      token,
      tokenId,
      digest: digestParsedProductionWorkflowApiCsrfToken(parsed.value),
    });
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

export function calculateProductionWorkflowApiCsrfExpiry(
  issuedAt: number,
  sessionExpiresAt: number,
): ProductionWorkflowApiCsrfExpiryResult {
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= issuedAt) {
    return Object.freeze({ status: "invalid" });
  }
  const policyExpiresAt = issuedAt + PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_LIFETIME_MS;
  if (!Number.isSafeInteger(policyExpiresAt)) return Object.freeze({ status: "invalid" });
  const expiresAt = Math.min(policyExpiresAt, sessionExpiresAt);
  return expiresAt > issuedAt
    ? Object.freeze({ status: "valid", expiresAt })
    : Object.freeze({ status: "invalid" });
}

export function isProductionWorkflowApiCsrfExpired(now: number, expiresAt: number): boolean {
  return !Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt) || now >= expiresAt;
}

export function compareProductionWorkflowApiCsrfDigests(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== PRODUCTION_WORKFLOW_API_CSRF_DIGEST_BYTES || right.byteLength !== PRODUCTION_WORKFLOW_API_CSRF_DIGEST_BYTES) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createProductionWorkflowApiCsrfMaterial(input: Readonly<{
  sessionId: SessionId;
  issuedAt: number;
  sessionExpiresAt: number;
  randomAuthority: ProductionWorkflowApiCsrfRandomAuthority;
}>): ProductionWorkflowApiCsrfMaterialResult {
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) return Object.freeze({ status: "invalid" });
  const expiry = calculateProductionWorkflowApiCsrfExpiry(input.issuedAt, input.sessionExpiresAt);
  if (expiry.status !== "valid") return Object.freeze({ status: "invalid" });
  const generated = generateProductionWorkflowApiCsrfToken(input.randomAuthority);
  if (generated.status !== "generated") return Object.freeze({ status: "unavailable" });
  return Object.freeze({
    status: "created",
    token: generated.token,
    material: Object.freeze({
      materialVersion: "1.0",
      tokenId: generated.tokenId,
      digest: generated.digest,
      digestAlgorithm: PRODUCTION_WORKFLOW_API_CSRF_DIGEST_ALGORITHM,
      digestVersion: PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION,
      sessionId: input.sessionId,
      issuedAt: input.issuedAt,
      expiresAt: expiry.expiresAt,
      lifecycleState: "active",
    }),
  });
}
