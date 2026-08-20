import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { AcquisitionWorkerFailure, type AcquisitionMediaMetadata } from "./types";
import type { AcquisitionMediaInspector } from "./core";

const execFileAsync = promisify(execFile);
const OUTPUT_LIMIT = 64 * 1024;

export const inspectCanonicalMp4: AcquisitionMediaInspector = async (inputPath, runtime, maxBytes) => {
  const metadata = await stat(inputPath).catch(() => undefined);
  if (!metadata?.isFile() || metadata.size <= 0) throw new AcquisitionWorkerFailure("malformed-media");
  if (metadata.size > maxBytes) throw new AcquisitionWorkerFailure("output-too-large");

  let diagnostic = "";
  try {
    const result = await execFileAsync(runtime.ffmpegExecutable, [
      "-hide_banner", "-i", inputPath, "-map", "0:v:0", "-t", "0.001", "-f", "null", "-",
    ], { timeout: 30_000, maxBuffer: OUTPUT_LIMIT, windowsHide: true });
    diagnostic = result.stderr;
  } catch (error) {
    const failure = error as Readonly<{ code?: string | number; stderr?: string }>;
    diagnostic = typeof failure.stderr === "string" ? failure.stderr : "";
    if (typeof failure.code !== "number") throw new AcquisitionWorkerFailure("ffmpeg-failed");
  }

  const hasVideo = /Stream #[^\r\n]*Video:/i.test(diagnostic);
  const hasAudio = /Stream #[^\r\n]*Audio:/i.test(diagnostic);
  const isMp4 = /(?:Input #0,\s*(?:mov,)?mp4|major_brand\s*:\s*(?:isom|iso2|mp4))/i.test(diagnostic);
  const durationMatch = diagnostic.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : Number.NaN;
  if (!hasVideo || !isMp4 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AcquisitionWorkerFailure("malformed-media");
  }
  return Object.freeze({
    contentType: "video/mp4",
    byteSize: metadata.size,
    durationSeconds,
    hasVideo: true,
    hasAudio,
  } satisfies AcquisitionMediaMetadata);
};
