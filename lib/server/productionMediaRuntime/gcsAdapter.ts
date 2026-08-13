import { Storage } from "@google-cloud/storage";
import type { IdentityPoolClient } from "google-auth-library";

type StorageAuthClient = NonNullable<ConstructorParameters<typeof Storage>[0]>["authClient"];

export const createStorageCompatibleAuthClient = (authClient: IdentityPoolClient): StorageAuthClient => ({
  projectId: "nexcut-prod-jp-2026",
  request: authClient.request.bind(authClient),
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
): ReturnType<Storage["bucket"]> => {
  if (bucketName !== "nexcut-prod-jp-2026-media") throw new Error("Invalid Production media bucket authority");
  const storage = new Storage({
    projectId: "nexcut-prod-jp-2026",
    authClient: createStorageCompatibleAuthClient(authClient),
  });
  return storage.bucket(bucketName);
};
