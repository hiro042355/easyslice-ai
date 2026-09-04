import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { classifyUrl } from "../urlAcquisition/classifyUrl";

const execFileAsync = promisify(execFile);

export const MAX_INGESTED_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
export const YOUTUBE_ACQUISITION_TIMEOUT_MS = 240_000;

export class YouTubeIngestionFailure extends Error {
  constructor(readonly reason: "invalid-youtube-url" | "invalid-media" | "media-too-large") {
    super(reason);
    this.name = "YouTubeIngestionFailure";
  }
}

export type ValidatedYouTubeUrl = Readonly<{ videoId: string; canonicalUrl: string }>;

export const validateYouTubeVideoUrl = (input: unknown): ValidatedYouTubeUrl => {
  const classification = classifyUrl(input);
  if (classification.kind !== "SUPPORTED_YOUTUBE") {
    throw new YouTubeIngestionFailure("invalid-youtube-url");
  }
  return Object.freeze({ videoId: classification.videoId, canonicalUrl: classification.normalizedUrl });
};

export const createYouTubeAcquisitionArguments = (
  canonicalUrl: string,
  controlledOutputPath: string,
): readonly string[] => Object.freeze([
  "--no-playlist",
  "--ignore-config",
  "--no-progress",
  "--no-warnings",
  "--no-write-info-json",
  "--no-write-thumbnail",
  "--max-filesize", "2G",
  "--format", "bv*+ba/b",
  "--merge-output-format", "mp4",
  "--remux-video", "mp4",
  "--output", controlledOutputPath,
  canonicalUrl,
]);

export type IngestedVideoInspection = Readonly<{ sizeBytes: number; durationSeconds: number; mime: "video/mp4" }>;

export const inspectIngestedVideo = async (
  ffmpegExecutable: string,
  inputPath: string,
): Promise<IngestedVideoInspection> => {
  const metadata = await stat(inputPath).catch(() => undefined);
  if (!metadata?.isFile() || metadata.size <= 0) throw new YouTubeIngestionFailure("invalid-media");
  if (metadata.size > MAX_INGESTED_MEDIA_BYTES) throw new YouTubeIngestionFailure("media-too-large");

  let stderr = "";
  try {
    const result = await execFileAsync(ffmpegExecutable, [
      "-hide_banner", "-i", inputPath, "-map", "0:v:0", "-t", "0.001", "-f", "null", "-",
    ], { timeout: 30_000, maxBuffer: 64 * 1024, windowsHide: true });
    stderr = result.stderr;
  } catch (error) {
    const failure = error as Readonly<{ code?: string | number; stderr?: string }>;
    if (typeof failure.code !== "number" || !failure.stderr?.match(/Stream #[^\r\n]*Video:/)) {
      throw new YouTubeIngestionFailure("invalid-media");
    }
    stderr = failure.stderr;
  }
  if (!stderr.match(/Stream #[^\r\n]*Video:/)) throw new YouTubeIngestionFailure("invalid-media");
  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = duration
    ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
    : Number.NaN;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new YouTubeIngestionFailure("invalid-media");
  if (!stderr.match(/(?:Input #0,\s*mov,mp4|major_brand\s*:\s*(?:isom|iso2|mp4))/i)) {
    throw new YouTubeIngestionFailure("invalid-media");
  }
  return Object.freeze({ sizeBytes: metadata.size, durationSeconds, mime: "video/mp4" });
};
