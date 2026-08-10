import { protos } from "@google-cloud/kms";
import type {
  CreatorPublicationProtectedIdentityV1,
  ProtectedIdentityKeyProviderV1,
  ProtectedIdentityKeyReferenceV1,
  ProtectedIdentityProjectionInputV1,
  ProtectedIdentityProjectionResultV1,
  ProtectedIdentityProviderFailureCode,
} from "./types";

export const GCP_CLOUD_KMS_PROVIDER_ID = "gcp-cloud-kms" as const;
export const GCP_CLOUD_KMS_ACTIVE_VERSION_CONFIGURATION = "PROTECTED_IDENTITY_KMS_ACTIVE_VERSION" as const;

type CryptoKeyVersionMetadata = Readonly<{
  name?: string | null;
  state?: number | string | null;
  algorithm?: number | string | null;
}>;

type MacSignResult = Readonly<{
  name?: string | null;
  mac?: Uint8Array | string | null;
}>;

export type GcpCloudKmsClientV1 = Readonly<{
  getCryptoKeyVersion(name: string): Promise<CryptoKeyVersionMetadata>;
  macSign(name: string, data: Uint8Array): Promise<MacSignResult>;
}>;

export type GcpCloudKmsKeyProviderConfigurationV1 = Readonly<{
  configurationVersion: "1.0";
  cryptoKeyName: string;
  activeCryptoKeyVersionName: string;
}>;

export type GcpCloudKmsReadinessResultV1 =
  | Readonly<{
      resultVersion: "1.0";
      status: "ready";
      activeKeyReference: ProtectedIdentityKeyReferenceV1;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "not-ready";
      failure: Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }>;
    }>;

export type GcpCloudKmsKeyProviderV1 = ProtectedIdentityKeyProviderV1 & Readonly<{
  resolveActiveKeyReference(): Promise<ProtectedIdentityKeyReferenceV1 | Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }>>;
  checkReadiness(): Promise<GcpCloudKmsReadinessResultV1>;
}>;

const state = protos.google.cloud.kms.v1.CryptoKeyVersion.CryptoKeyVersionState;
const algorithm = protos.google.cloud.kms.v1.CryptoKeyVersion.CryptoKeyVersionAlgorithm;
const cryptoKeyPattern = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/;
const versionPattern = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+\/cryptoKeyVersions\/[0-9]+$/;

const exactEnum = (actual: number | string | null | undefined, name: string, numeric: number): boolean =>
  actual === name || actual === numeric;

const copyReference = (value: ProtectedIdentityKeyReferenceV1): ProtectedIdentityKeyReferenceV1 => Object.freeze({ ...value });

const failure = (
  code: ProtectedIdentityProviderFailureCode,
  keyReference?: ProtectedIdentityKeyReferenceV1,
): Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }> => Object.freeze({
  resultVersion: "1.0",
  status: "failure",
  code,
  safeReason: code,
  ...(keyReference === undefined ? {} : { keyReference: copyReference(keyReference) }),
});

const grpcCode = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "number" ? value : undefined;
};

const mapProviderFailure = (
  error: unknown,
  operation: "active" | "historical" | "metadata" | "mac",
  reference?: ProtectedIdentityKeyReferenceV1,
): Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }> => {
  const code = grpcCode(error);
  if (code === 5) return failure(operation === "active" ? "key-not-found" : "key-version-unavailable", reference);
  if (code === 7 || code === 16) return failure("configuration-failure", reference);
  if (code === 4 || code === 8 || code === 13 || code === 14) return failure("provider-unavailable", reference);
  if (code === 3) return failure(operation === "active" ? "configuration-failure" : "invalid-key-reference", reference);
  if (code === 9) return failure("key-version-unavailable", reference);
  return failure(operation === "mac" ? "crypto-failure" : "provider-unavailable", reference);
};

const versionReference = (cryptoKeyName: string, versionName: string): ProtectedIdentityKeyReferenceV1 => Object.freeze({
  referenceVersion: "1.0",
  provider: GCP_CLOUD_KMS_PROVIDER_ID,
  keyId: cryptoKeyName,
  keyVersion: versionName,
  algorithmVersion: 1,
});

const domainSeparatedBytes = (input: ProtectedIdentityProjectionInputV1): Uint8Array => {
  const domain = new TextEncoder().encode(input.domain);
  const bytes = new Uint8Array(domain.byteLength + 1 + input.canonicalBytes.byteLength);
  bytes.set(domain, 0);
  bytes[domain.byteLength] = 0;
  bytes.set(input.canonicalBytes, domain.byteLength + 1);
  return bytes;
};

const readinessProbe = new TextEncoder().encode("nexcut/protected-identity/readiness/v1");

const macBytes = (value: Uint8Array | string | null | undefined): Uint8Array | undefined => {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value !== "string") return undefined;
  try {
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    return undefined;
  }
};

export const createGcpCloudKmsKeyProviderV1 = (
  configuration: GcpCloudKmsKeyProviderConfigurationV1,
  client: GcpCloudKmsClientV1,
): GcpCloudKmsKeyProviderV1 => {
  const configuredKey = configuration.cryptoKeyName;
  const configuredActiveVersion = configuration.activeCryptoKeyVersionName;
  const validConfiguration = configuration.configurationVersion === "1.0" && cryptoKeyPattern.test(configuredKey) &&
    versionPattern.test(configuredActiveVersion) && configuredActiveVersion.startsWith(`${configuredKey}/cryptoKeyVersions/`);

  const validateVersion = async (
    reference: ProtectedIdentityKeyReferenceV1,
    operation: "active" | "historical",
  ): Promise<CryptoKeyVersionMetadata | Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }>> => {
    try {
      const metadata = await client.getCryptoKeyVersion(reference.keyVersion);
      if (metadata.name !== reference.keyVersion) {
        return failure(operation === "active" ? "configuration-failure" : "invalid-key-reference", reference);
      }
      if (!exactEnum(metadata.state, "ENABLED", state.ENABLED)) return failure("key-version-unavailable", reference);
      if (!exactEnum(metadata.algorithm, "HMAC_SHA256", algorithm.HMAC_SHA256)) return failure("configuration-failure", reference);
      return metadata;
    } catch (error) {
      return mapProviderFailure(error, operation, reference);
    }
  };

  const resolveActiveKeyReference = async (): Promise<ProtectedIdentityKeyReferenceV1 | Extract<ProtectedIdentityProjectionResultV1, { status: "failure" }>> => {
    if (!validConfiguration) return failure("configuration-failure");
    const reference = versionReference(configuredKey, configuredActiveVersion);
    const validated = await validateVersion(reference, "active");
    return "status" in validated ? validated : reference;
  };

  const provider: GcpCloudKmsKeyProviderV1 = Object.freeze({
    providerVersion: "1.0",
    resolveActiveKeyReference,
    async checkReadiness() {
      const resolved = await resolveActiveKeyReference();
      if ("status" in resolved) return Object.freeze({ resultVersion: "1.0", status: "not-ready", failure: resolved });
      try {
        const response = await client.macSign(resolved.keyVersion, new Uint8Array(readinessProbe));
        const digest = macBytes(response.mac);
        if (response.name !== resolved.keyVersion || digest === undefined || digest.byteLength !== 32) {
          return Object.freeze({ resultVersion: "1.0", status: "not-ready", failure: failure("crypto-failure", resolved) });
        }
        return Object.freeze({ resultVersion: "1.0", status: "ready", activeKeyReference: copyReference(resolved) });
      } catch (error) {
        return Object.freeze({ resultVersion: "1.0", status: "not-ready", failure: mapProviderFailure(error, "mac", resolved) });
      }
    },
    async project(input) {
      if (!validConfiguration) return failure("configuration-failure");
      let reference: ProtectedIdentityKeyReferenceV1;
      if (input.keyReference === undefined) {
        const active = await resolveActiveKeyReference();
        if ("status" in active) return active;
        reference = active;
      } else {
        reference = input.keyReference;
        if (reference.provider !== GCP_CLOUD_KMS_PROVIDER_ID || reference.keyId !== configuredKey ||
          reference.referenceVersion !== "1.0" || reference.algorithmVersion !== 1 ||
          !versionPattern.test(reference.keyVersion) || !reference.keyVersion.startsWith(`${configuredKey}/cryptoKeyVersions/`)) {
          return failure("invalid-key-reference", reference);
        }
        const validated = await validateVersion(reference, "historical");
        if ("status" in validated) return validated;
      }
      try {
        const response = await client.macSign(reference.keyVersion, domainSeparatedBytes(input));
        const digest = macBytes(response.mac);
        if (response.name !== reference.keyVersion || digest === undefined || digest.byteLength !== 32) {
          return failure("crypto-failure", reference);
        }
        const identity: CreatorPublicationProtectedIdentityV1 = Object.freeze({
          identityVersion: "1.0",
          domain: input.domain,
          encodingVersion: input.encodingVersion,
          algorithm: "hmac-sha256",
          algorithmVersion: input.algorithmVersion,
          keyReference: copyReference(reference),
          digest,
        });
        return Object.freeze({ resultVersion: "1.0", status: "success", identity });
      } catch (error) {
        return mapProviderFailure(error, "mac", reference);
      }
    },
  });
  return provider;
};
