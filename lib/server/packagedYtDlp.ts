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
  | "yt-dlp-version-mismatch";

export class YtDlpProcessFailure extends Error {
  constructor(readonly reason: YtDlpProcessFailureReason) {
    super(reason);
    this.name = "YtDlpProcessFailure";
  }
}

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
  once(event: "close", listener: (code: number | null) => void): unknown;
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
    const terminate = (reason: YtDlpProcessFailureReason) => {
      if (terminationReason) return;
      terminationReason = reason;
      child.kill("SIGKILL");
    };
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > outputLimit) terminate("yt-dlp-output-limit");
      return next.subarray(0, outputLimit);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", () => {
      if (!settled) { settled = true; cleanup(); reject(new YtDlpProcessFailure("yt-dlp-spawn-failed")); }
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminationReason) return reject(new YtDlpProcessFailure(terminationReason));
      if (code !== 0) return reject(new YtDlpProcessFailure("yt-dlp-exit-failed"));
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
