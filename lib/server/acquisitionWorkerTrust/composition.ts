import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import { IdentityPoolClient, type SubjectTokenSupplier } from "google-auth-library";
import {
  AcquisitionWorkerTrustFailure,
  createAcquisitionWorkerTrustClient,
  readAcquisitionWorkerTrustConfiguration,
  type AcquisitionWorkerTrustConfiguration,
  type AcquisitionWorkerTrustEvidence,
} from "./client";
import type { AcquisitionRequest } from "../acquisitionWorker/types";
import type { AcquisitionWorkerInvocationResult } from "./client";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const SUBJECT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";

const safeStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
};

export const createProductionIdTokenAuthority = (configuration: Pick<
  AcquisitionWorkerTrustConfiguration,
  "providerResource" | "invokerServiceAccount"
>) => {
  const supplier: SubjectTokenSupplier = {
    async getSubjectToken() {
      try {
        const token = await getVercelOidcToken();
        if (!token) throw new Error("oidc-unavailable");
        return token;
      } catch {
        throw new AcquisitionWorkerTrustFailure("worker-federation-failed");
      }
    },
  };
  const source = new IdentityPoolClient({
    audience: `//iam.googleapis.com/${configuration.providerResource}`,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: "https://sts.googleapis.com/v1/token",
    scopes: [CLOUD_PLATFORM_SCOPE],
    subject_token_supplier: supplier,
  });
  return async (audience: string): Promise<string> => {
    try {
      await source.getAccessToken();
    } catch (error) {
      if (error instanceof AcquisitionWorkerTrustFailure) throw error;
      throw new AcquisitionWorkerTrustFailure("worker-token-exchange-failed");
    }
    try {
      const response = await source.request<{ token?: string }>({
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(configuration.invokerServiceAccount)}:generateIdToken`,
        method: "POST",
        data: { audience, includeEmail: true },
      });
      if (!response.data.token) throw new AcquisitionWorkerTrustFailure("worker-id-token-failed");
      return response.data.token;
    } catch (error) {
      if (error instanceof AcquisitionWorkerTrustFailure) throw error;
      if ([401, 403].includes(safeStatus(error) ?? 0)) {
        throw new AcquisitionWorkerTrustFailure("worker-impersonation-failed");
      }
      throw new AcquisitionWorkerTrustFailure("worker-id-token-failed");
    }
  };
};

export const verifyProductionAcquisitionWorkerTrust = async (): Promise<AcquisitionWorkerTrustEvidence> => {
  const configuration = readAcquisitionWorkerTrustConfiguration();
  return createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: createProductionIdTokenAuthority(configuration),
    fetch,
    log: (entry) => console.info(JSON.stringify(entry)),
    now: Date.now,
  }).verify();
};

export const runProductionAcquisitionControlStoreProof = async () => {
  const configuration = readAcquisitionWorkerTrustConfiguration();
  return createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: createProductionIdTokenAuthority(configuration), fetch,
    log: (entry) => console.info(JSON.stringify(entry)), now: Date.now,
  }).proveControlStore();
};

export const invokeProductionAcquisitionWorker = async (
  request: AcquisitionRequest,
  signal?: AbortSignal,
): Promise<AcquisitionWorkerInvocationResult> => {
  const configuration = readAcquisitionWorkerTrustConfiguration();
  return createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: createProductionIdTokenAuthority(configuration),
    fetch,
    log: (entry) => console.info(JSON.stringify(entry)),
    now: Date.now,
  }).invoke(request, { signal });
};

export const invokeProductionAcquisitionWorkerAt = async (
  workerUrl: string,
  request: AcquisitionRequest,
  signal?: AbortSignal,
): Promise<AcquisitionWorkerInvocationResult> => {
  const base = readAcquisitionWorkerTrustConfiguration();
  const configuration = Object.freeze({ ...base, workerUrl });
  return createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: createProductionIdTokenAuthority(configuration),
    fetch,
    log: (entry) => console.info(JSON.stringify(entry)),
    now: Date.now,
  }).invoke(request, { signal });
};
