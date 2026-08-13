export type DurableMediaReference = Readonly<{ jobId: string; mediaId: string }>;

type InitiatedUpload = DurableMediaReference & Readonly<{ uploadUrl: string; error?: string }>;

const readJson = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error(`Media admission failed (${response.status})`);
  return response.json() as Promise<T>;
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
  if (!uploadResponse.ok) throw new Error(`Media upload failed (${uploadResponse.status})`);

  const finalizeResponse = await request("/api/media/admit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finalize", jobId: initiated.jobId, mediaId: initiated.mediaId }),
  });
  const finalized = await readJson<DurableMediaReference & Readonly<{ error?: string }>>(finalizeResponse);
  if (!finalizeResponse.ok || finalized.jobId !== initiated.jobId || finalized.mediaId !== initiated.mediaId) throw new Error(finalized.error ?? "Media admission finalization failed");
  return Object.freeze({ jobId: finalized.jobId, mediaId: finalized.mediaId });
};
