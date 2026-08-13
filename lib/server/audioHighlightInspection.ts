import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AudioMediaInspection = Readonly<{
  durationSeconds: number;
  codec: string;
  sampleRateHz?: number;
  channels?: string;
}>;

export type AudioInspectionFailureReason =
  | "audio-stream-not-found"
  | "ffmpeg-execution-failed"
  | "media-inspection-failed"
  | "media-duration-unavailable";

export class AudioInspectionFailure extends Error {
  constructor(readonly reason: AudioInspectionFailureReason) {
    super(reason);
    this.name = "AudioInspectionFailure";
  }
}

type ExecFailure = Error & Readonly<{
  code?: string | number;
  signal?: string;
  stderr?: string;
}>;

const NO_AUDIO_PATTERN = /(?:matches no streams|does not contain any stream|stream map .*a:0)/i;

export const inspectAudioMedia = async (
  executable: string,
  inputPath: string,
): Promise<AudioMediaInspection> => {
  let stderr: string;
  try {
    const result = await execFileAsync(executable, [
      "-hide_banner", "-i", inputPath, "-map", "0:a:0", "-t", "0.001", "-f", "null", "-",
    ]);
    stderr = result.stderr;
  } catch (error) {
    const failure = error as ExecFailure;
    const safeCode = typeof failure.code === "string" ? failure.code : undefined;
    if (NO_AUDIO_PATTERN.test(failure.stderr ?? "")) {
      throw new AudioInspectionFailure("audio-stream-not-found");
    }
    if (safeCode === "ENOENT" || safeCode === "EACCES") {
      throw new AudioInspectionFailure("ffmpeg-execution-failed");
    }
    throw new AudioInspectionFailure("media-inspection-failed");
  }

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : Number.NaN;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioInspectionFailure("media-duration-unavailable");
  }

  const audioLine = stderr.match(/Stream #[^\r\n]*Audio:\s*([^\r\n]+)/)?.[1] ?? "";
  const codec = audioLine.match(/^([^,\s]+)/)?.[1] ?? "detected";
  const sampleRate = audioLine.match(/(?:^|,\s*)(\d+)\s*Hz/i)?.[1];
  const channelMatch = audioLine.match(/(?:^|,\s*)(mono|stereo|\d+\.\d+|\d+ channels?)(?:,|$)/i)?.[1];

  return Object.freeze({
    durationSeconds,
    codec,
    ...(sampleRate ? { sampleRateHz: Number(sampleRate) } : {}),
    ...(channelMatch ? { channels: channelMatch } : {}),
  });
};
