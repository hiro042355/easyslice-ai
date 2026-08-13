export type DurableMediaReference = Readonly<{ jobId: string; mediaId: string }>;

type InitiatedUpload = DurableMediaReference & Readonly<{ uploadUrl: string; error?: string }>;

const readJson = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error(`Media admission failed (${response.status})`);
  return response.json() as Promise<T>;
};

const classifyUploadFailure = async (response: Response): Promise<string> => {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "unknown";
  const body = await response.text().catch(() => "");
  const code = body.match(/<Code>([A-Za-z][A-Za-z0-9_-]{0,63})<\/Code>/)?.[1]
    ?? body.match(/"code"\s*:\s*"([A-Za-z][A-Za-z0-9_-]{0,63})"/)?.[1]
    ?? "unknown";
  const normalized = body.toLowerCase();
  const reason = normalized.includes("content-length") ? "content-length"
    : normalized.includes("content-range") ? "content-range"
      : normalized.includes("content-type") ? "content-type"
        : normalized.includes("upload id") || normalized.includes("upload session") ? "upload-session"
          : normalized.includes("origin") ? "origin"
            : normalized.includes("size") || normalized.includes("bytes") ? "body-size"
              : normalized.includes("invalid") ? "invalid-argument"
                : "unknown";
  return `Media upload failed (${response.status}; gcsCode=${code}; reason=${reason}; response=${contentType})`;
};

export const admitDurableMedia = async (file: File, request: typeof fetch = fetch): Promise<DurableMediaReference> => {
  if (file.type !== "video/mp4" || file.size <= 0) throw new Error("Only a non-empty MP4 can be admitted");
  const initiateResponse = await request("/api/media/admit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "initiate", mime: file.type, size: file.size }),
  });
  const initiated = await readJson<InitiatedUpload>(initiateResponse);
  if (!initiateResponse.ok || !initiated.jobId || !initiated.mediaId || !initiated.uploadUrl) throw new Error(initiated.error ?? "Media admission initiation failed");

  const uploadResponse = await request(initiated.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploadResponse.ok) throw new Error(await classifyUploadFailure(uploadResponse));

  const finalizeResponse = await request("/api/media/admit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finalize", jobId: initiated.jobId, mediaId: initiated.mediaId }),
  });
  const finalized = await readJson<DurableMediaReference & Readonly<{ error?: string }>>(finalizeResponse);
  if (!finalizeResponse.ok || finalized.jobId !== initiated.jobId || finalized.mediaId !== initiated.mediaId) throw new Error(finalized.error ?? "Media admission finalization failed");
  return Object.freeze({ jobId: finalized.jobId, mediaId: finalized.mediaId });
};
