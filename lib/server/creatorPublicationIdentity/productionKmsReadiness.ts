import {
  initializeGcpProtectedIdentityProductionCompositionV1,
  type GcpProtectedIdentityProductionStartupResultV1,
} from "./gcpCloudKmsProductionComposition";

export const GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION = "PROTECTED_IDENTITY_KMS_CRYPTO_KEY" as const;

export type ProductionKmsReadinessResultV1 =
  | Readonly<{ resultVersion: "1.0"; status: "ready" }>
  | Readonly<{
      resultVersion: "1.0";
      status: "not-ready";
      reason: "configuration-failure" | "invalid-key-reference" | "key-not-found" | "key-version-unavailable" | "provider-unavailable" | "crypto-failure";
    }>;

type Environment = Readonly<Record<string, string | undefined>>;
type Initializer = (
  configuration: Readonly<{
    configurationVersion: "1.0";
    cryptoKeyName: string;
    activeCryptoKeyVersionName: string;
  }>,
) => Promise<GcpProtectedIdentityProductionStartupResultV1>;

export type ProductionKmsReadinessGateV1 = Readonly<{
  gateVersion: "1.0";
  check(): Promise<ProductionKmsReadinessResultV1>;
}>;

export const projectProductionKmsReadinessHttpResponseV1 = (result: ProductionKmsReadinessResultV1): Response =>
  Response.json(
    result.status === "ready" ? { status: "ready" } : { status: "not-ready", reason: result.reason },
    { status: result.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );

export const createProductionKmsReadinessGateV1 = (
  environment: Environment,
  initialize: Initializer = initializeGcpProtectedIdentityProductionCompositionV1,
): ProductionKmsReadinessGateV1 => {
  let ready: ProductionKmsReadinessResultV1 | undefined;
  let pending: Promise<ProductionKmsReadinessResultV1> | undefined;

  const validate = async (): Promise<ProductionKmsReadinessResultV1> => {
    const cryptoKeyName = environment[GCP_CLOUD_KMS_CRYPTO_KEY_CONFIGURATION] ?? "";
    const activeCryptoKeyVersionName = environment.PROTECTED_IDENTITY_KMS_ACTIVE_VERSION ?? "";
    const startup = await initialize(Object.freeze({
      configurationVersion: "1.0",
      cryptoKeyName,
      activeCryptoKeyVersionName,
    }));
    if (startup.status === "not-ready") {
      return Object.freeze({
        resultVersion: "1.0",
        status: "not-ready",
        reason: startup.readiness.failure.code,
      });
    }
    return Object.freeze({ resultVersion: "1.0", status: "ready" });
  };

  return Object.freeze({
    gateVersion: "1.0",
    async check() {
      if (ready !== undefined) return ready;
      pending ??= validate().catch(() => Object.freeze({
        resultVersion: "1.0" as const,
        status: "not-ready" as const,
        reason: "provider-unavailable" as const,
      }));
      const result = await pending;
      pending = undefined;
      if (result.status === "ready") ready = result;
      return result;
    },
  });
};
