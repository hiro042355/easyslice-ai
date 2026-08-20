import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { resolvePackagedFfmpeg } from "./packagedFfmpeg";

export const PACKAGED_YT_DLP_VERSION = "2026.03.13" as const;
const OUTPUT_LIMIT_BYTES = 64 * 1024;

export type YtDlpProcessFailureReason =
  | "yt-dlp-missing"
  | "yt-dlp-not-executable"
  | "yt-dlp-spawn-failed"
  | "yt-dlp-timeout"
  | "yt-dlp-cancelled"
  | "yt-dlp-output-limit"
  | "yt-dlp-exit-failed"
  | "youtube-sign-in-required"
  | "youtube-bot-check"
  | "video-unavailable"
  | "private-video"
  | "age-restricted"
  | "region-restricted"
  | "live-stream-unsupported"
  | "playlist-unsupported"
  | "format-unavailable"
  | "ffmpeg-unavailable"
  | "network-failure"
  | "extractor-failure"
  | "permission-failure"
  | "output-path-failure"
  | "unknown-yt-dlp-failure"
  | "yt-dlp-version-mismatch";

export type YtDlpFailureDiagnostic = Readonly<{
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  stdoutLimitExceeded: boolean;
  stderrLimitExceeded: boolean;
}>;

const EMPTY_FAILURE_DIAGNOSTIC: YtDlpFailureDiagnostic = Object.freeze({
  exitCode: null,
  signal: null,
  timedOut: false,
  aborted: false,
  stdoutLimitExceeded: false,
  stderrLimitExceeded: false,
});

export class YtDlpProcessFailure extends Error {
  readonly diagnostic: YtDlpFailureDiagnostic;

  constructor(
    readonly reason: YtDlpProcessFailureReason,
    diagnostic: YtDlpFailureDiagnostic = EMPTY_FAILURE_DIAGNOSTIC,
  ) {
    super(reason);
    this.name = "YtDlpProcessFailure";
    this.diagnostic = Object.freeze({ ...diagnostic });
  }
}

type YtDlpClassifiedExitReason = Exclude<YtDlpProcessFailureReason,
  | "yt-dlp-missing"
  | "yt-dlp-not-executable"
  | "yt-dlp-spawn-failed"
  | "yt-dlp-timeout"
  | "yt-dlp-cancelled"
  | "yt-dlp-output-limit"
  | "yt-dlp-exit-failed"
  | "yt-dlp-version-mismatch"
>;

const STDERR_CLASSIFIERS: readonly Readonly<{
  reason: YtDlpClassifiedExitReason;
  patterns: readonly RegExp[];
}>[] = Object.freeze([
  { reason: "youtube-bot-check", patterns: [/confirm you(?:'|’)re not a bot/i, /sign in to confirm you(?:'|’)re not a bot/i] },
  { reason: "youtube-sign-in-required", patterns: [/sign in to confirm your age/i, /this video may be inappropriate for some users/i, /sign in to view this video/i] },
  { reason: "private-video", patterns: [/private video/i, /members-only content/i] },
  { reason: "age-restricted", patterns: [/age[- ]restricted/i, /inappropriate for some users/i] },
  { reason: "region-restricted", patterns: [/not available in your country/i, /not available in your region/i, /geo(?:graphical)? restriction/i] },
  { reason: "live-stream-unsupported", patterns: [/premieres in/i, /live event will begin/i, /upcoming live/i] },
  { reason: "playlist-unsupported", patterns: [/playlist .* is not available/i, /unable to download playlist/i] },
  { reason: "format-unavailable", patterns: [/requested format is not available/i, /no video formats found/i] },
  { reason: "ffmpeg-unavailable", patterns: [/ffmpeg (?:is )?not found/i, /ffprobe (?:is )?not found/i, /ffmpeg-location.*does not exist/i] },
  { reason: "permission-failure", patterns: [/permission denied/i, /operation not permitted/i] },
  { reason: "output-path-failure", patterns: [/unable to open .* for writing/i, /no such file or directory.*youtube-source/i, /file name too long/i] },
  { reason: "network-failure", patterns: [/unable to download webpage/i, /network is unreachable/i, /temporary failure in name resolution/i, /connection (?:reset|refused|timed out)/i, /read timed out/i] },
  { reason: "extractor-failure", patterns: [/unable to extract/i, /extractor error/i, /nsig extraction failed/i, /signature extraction failed/i] },
  { reason: "video-unavailable", patterns: [/video unavailable/i, /this video has been removed/i, /video is no longer available/i] },
]);

export const classifyYtDlpStderr = (stderr: string): YtDlpClassifiedExitReason => {
  for (const classifier of STDERR_CLASSIFIERS) {
    if (classifier.patterns.some((pattern) => pattern.test(stderr))) return classifier.reason;
  }
  return "unknown-yt-dlp-failure";
};

export const packagedYtDlpTarget = (projectRoot = process.cwd()): string => path.join(
  projectRoot, "node_modules", ".nexcut-runtime", "yt-dlp", "yt-dlp",
);

export const resolvePackagedYtDlp = async (projectRoot = process.cwd()): Promise<string> => {
  const target = packagedYtDlpTarget(projectRoot);
  const targetStat = await stat(target).catch(() => undefined);
  if (!targetStat?.isFile() || targetStat.size === 0) throw new YtDlpProcessFailure("yt-dlp-missing");
  try {
    await access(target, constants.F_OK | constants.X_OK);
  } catch {
    throw new YtDlpProcessFailure("yt-dlp-not-executable");
  }
  return target;
};

export type YtDlpProcessResult = Readonly<{ stdout: string; stderr: string }>;
type YtDlpChildProcess = Readonly<{
  stdout: Readable;
  stderr: Readable;
  kill(signal: "SIGKILL"): boolean;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}>;
export type YtDlpSpawn = (
  executable: string,
  args: readonly string[],
  options: Readonly<{ shell: false; windowsHide: true; stdio: readonly ["ignore", "pipe", "pipe"] }>,
) => YtDlpChildProcess;

const spawnYtDlp: YtDlpSpawn = (executable, args, options) => spawn(
  executable,
  [...args],
  { ...options, stdio: ["ignore", "pipe", "pipe"] },
);

export const runPackagedYtDlp = async (
  args: readonly string[],
  options: Readonly<{
    timeoutMs: number;
    signal?: AbortSignal;
    projectRoot?: string;
    spawnImpl?: YtDlpSpawn;
    outputLimitBytes?: number;
  }>,
): Promise<YtDlpProcessResult> => {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new TypeError("invalid-yt-dlp-timeout");
  const outputLimit = options.outputLimitBytes ?? OUTPUT_LIMIT_BYTES;
  if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0) throw new TypeError("invalid-yt-dlp-output-limit");
  const executable = await resolvePackagedYtDlp(options.projectRoot);
  const ffmpeg = resolvePackagedFfmpeg(options.projectRoot);
  const child = (options.spawnImpl ?? spawnYtDlp)(executable, [
    "--ffmpeg-location", ffmpeg, ...args,
  ], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let terminationReason: YtDlpProcessFailureReason | undefined;
    let stdoutLimitExceeded = false;
    let stderrLimitExceeded = false;
    const terminate = (reason: YtDlpProcessFailureReason) => {
      if (terminationReason) return;
      terminationReason = reason;
      child.kill("SIGKILL");
    };
    const diagnostic = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ): YtDlpFailureDiagnostic => Object.freeze({
      exitCode,
      signal,
      timedOut: terminationReason === "yt-dlp-timeout",
      aborted: terminationReason === "yt-dlp-cancelled",
      stdoutLimitExceeded,
      stderrLimitExceeded,
    });
    const append = (current: Buffer, chunk: Buffer, stream: "stdout" | "stderr") => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > outputLimit) {
        if (stream === "stdout") stdoutLimitExceeded = true;
        else stderrLimitExceeded = true;
        terminate("yt-dlp-output-limit");
      }
      return next.subarray(0, outputLimit);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk, "stdout"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk, "stderr"); });
    child.once("error", () => {
      if (!settled) { settled = true; cleanup(); reject(new YtDlpProcessFailure("yt-dlp-spawn-failed")); }
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      const safeDiagnostic = diagnostic(code, signal);
      if (terminationReason) return reject(new YtDlpProcessFailure(terminationReason, safeDiagnostic));
      if (code !== 0) return reject(new YtDlpProcessFailure(classifyYtDlpStderr(stderr.toString("utf8")), safeDiagnostic));
      resolve(Object.freeze({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") }));
    });
    const onAbort = () => terminate("yt-dlp-cancelled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => terminate("yt-dlp-timeout"), options.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    if (options.signal?.aborted) onAbort();
  });
};

export const probePackagedYtDlpVersion = async (
  projectRoot?: string,
  spawnImpl?: YtDlpSpawn,
): Promise<typeof PACKAGED_YT_DLP_VERSION> => {
  const result = await runPackagedYtDlp(["--version"], { timeoutMs: 10_000, projectRoot, spawnImpl });
  if (result.stdout.trim() !== PACKAGED_YT_DLP_VERSION) throw new YtDlpProcessFailure("yt-dlp-version-mismatch");
  return PACKAGED_YT_DLP_VERSION;
};
