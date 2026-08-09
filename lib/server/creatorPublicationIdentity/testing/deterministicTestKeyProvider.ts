import { createHmac } from "node:crypto";
import type {
  CreatorPublicationProtectedIdentityV1,
  ProtectedIdentityKeyProviderV1,
  ProtectedIdentityKeyReferenceV1,
  ProtectedIdentityProjectionResultV1,
} from "../types";

export type DeterministicTestKeyV1 = Readonly<{ reference: ProtectedIdentityKeyReferenceV1; keyBytes: Uint8Array }>;

const copyReference = (value: ProtectedIdentityKeyReferenceV1): ProtectedIdentityKeyReferenceV1 => Object.freeze({ ...value });
const sameReference = (left: ProtectedIdentityKeyReferenceV1, right: ProtectedIdentityKeyReferenceV1) =>
  left.referenceVersion === right.referenceVersion && left.provider === right.provider && left.keyId === right.keyId &&
  left.keyVersion === right.keyVersion && left.algorithmVersion === right.algorithmVersion;
const failure = (code: "key-not-found" | "key-version-unavailable" | "invalid-key-reference" | "configuration-failure", reference?: ProtectedIdentityKeyReferenceV1): ProtectedIdentityProjectionResultV1 =>
  Object.freeze({ resultVersion: "1.0", status: "failure", code, safeReason: code, ...(reference === undefined ? {} : { keyReference: copyReference(reference) }) });

export const createDeterministicTestKeyProviderV1 = (active: ProtectedIdentityKeyReferenceV1, keys: readonly DeterministicTestKeyV1[]): ProtectedIdentityKeyProviderV1 => {
  const isolated = keys.map((item) => ({ reference: copyReference(item.reference), keyBytes: new Uint8Array(item.keyBytes) }));
  return Object.freeze({
    providerVersion: "1.0",
    async project(input) {
      const requested = input.keyReference ?? active;
      if (requested.provider !== "test-only") return failure("invalid-key-reference", requested);
      const key = isolated.find((item) => sameReference(item.reference, requested));
      if (!key) return failure(keys.some((item) => item.reference.keyId === requested.keyId) ? "key-version-unavailable" : "key-not-found", requested);
      if (key.keyBytes.byteLength < 32) return failure("configuration-failure", requested);
      try {
        const digest = createHmac("sha256", key.keyBytes).update(input.domain, "utf8").update(Uint8Array.of(0)).update(input.canonicalBytes).digest();
        const identity: CreatorPublicationProtectedIdentityV1 = Object.freeze({
          identityVersion: "1.0",
          domain: input.domain,
          encodingVersion: input.encodingVersion,
          algorithm: "hmac-sha256",
          algorithmVersion: input.algorithmVersion,
          keyReference: copyReference(key.reference),
          digest: new Uint8Array(digest),
        });
        return Object.freeze({ resultVersion: "1.0", status: "success", identity });
      } catch {
        return Object.freeze({ resultVersion: "1.0", status: "failure", code: "crypto-failure", safeReason: "crypto-failure", keyReference: copyReference(requested) });
      }
    },
  });
};
