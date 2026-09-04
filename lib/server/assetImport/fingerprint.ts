import { createHash } from "node:crypto";
import type { CanonicalAssetImportSource } from "@/lib/assetImport/types";

const frame = (value: string): Buffer => {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.byteLength);
  return Buffer.concat([length, bytes]);
};

export function createAssetImportFingerprint(source: CanonicalAssetImportSource): Buffer {
  const hash = createHash("sha256");
  for (const value of [
    "nexcut.asset-import-command",
    "1",
    "1.0",
    source.platform,
    source.videoId,
    source.normalizedUrl,
  ]) hash.update(frame(value));
  return hash.digest();
}
