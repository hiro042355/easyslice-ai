import type { SessionId } from "../productionIdentity/types";

export const PRODUCTION_WORKFLOW_API_CSRF_CONTRACT_VERSION = "1.0" as const;
export const PRODUCTION_WORKFLOW_API_CSRF_TOKEN_VERSION = "csrf1" as const;
export const PRODUCTION_WORKFLOW_API_CSRF_ACTIVE_TOKEN_CEILING = 4 as const;
export const PRODUCTION_WORKFLOW_API_CSRF_MAXIMUM_LIFETIME_MS = 30 * 60 * 1000;
export const PRODUCTION_WORKFLOW_API_CSRF_DIGEST_ALGORITHM = "sha256" as const;
export const PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION = "csrf-digest-v1" as const;

export type ProductionWorkflowApiCsrfTokenId = string & {
  readonly __brand: "ProductionWorkflowApiCsrfTokenId";
};

export type ProductionWorkflowApiCsrfRawToken = string & {
  readonly __brand: "ProductionWorkflowApiCsrfRawToken";
};

export type ProductionWorkflowApiCsrfDigest = Uint8Array & {
  readonly __brand: "ProductionWorkflowApiCsrfDigest";
};

export type ProductionWorkflowApiCsrfRevision = string & {
  readonly __brand: "ProductionWorkflowApiCsrfRevision";
};

export interface ProductionWorkflowApiCsrfRandomAuthority {
  randomBytes(byteLength: 16 | 32): Uint8Array;
}

export type ProductionWorkflowApiCsrfPersistenceMaterial = Readonly<{
  materialVersion: "1.0";
  tokenId: ProductionWorkflowApiCsrfTokenId;
  digest: ProductionWorkflowApiCsrfDigest;
  digestAlgorithm: typeof PRODUCTION_WORKFLOW_API_CSRF_DIGEST_ALGORITHM;
  digestVersion: typeof PRODUCTION_WORKFLOW_API_CSRF_DIGEST_VERSION;
  sessionId: SessionId;
  issuedAt: number;
  expiresAt: number;
  lifecycleState: "active";
}>;

export type ProductionWorkflowApiCsrfIssueResult =
  | Readonly<{
      status: "issued";
      tokenId: ProductionWorkflowApiCsrfTokenId;
      expiresAt: number;
      revision: ProductionWorkflowApiCsrfRevision;
      revokedOldestTokenId?: ProductionWorkflowApiCsrfTokenId;
    }>
  | Readonly<{ status: "unavailable" | "malformed" }>;

export type ProductionWorkflowApiCsrfValidationResult =
  | Readonly<{ status: "valid"; revision: ProductionWorkflowApiCsrfRevision }>
  | Readonly<{ status: "invalid" | "expired" | "revoked" | "wrong-session" | "unavailable" | "malformed" }>;

export type ProductionWorkflowApiCsrfRevocationResult =
  | Readonly<{ status: "revoked"; revokedCount: number }>
  | Readonly<{ status: "not-found" | "unavailable" | "malformed" }>;

export type ProductionWorkflowApiCsrfValidationInput = Readonly<{
  sessionId: SessionId;
  tokenId: ProductionWorkflowApiCsrfTokenId;
  digest: ProductionWorkflowApiCsrfDigest;
  now: number;
}>;

export interface ProductionWorkflowApiCsrfAuthority {
  readonly authorityVersion: "1.0";

  /**
   * Atomically inserts the candidate and, if necessary, revokes the oldest
   * active token so that no more than four remain active for the exact session.
   */
  issueWithAtomicCeiling(
    material: ProductionWorkflowApiCsrfPersistenceMaterial,
  ): Promise<ProductionWorkflowApiCsrfIssueResult>;

  validate(input: ProductionWorkflowApiCsrfValidationInput): Promise<ProductionWorkflowApiCsrfValidationResult>;

  revokeToken(input: Readonly<{
    sessionId: SessionId;
    tokenId: ProductionWorkflowApiCsrfTokenId;
    now: number;
  }>): Promise<ProductionWorkflowApiCsrfRevocationResult>;

  revokeSession(input: Readonly<{
    sessionId: SessionId;
    now: number;
  }>): Promise<ProductionWorkflowApiCsrfRevocationResult>;
}
