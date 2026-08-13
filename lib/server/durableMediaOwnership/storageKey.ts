export type MediaStorageKind = "input" | "work";
export type AllowedMediaExtension = "mp4" | "wav";
export type AllowedExportExtension = "mp4" | "zip";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_MIME: Readonly<Record<string, AllowedMediaExtension>> = Object.freeze({
  "video/mp4": "mp4",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
});
const EXPORT_MIME: Readonly<Record<string, AllowedExportExtension>> = Object.freeze({
  "video/mp4": "mp4",
  "application/zip": "zip",
});

export const isUuid = (value: string): boolean => UUID.test(value);

const requireUuid = (name: string, value: string): void => {
  if (!isUuid(value)) throw new Error(`Invalid ${name}`);
};

export const mediaExtensionForMime = (mime: string): AllowedMediaExtension => {
  const extension = MEDIA_MIME[mime.toLowerCase()];
  if (!extension) throw new Error("Unsupported media MIME type");
  return extension;
};

export const exportExtensionForMime = (mime: string): AllowedExportExtension => {
  const extension = EXPORT_MIME[mime.toLowerCase()];
  if (!extension) throw new Error("Unsupported export MIME type");
  return extension;
};

export const createMediaStorageKey = (
  jobId: string,
  mediaId: string,
  kind: MediaStorageKind,
  mime: string,
): string => {
  requireUuid("job ID", jobId);
  requireUuid("media ID", mediaId);
  return `jobs/${jobId}/${kind}/${mediaId}.${mediaExtensionForMime(mime)}`;
};

export const createExportStorageKey = (jobId: string, exportId: string, mime: string): string => {
  requireUuid("job ID", jobId);
  requireUuid("export ID", exportId);
  return `jobs/${jobId}/output/${exportId}.${exportExtensionForMime(mime)}`;
};
