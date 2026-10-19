import type { ResolvedAssetAccess } from "@/lib/assets/types";

export const projectUploadedAssetAccess: (uploaded: unknown) => ResolvedAssetAccess = () => {
  return Object.freeze({
    mode: "signed-url" as const,
    url: "https://storage.googleapis.com/nexcut-media/uploaded-asset",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
};
