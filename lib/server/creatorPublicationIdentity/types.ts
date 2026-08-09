export const PROTECTED_IDENTITY_KEY_PROVIDER_VERSION = "1.0" as const;
export const PROTECTED_IDENTITY_KEY_REFERENCE_VERSION = "1.0" as const;
export const PROTECTED_IDENTITY_ENCODING_VERSION = "1.0" as const;
export const PROTECTED_IDENTITY_ALGORITHM_VERSION = 1 as const;

export const CREATOR_PUBLICATION_IDENTITY_DOMAINS = Object.freeze([
  "source-artifact/v1",
  "creator-account/v1",
  "principal/v1",
  "generated-clip/v1",
  "publication-idempotency-key/v1",
  "publication-command/v1",
  "prediction/v1",
  "publication-reconciliation/v1",
] as const);

export type CreatorPublicationIdentityDomain = typeof CREATOR_PUBLICATION_IDENTITY_DOMAINS[number];

export type ProtectedIdentityKeyReferenceV1 = Readonly<{
  referenceVersion: typeof PROTECTED_IDENTITY_KEY_REFERENCE_VERSION;
  provider: string;
  keyId: string;
  keyVersion: string;
  algorithmVersion: typeof PROTECTED_IDENTITY_ALGORITHM_VERSION;
}>;

export type CreatorPublicationProtectedIdentityV1 = Readonly<{
  identityVersion: "1.0";
  domain: CreatorPublicationIdentityDomain;
  encodingVersion: typeof PROTECTED_IDENTITY_ENCODING_VERSION;
  algorithm: "hmac-sha256";
  algorithmVersion: typeof PROTECTED_IDENTITY_ALGORITHM_VERSION;
  keyReference: ProtectedIdentityKeyReferenceV1;
  digest: Uint8Array;
}>;

export type ProtectedIdentityProviderFailureCode =
  | "provider-unavailable"
  | "key-not-found"
  | "key-version-unavailable"
  | "invalid-key-reference"
  | "crypto-failure"
  | "configuration-failure";

export type ProtectedIdentityProviderFailureV1 = Readonly<{
  resultVersion: "1.0";
  status: "failure";
  code: ProtectedIdentityProviderFailureCode;
  safeReason: ProtectedIdentityProviderFailureCode;
  keyReference?: ProtectedIdentityKeyReferenceV1;
}>;

export type ProtectedIdentityProjectionInputV1 = Readonly<{
  inputVersion: "1.0";
  domain: CreatorPublicationIdentityDomain;
  encodingVersion: typeof PROTECTED_IDENTITY_ENCODING_VERSION;
  algorithmVersion: typeof PROTECTED_IDENTITY_ALGORITHM_VERSION;
  canonicalBytes: Uint8Array;
  keyReference?: ProtectedIdentityKeyReferenceV1;
}>;

export type ProtectedIdentityProjectionResultV1 =
  | Readonly<{ resultVersion: "1.0"; status: "success"; identity: CreatorPublicationProtectedIdentityV1 }>
  | ProtectedIdentityProviderFailureV1;

export type ProtectedIdentityKeyProviderV1 = Readonly<{
  providerVersion: typeof PROTECTED_IDENTITY_KEY_PROVIDER_VERSION;
  project(input: ProtectedIdentityProjectionInputV1): Promise<ProtectedIdentityProjectionResultV1>;
}>;

export type ProtectedIdentityProjectorV1 = Readonly<{
  projectorVersion: "1.0";
  project(input: ProtectedIdentityProjectionInputV1): Promise<ProtectedIdentityProjectionResultV1>;
}>;
