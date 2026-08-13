import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
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
  | "ffmpeg-binary-missing"
  | "ffmpeg-not-executable"
  | "ffmpeg-spawn-failed"
  | "media-inspection-failed"
  | "media-duration-unavailable";

export type FfmpegPathClassification =
  | "node_modules/ffmpeg-static"
  | "missing"
  | "other-packaged-path";

export type FfmpegBinaryDiagnostic = Readonly<{
  platform: NodeJS.Platform;
  arch: string;
  nodeMajor: number;
  pathClassification: FfmpegPathClassification;
  filename: "ffmpeg" | "ffmpeg.exe" | "other";
  exists: boolean;
  statSucceeded: boolean;
  mode?: string;
  executableBit: boolean;
  fileSize?: number;
  fOk: boolean;
  xOk: boolean;
}>;

export type FfmpegSpawnDiagnostic = Readonly<{
  code: string | number | "unknown";
  errno: string | number | "unknown";
  syscall: "spawn" | "other" | "unknown";
}>;

export type AudioInspectionDiagnostic = Readonly<{
  binary: FfmpegBinaryDiagnostic;
  spawn?: FfmpegSpawnDiagnostic;
}>;

export class AudioInspectionFailure extends Error {
  constructor(
    readonly reason: AudioInspectionFailureReason,
    readonly diagnostic?: AudioInspectionDiagnostic,
  ) {
    super(reason);
    this.name = "AudioInspectionFailure";
  }
}

type ExecFailure = Error & Readonly<{
  code?: string | number;
  errno?: string | number;
  syscall?: string;
  signal?: string;
  stderr?: string;
}>;

const NO_AUDIO_PATTERN = /(?:matches no streams|does not contain any stream|stream map .*a:0)/i;

export const classifyFfmpegPath = (executable: string): FfmpegPathClassification => {
  if (!executable) return "missing";
  const normalized = executable.replaceAll("\\", "/").toLowerCase();
  return normalized.includes("/node_modules/ffmpeg-static/ffmpeg")
    ? "node_modules/ffmpeg-static"
    : "other-packaged-path";
};

const canAccess = async (executable: string, mode: number): Promise<boolean> => {
  try {
    await access(executable, mode);
    return true;
  } catch {
    return false;
  }
};

export const collectFfmpegBinaryDiagnostic = async (
  executable: string,
): Promise<FfmpegBinaryDiagnostic> => {
  const exists = existsSync(executable);
  const fileStat = await stat(executable).catch(() => undefined);
  const basename = path.basename(executable).toLowerCase();
  const mode = fileStat?.mode === undefined
    ? undefined
    : (fileStat.mode & 0o777).toString(8).padStart(3, "0");
  const executableBit = fileStat?.mode === undefined
    ? false
    : (fileStat.mode & 0o111) !== 0;

  return Object.freeze({
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    pathClassification: classifyFfmpegPath(executable),
    filename: basename === "ffmpeg" || basename === "ffmpeg.exe" ? basename : "other",
    exists,
    statSucceeded: fileStat !== undefined,
    ...(mode ? { mode } : {}),
    executableBit,
    ...(fileStat ? { fileSize: fileStat.size } : {}),
    fOk: await canAccess(executable, constants.F_OK),
    xOk: await canAccess(executable, constants.X_OK),
  });
};

export const projectFfmpegSpawnFailure = (failure: ExecFailure): FfmpegSpawnDiagnostic =>
  Object.freeze({
    code: typeof failure.code === "string" || typeof failure.code === "number"
      ? failure.code
      : "unknown",
    errno: typeof failure.errno === "string" || typeof failure.errno === "number"
      ? failure.errno
      : "unknown",
    syscall: typeof failure.syscall !== "string"
      ? "unknown"
      : failure.syscall.toLowerCase().startsWith("spawn")
        ? "spawn"
        : "other",
  });

export const inspectAudioMedia = async (
  executable: string,
  inputPath: string,
): Promise<AudioMediaInspection> => {
  const binaryDiagnostic = await collectFfmpegBinaryDiagnostic(executable);
  let stderr: string;
  try {
    const result = await execFileAsync(executable, [
      "-hide_banner", "-i", inputPath, "-map", "0:a:0", "-t", "0.001", "-f", "null", "-",
    ]);
    stderr = result.stderr;
  } catch (error) {
    const failure = error as ExecFailure;
    const diagnostic = Object.freeze({
      binary: binaryDiagnostic,
      spawn: projectFfmpegSpawnFailure(failure),
    });
    const safeCode = typeof failure.code === "string" ? failure.code : undefined;
    if (NO_AUDIO_PATTERN.test(failure.stderr ?? "")) {
      throw new AudioInspectionFailure("audio-stream-not-found", diagnostic);
    }
    if (safeCode === "ENOENT") {
      throw new AudioInspectionFailure("ffmpeg-binary-missing", diagnostic);
    }
    if (safeCode === "EACCES") {
      throw new AudioInspectionFailure("ffmpeg-not-executable", diagnostic);
    }
    if (typeof failure.code === "number") {
      throw new AudioInspectionFailure("media-inspection-failed", diagnostic);
    }
    throw new AudioInspectionFailure("ffmpeg-spawn-failed", diagnostic);
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
