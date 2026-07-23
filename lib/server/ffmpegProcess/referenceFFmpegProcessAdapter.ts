import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type {
  FFmpegProcessAuditEntry,
  FFmpegProcessClassification,
  FFmpegProcessDecision,
  FFmpegProcessReasonCode,
  FFmpegProcessRequest,
  RetryClassification,
} from "./types";

type ProcessLike = Readonly<{
  stdout: Readable | null;
  stderr: Readable | null;
  once(event: "error", listener: (error: Error) => void): ProcessLike;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): ProcessLike;
  kill(signal?: NodeJS.Signals): boolean;
}>;
type SpawnCapability = (
  executable: string,
  argumentTokens: readonly string[],
  options: { shell: false; stdio: ["ignore", "pipe", "pipe"] },
) => ProcessLike;
type TimerCapability = Readonly<{
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}>;
export type FFmpegProcessAdapterDependencies = Readonly<{
  spawnProcess?: SpawnCapability;
  timer?: TimerCapability;
}>;

const defaultSpawn: SpawnCapability = (executable, argumentTokens, options) =>
  spawn(executable, [...argumentTokens], options);
const defaultTimer: TimerCapability = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const unsafeArgument = /[\r\n\0]|&&|\|\||[;<>]/;
const optionKey = (token: string): string | undefined =>
  /^-[A-Za-z][A-Za-z0-9_-]*$/.test(token) ? token : undefined;
const retryFor = (classification: FFmpegProcessClassification): RetryClassification =>
  classification === "success" ? "retry-not-required" :
  classification === "invalid" || classification === "cancelled" ? "retry-not-allowed" :
  classification === "spawn-failure" || classification === "dependency-failure" ||
    classification === "timeout" ? "retry-safe" : "retry-external-policy";

export class ReferenceFFmpegProcessAdapter {
  readonly #spawnProcess: SpawnCapability;
  readonly #timer: TimerCapability;

  constructor(dependencies: FFmpegProcessAdapterDependencies = {}) {
    this.#spawnProcess = dependencies.spawnProcess ?? defaultSpawn;
    this.#timer = dependencies.timer ?? defaultTimer;
  }

  async execute(request: FFmpegProcessRequest): Promise<FFmpegProcessDecision> {
    const invalid = this.#validate(request);
    if (invalid) return this.#decision("invalid", invalid, "not-observed", "not-observed", "not-observed", ["validation"]);
    if (request.cancellationSignal?.aborted)
      return this.#decision("cancelled", "process-cancelled", "not-observed", "not-observed", "not-observed", ["validation", "classification"]);

    let child: ProcessLike;
    try {
      child = this.#spawnProcess("ffmpeg", [...request.command.argumentTokens], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      return this.#decision("spawn-failure", "process-spawn-failure", "not-observed", "not-observed", "not-observed", ["validation", "spawn", "classification"]);
    }

    return await new Promise<FFmpegProcessDecision>((resolve) => {
      let stdoutPresent = false;
      let stderrPresent = false;
      let settled = false;
      let termination: "timeout" | "cancelled" | undefined;
      child.stdout?.on("data", () => { stdoutPresent = true; });
      child.stderr?.on("data", () => { stderrPresent = true; });

      const finish = (
        classification: FFmpegProcessClassification,
        reasonCode: FFmpegProcessReasonCode,
        exitClassification: FFmpegProcessDecision["exitClassification"],
      ) => {
        if (settled) return;
        settled = true;
        this.#timer.cancel(timerHandle);
        request.cancellationSignal?.removeEventListener("abort", cancel);
        resolve(this.#decision(
          classification,
          reasonCode,
          exitClassification,
          stdoutPresent ? "present" : "empty",
          stderrPresent ? "present" : "empty",
          ["validation", "spawn", "monitor", "classification"],
        ));
      };
      const terminate = (classification: "timeout" | "cancelled") => {
        if (settled || termination) return;
        termination = classification;
        try {
          child.kill("SIGTERM");
        } catch {
          finish("dependency-failure", "process-dependency-failure", "not-observed");
        }
      };
      const cancel = () => terminate("cancelled");
      const timerHandle = this.#timer.schedule(() => terminate("timeout"), request.timeoutMilliseconds);
      request.cancellationSignal?.addEventListener("abort", cancel, { once: true });

      child.once("error", () =>
        finish("spawn-failure", "process-spawn-failure", "not-observed"));
      child.once("close", (code) => {
        if (termination === "timeout")
          finish("timeout", "process-timed-out", "not-observed");
        else if (termination === "cancelled")
          finish("cancelled", "process-cancelled", "not-observed");
        else if (code === 0)
          finish("success", "process-completed", "zero");
        else
          finish("failed", "process-exit-failure", code === null ? "not-observed" : "non-zero");
      });
    });
  }

  #validate(request: FFmpegProcessRequest): FFmpegProcessReasonCode | undefined {
    if (!request || request.requestVersion !== "1.0" || !request.requestIdentity ||
      !request.operationIdentity || !request.command || request.command.projectionVersion !== "1.0")
      return "request-invalid";
    if (request.command.executable !== "ffmpeg") return "executable-unsupported";
    if (!Array.isArray(request.command.argumentTokens) || request.command.argumentTokens.length === 0)
      return "request-invalid";
    if (!Number.isSafeInteger(request.timeoutMilliseconds) ||
      request.timeoutMilliseconds < 1 || request.timeoutMilliseconds > 3_600_000)
      return "timeout-invalid";
    const options = new Set<string>();
    for (const token of request.command.argumentTokens) {
      if (typeof token !== "string" || token.length === 0 || unsafeArgument.test(token))
        return "argument-unsafe";
      const option = optionKey(token);
      if (option && options.has(option)) return "argument-unsafe";
      if (option) options.add(option);
    }
    return undefined;
  }

  #decision(
    classification: FFmpegProcessClassification,
    reasonCode: FFmpegProcessReasonCode,
    exitClassification: FFmpegProcessDecision["exitClassification"],
    stdoutClassification: FFmpegProcessDecision["stdoutClassification"],
    stderrClassification: FFmpegProcessDecision["stderrClassification"],
    stages: readonly FFmpegProcessAuditEntry["stage"][],
  ): FFmpegProcessDecision {
    return deepFreeze({
      decisionVersion: "1.0",
      classification,
      reasonCode,
      retryClassification: retryFor(classification),
      exitClassification,
      stdoutClassification,
      stderrClassification,
      audit: {
        auditVersion: "1.0",
        entries: stages.map((stage, sequence) => ({
          entryVersion: "1.0",
          sequence,
          stage,
          classification,
          reasonCode,
        })),
      },
    });
  }
}
