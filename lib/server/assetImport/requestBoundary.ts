import { classifyUrl } from "@/lib/urlAcquisition/classifyUrl";
import type { CanonicalAssetImportSource } from "@/lib/assetImport/types";

export const ASSET_IMPORT_BODY_LIMIT = 4096;
const KEY = /^[A-Za-z0-9._~-]{1,128}$/u;

export type AssetImportRequestResult =
  | Readonly<{ status: "accepted"; idempotencyKey: string; source: CanonicalAssetImportSource }>
  | Readonly<{ status: "rejected"; statusCode: 400 | 413 | 415 | 422; code: "invalid_request" | "unsupported_source" }>;

const reject = (statusCode: 400 | 413 | 415 | 422, code: "invalid_request" | "unsupported_source"): AssetImportRequestResult =>
  Object.freeze({ status: "rejected", statusCode, code });

export async function readAssetImportRequest(request: Request): Promise<AssetImportRequestResult> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/iu.test(contentType)) return reject(415, "invalid_request");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !KEY.test(idempotencyKey)) return reject(400, "invalid_request");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > ASSET_IMPORT_BODY_LIMIT)) {
    return reject(Number(declared) > ASSET_IMPORT_BODY_LIMIT ? 413 : 400, "invalid_request");
  }
  if (!request.body) return reject(400, "invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.byteLength > ASSET_IMPORT_BODY_LIMIT - size) return reject(413, "invalid_request");
      chunks.push(next.value); size += next.value.byteLength;
    }
  } catch { return reject(400, "invalid_request"); }
  finally { reader.releaseLock(); }
  if (size === 0) return reject(400, "invalid_request");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) return reject(400, "invalid_request");
    body = JSON.parse(text);
  } catch { return reject(400, "invalid_request"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reject(400, "invalid_request");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || value.requestVersion !== "1.0" || typeof value.sourceUrl !== "string" || value.sourceUrl.length > 2048) {
    return reject(400, "invalid_request");
  }
  const classified = classifyUrl(value.sourceUrl);
  if (classified.kind !== "SUPPORTED_YOUTUBE") return reject(422, "unsupported_source");
  return Object.freeze({ status: "accepted", idempotencyKey, source: Object.freeze({
    platform: classified.platform, videoId: classified.videoId, normalizedUrl: classified.normalizedUrl,
  }) });
}
