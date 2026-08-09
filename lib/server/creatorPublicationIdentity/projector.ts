import { timingSafeEqual } from "node:crypto";
import {
  CREATOR_PUBLICATION_IDENTITY_DOMAINS,
  PROTECTED_IDENTITY_ALGORITHM_VERSION,
  PROTECTED_IDENTITY_ENCODING_VERSION,
  type CreatorPublicationProtectedIdentityV1,
  type ProtectedIdentityKeyProviderV1,
  type ProtectedIdentityKeyReferenceV1,
  type ProtectedIdentityProjectionInputV1,
  type ProtectedIdentityProjectionResultV1,
  type ProtectedIdentityProjectorV1,
} from "./types";

const domainSet = new Set<string>(CREATOR_PUBLICATION_IDENTITY_DOMAINS);
const nonEmpty = (value: string) => value.length > 0 && value.trim() === value;

export const copyProtectedIdentityKeyReferenceV1 = (value: ProtectedIdentityKeyReferenceV1): ProtectedIdentityKeyReferenceV1 =>
  Object.freeze({ ...value });

export const copyCreatorPublicationProtectedIdentityV1 = (value: CreatorPublicationProtectedIdentityV1): CreatorPublicationProtectedIdentityV1 =>
  Object.freeze({ ...value, keyReference: copyProtectedIdentityKeyReferenceV1(value.keyReference), digest: new Uint8Array(value.digest) });

export const isProtectedIdentityKeyReferenceV1 = (value: unknown): value is ProtectedIdentityKeyReferenceV1 => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProtectedIdentityKeyReferenceV1>;
  return candidate.referenceVersion === "1.0" && typeof candidate.provider === "string" && nonEmpty(candidate.provider) &&
    typeof candidate.keyId === "string" && nonEmpty(candidate.keyId) && typeof candidate.keyVersion === "string" && nonEmpty(candidate.keyVersion) &&
    candidate.algorithmVersion === PROTECTED_IDENTITY_ALGORITHM_VERSION;
};

export const isCreatorPublicationProtectedIdentityV1 = (value: unknown): value is CreatorPublicationProtectedIdentityV1 => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CreatorPublicationProtectedIdentityV1>;
  return candidate.identityVersion === "1.0" && typeof candidate.domain === "string" && domainSet.has(candidate.domain) &&
    candidate.encodingVersion === PROTECTED_IDENTITY_ENCODING_VERSION && candidate.algorithm === "hmac-sha256" &&
    candidate.algorithmVersion === PROTECTED_IDENTITY_ALGORITHM_VERSION && isProtectedIdentityKeyReferenceV1(candidate.keyReference) &&
    candidate.digest instanceof Uint8Array && candidate.digest.byteLength === 32;
};

const invalid = (): ProtectedIdentityProjectionResultV1 => Object.freeze({
  resultVersion: "1.0",
  status: "failure",
  code: "configuration-failure",
  safeReason: "configuration-failure",
});

const validInput = (input: ProtectedIdentityProjectionInputV1) =>
  input.inputVersion === "1.0" && domainSet.has(input.domain) && input.encodingVersion === PROTECTED_IDENTITY_ENCODING_VERSION &&
  input.algorithmVersion === PROTECTED_IDENTITY_ALGORITHM_VERSION && input.canonicalBytes instanceof Uint8Array &&
  (input.keyReference === undefined || isProtectedIdentityKeyReferenceV1(input.keyReference));

export const createProtectedIdentityProjectorV1 = (provider: ProtectedIdentityKeyProviderV1): ProtectedIdentityProjectorV1 => Object.freeze({
  projectorVersion: "1.0",
  async project(input) {
    if (provider.providerVersion !== "1.0" || !validInput(input)) return invalid();
    const result = await provider.project(Object.freeze({
      ...input,
      canonicalBytes: new Uint8Array(input.canonicalBytes),
      ...(input.keyReference === undefined ? {} : { keyReference: copyProtectedIdentityKeyReferenceV1(input.keyReference) }),
    }));
    if (result.status === "failure") return Object.freeze({ ...result, ...(result.keyReference === undefined ? {} : { keyReference: copyProtectedIdentityKeyReferenceV1(result.keyReference) }) });
    if (!isCreatorPublicationProtectedIdentityV1(result.identity) || result.identity.domain !== input.domain || result.identity.encodingVersion !== input.encodingVersion || result.identity.algorithmVersion !== input.algorithmVersion) return invalid();
    return Object.freeze({ resultVersion: "1.0", status: "success", identity: copyCreatorPublicationProtectedIdentityV1(result.identity) });
  },
});

export const equalCreatorPublicationProtectedIdentityV1 = (left: CreatorPublicationProtectedIdentityV1, right: CreatorPublicationProtectedIdentityV1): boolean =>
  left.domain === right.domain && left.encodingVersion === right.encodingVersion && left.algorithm === right.algorithm &&
  left.algorithmVersion === right.algorithmVersion && left.keyReference.provider === right.keyReference.provider &&
  left.keyReference.keyId === right.keyReference.keyId && left.keyReference.keyVersion === right.keyReference.keyVersion &&
  left.digest.byteLength === right.digest.byteLength && timingSafeEqual(left.digest, right.digest);
