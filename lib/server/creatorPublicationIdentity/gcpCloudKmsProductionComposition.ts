import { KeyManagementServiceClient } from "@google-cloud/kms";
import { createProtectedIdentityProjectorV1 } from "./projector";
import {
  createGcpCloudKmsKeyProviderV1,
  type GcpCloudKmsClientV1,
  type GcpCloudKmsKeyProviderConfigurationV1,
  type GcpCloudKmsKeyProviderV1,
} from "./gcpCloudKmsKeyProvider";
import type { ProtectedIdentityProjectorV1, ProtectedIdentityProviderFailureV1 } from "./types";

export type GcpProtectedIdentityProductionCompositionV1 = Readonly<{
  compositionVersion: "1.0";
  provider: GcpCloudKmsKeyProviderV1;
  projector: ProtectedIdentityProjectorV1;
}>;

export type GcpProtectedIdentityProductionStartupResultV1 =
  | Readonly<{
      resultVersion: "1.0";
      status: "ready";
      readiness: Readonly<{ readinessVersion: "1.0"; status: "ready" }>;
      composition: GcpProtectedIdentityProductionCompositionV1;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "not-ready";
      readiness: Readonly<{ readinessVersion: "1.0"; status: "not-ready"; failure: ProtectedIdentityProviderFailureV1 }>;
    }>;

export type GcpProtectedIdentityProductionDependenciesV1 = Readonly<{
  client?: GcpCloudKmsClientV1;
}>;

const createOfficialClient = (): GcpCloudKmsClientV1 => {
  const client = new KeyManagementServiceClient();
  return Object.freeze({
    async getCryptoKeyVersion(name) {
      const [value] = await client.getCryptoKeyVersion({ name });
      return value;
    },
    async macSign(name, data) {
      const [value] = await client.macSign({ name, data: Buffer.from(data) });
      return value;
    },
  });
};

export const initializeGcpProtectedIdentityProductionCompositionV1 = async (
  configuration: GcpCloudKmsKeyProviderConfigurationV1,
  dependencies: GcpProtectedIdentityProductionDependenciesV1 = Object.freeze({}),
): Promise<GcpProtectedIdentityProductionStartupResultV1> => {
  const provider = createGcpCloudKmsKeyProviderV1(configuration, dependencies.client ?? createOfficialClient());
  const readiness = await provider.checkReadiness();
  if (readiness.status === "not-ready") {
    return Object.freeze({
      resultVersion: "1.0",
      status: "not-ready",
      readiness: Object.freeze({ readinessVersion: "1.0", status: "not-ready", failure: readiness.failure }),
    });
  }
  const composition = Object.freeze({
    compositionVersion: "1.0" as const,
    provider,
    projector: createProtectedIdentityProjectorV1(provider),
  });
  return Object.freeze({
    resultVersion: "1.0",
    status: "ready",
    readiness: Object.freeze({ readinessVersion: "1.0", status: "ready" }),
    composition,
  });
};
