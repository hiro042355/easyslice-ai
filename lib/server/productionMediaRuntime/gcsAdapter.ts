import { Storage } from "@google-cloud/storage";
import type { IdentityPoolClient } from "google-auth-library";
import { STAGING_MEDIA_BUCKET, STAGING_PROJECT_ID } from "../../staging/stagingEnvironment";

type StorageAuthClient = NonNullable<ConstructorParameters<typeof Storage>[0]>["authClient"];

export type SupportedRuntimeEnvironment = "production" | "staging";

export const AUTHORIZED_BUCKET_MAP: Readonly<Record<SupportedRuntimeEnvironment, string>> = Object.freeze({
  production: "nexcut-prod-jp-2026-media",
  staging: STAGING_MEDIA_BUCKET,
});

/**
 * A bucket is only addressable inside its own project. Production and staging media
 * therefore carry separate project authorities, so staging requests can never be
 * billed or resolved against the production project.
 */
export const AUTHORIZED_PROJECT_MAP: Readonly<Record<SupportedRuntimeEnvironment, string>> = Object.freeze({
  production: "nexcut-prod-jp-2026",
  staging: STAGING_PROJECT_ID,
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

export const createStorageCompatibleAuthClient = (
  authClient: IdentityPoolClient,
  projectId: string = AUTHORIZED_PROJECT_MAP.production,
): StorageAuthClient => ({
  projectId,
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
  projectId?: string,
): ReturnType<Storage["bucket"]> => {
  const authorizedBucketName = resolveAuthorizedBucketName(environment, bucketName);
  const authorizedProjectId = projectId ?? AUTHORIZED_PROJECT_MAP[environment as SupportedRuntimeEnvironment];
  if (authorizedProjectId !== AUTHORIZED_PROJECT_MAP[environment as SupportedRuntimeEnvironment]) {
    throw new Error(
      `Invalid media storage project authority: expected "${AUTHORIZED_PROJECT_MAP[environment as SupportedRuntimeEnvironment]}", received "${authorizedProjectId}"`,
    );
  }
  const storage = new Storage({
    projectId: authorizedProjectId,
    authClient: createStorageCompatibleAuthClient(authClient, authorizedProjectId),
  });
  return storage.bucket(authorizedBucketName);
};
