export type DurableMediaReference = Readonly<{ jobId: string; mediaId: string }>;

type InitiatedUpload = DurableMediaReference & Readonly<{ uploadUrl: string; error?: string }>;

const readJson = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error(`Media admission failed (${response.status})`);
  return response.json() as Promise<T>;
};

type GcsErrorDetail = Readonly<{ domain?: unknown; reason?: unknown; message?: unknown }>;
type GcsErrorEnvelope = Readonly<{ error?: Readonly<{ code?: unknown; message?: unknown; errors?: unknown }> }>;

const safeToken = (value: unknown): string => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value)
  ? value
  : "unknown";

const safeMessage = (value: unknown): string => {
  if (typeof value !== "string") return "unknown";
  return value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(upload_id|token|authorization|cookie|uid)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[redacted-id]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-opaque]")
    .slice(0, 240);
};

const classifyUploadFailure = async (response: Response): Promise<string> => {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "unknown";
  const body = await response.text().catch(() => "");
  let code = "unknown";
  let message = "unknown";
  let details = "none";
  if (contentType === "application/json") {
    try {
      const envelope = JSON.parse(body) as GcsErrorEnvelope;
      const error = envelope.error;
      code = typeof error?.code === "number" && Number.isSafeInteger(error.code)
        ? String(error.code)
        : safeToken(error?.code);
      message = safeMessage(error?.message);
      if (Array.isArray(error?.errors)) {
        details = (error.errors as GcsErrorDetail[]).slice(0, 3).map(detail => [
          `domain=${safeToken(detail.domain)}`,
          `reason=${safeToken(detail.reason)}`,
          `message=${safeMessage(detail.message)}`,
        ].join(",")).join("|") || "none";
      }
    } catch {
      // Preserve the generic classification below for malformed responses.
    }
  } else {
    code = body.match(/<Code>([A-Za-z][A-Za-z0-9_-]{0,63})<\/Code>/)?.[1] ?? "unknown";
    message = safeMessage(body.match(/<Message>([^<]*)<\/Message>/)?.[1]);
  }
  const normalized = body.toLowerCase();
  const reason = normalized.includes("content-length") ? "content-length"
    : normalized.includes("content-range") ? "content-range"
      : normalized.includes("content-type") ? "content-type"
        : normalized.includes("upload id") || normalized.includes("upload session") ? "upload-session"
          : normalized.includes("origin") ? "origin"
            : normalized.includes("size") || normalized.includes("bytes") ? "body-size"
              : normalized.includes("invalid") ? "invalid-argument"
                : "unknown";
  return `Media upload failed (${response.status}; gcsCode=${code}; reason=${reason}; response=${contentType}; message=${message}; errors=${details})`;
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
