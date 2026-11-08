import { Storage } from "@google-cloud/storage";
import type { IdentityPoolClient } from "google-auth-library";

type StorageAuthClient = NonNullable<ConstructorParameters<typeof Storage>[0]>["authClient"];

export type SupportedRuntimeEnvironment = "production" | "staging";

export const AUTHORIZED_BUCKET_MAP: Readonly<Record<SupportedRuntimeEnvironment, string>> = Object.freeze({
  production: "nexcut-prod-jp-2026-media",
  staging: "easyslice-staging-media-artifacts",
});

export const resolveAuthorizedBucketName = (
  environment: string | undefined,
  configuredBucketName: string | undefined,
): string => {
  if (!environment || (environment !== "production" && environment !== "staging")) {
    throw new Error(`Invalid Production media bucket authority: unauthorized environment ${String(environment)}`);
  }
  if (!configuredBucketName) {
    throw new Error("Invalid Production media bucket authority: missing bucket name");
  }
  const expectedBucket = AUTHORIZED_BUCKET_MAP[environment];
  if (configuredBucketName !== expectedBucket) {
    throw new Error(
      `Invalid Production media bucket authority: expected "${expectedBucket}", received "${configuredBucketName}"`,
    );
  }
  return expectedBucket;
};

export const createStorageCompatibleAuthClient = (authClient: IdentityPoolClient): StorageAuthClient => ({
  projectId: "nexcut-prod-jp-2026",
  async request(options: Parameters<IdentityPoolClient["request"]>[0]) {
    const response = await authClient.request(options);
    const headers = response.headers;
    if (typeof headers?.forEach !== "function") return response;
    const compatibleHeaders: Record<string, string> = {};
    headers.forEach((value, name) => { compatibleHeaders[name] = value; });
    return { ...response, headers: compatibleHeaders };
  },
  async getRequestHeaders() {
    const headers = await authClient.getRequestHeaders();
    const compatibleHeaders: Record<string, string> = {};
    headers.forEach((value, name) => { compatibleHeaders[name] = value; });
    return compatibleHeaders;
  },
} as unknown as StorageAuthClient);

export const createProductionMediaBucket = (
  authClient: IdentityPoolClient,
  bucketName: string,
  environment: string | undefined,
): ReturnType<Storage["bucket"]> => {
  const authorizedBucketName = resolveAuthorizedBucketName(environment, bucketName);
  const storage = new Storage({
    projectId: "nexcut-prod-jp-2026",
    authClient: createStorageCompatibleAuthClient(authClient),
  });
  return storage.bucket(authorizedBucketName);
};
