import {
  RESUMABLE_CHUNK_BYTES,
  planChunks,
  type ChunkPlan,
} from "../domain/youtube/resumable-upload";

export const FAKE_UPLOAD_TRANSPORT = "FAKE_DETERMINISTIC" as const;

export type PublicationUploadPlan = Readonly<{
  chunkBytes: number;
  totalChunks: number;
  chunks: readonly ChunkPlan[];
}>;

export type PublicationUploadPlanResult =
  | Readonly<{ ok: true; plan: PublicationUploadPlan }>
  | Readonly<{ ok: false; code: "INVALID_TOTAL_BYTES" | "INVALID_CHUNK_SIZE" | "INVALID_OFFSET" }>;

/** Pure plan only. The transport is not invoked here. */
export function planPublicationUpload(
  totalBytes: number,
  chunkBytes: number = RESUMABLE_CHUNK_BYTES,
): PublicationUploadPlanResult {
  const planned = planChunks(totalBytes, chunkBytes);
  if (!Array.isArray(planned)) return Object.freeze({ ok: false, code: planned.code });
  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      chunkBytes,
      totalChunks: planned.length,
      chunks: Object.freeze(planned.map(chunk => Object.freeze({ ...chunk }))),
    }),
  });
}

export type PublicationUploadAction = "start" | "advance" | "interrupt" | "resume" | "ambiguous" | "reconcile";

export const isPublicationUploadAction = (value: unknown): value is PublicationUploadAction =>
  value === "start" || value === "advance" || value === "interrupt" ||
  value === "resume" || value === "ambiguous" || value === "reconcile";
