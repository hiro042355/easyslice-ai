import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import type { IdentityPoolClient } from "google-auth-library";

export type GcsProbeResult = Readonly<{ create: true; read: true; delete: true; residue: 0 }>;

type StorageAuthClient = NonNullable<ConstructorParameters<typeof Storage>[0]>["authClient"];

export const createStorageCompatibleAuthClient = (authClient: IdentityPoolClient): StorageAuthClient => ({
  projectId: "nexcut-prod-jp-2026",
  async getRequestHeaders() {
    const headers = await authClient.getRequestHeaders();
    const compatibleHeaders: Record<string, string> = {};
    headers.forEach((value, name) => { compatibleHeaders[name] = value; });
    return compatibleHeaders;
  },
} as unknown as StorageAuthClient);

export const runProductionGcsProbe = async (
  authClient: IdentityPoolClient,
  bucketName: string,
): Promise<GcsProbeResult> => {
  if (bucketName !== "nexcut-prod-jp-2026-media") throw new Error("Invalid Production media bucket authority");
  const storage = new Storage({
    projectId: "nexcut-prod-jp-2026",
    authClient: createStorageCompatibleAuthClient(authClient),
  });
  const payload = Buffer.from("nexcut-media-runtime-readiness-v1", "utf8");
  const file = storage.bucket(bucketName).file(`authority-probes/${randomUUID()}`);
  let deleted = false;
  try {
    await file.save(payload, { resumable: false, contentType: "application/octet-stream" });
    const [read] = await file.download();
    if (!read.equals(payload)) throw new Error("Production media GCS read verification failed");
    await file.delete();
    deleted = true;
    const [exists] = await file.exists();
    if (exists) throw new Error("Production media GCS probe residue detected");
    return Object.freeze({ create: true, read: true, delete: true, residue: 0 });
  } finally {
    if (!deleted) {
      try { await file.delete({ ignoreNotFound: true }); } catch { /* cleanup is best effort */ }
    }
  }
};
