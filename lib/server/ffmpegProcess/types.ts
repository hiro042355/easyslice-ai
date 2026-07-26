import type { Readable } from "node:stream";

export type ProcessLike = Readonly<{
  stdout: Readable | null;
  stderr: Readable | null;
  once(event: "error", listener: (error: Error) => void): ProcessLike;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): ProcessLike;
  kill(signal?: NodeJS.Signals): boolean;
}>;

export type SpawnCapability = (
  executable: string,
  argumentTokens: readonly string[],
  options: { shell: false; stdio: ["ignore", "pipe", "pipe"] },
) => ProcessLike;

export type TimerCapability = Readonly<{
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}>;

export type FFmpegProcessClassification =
  | "success" | "failed" | "timeout" | "cancelled"
  | "spawn-failure" | "dependency-failure" | "invalid";
export type FFmpegProcessReasonCode =
  | "process-completed" | "process-exit-failure" | "process-timed-out"
  | "process-cancelled" | "process-spawn-failure"
  | "process-dependency-failure" | "request-invalid"
  | "executable-unsupported" | "argument-unsafe" | "timeout-invalid";
export type RetryClassification =
  | "retry-not-required" | "retry-not-allowed" | "retry-safe" | "retry-external-policy";

export type FFmpegCommandProjection = Readonly<{
  projectionVersion: "1.0";
  executable: "ffmpeg";
  argumentTokens: readonly string[];
}>;

export type FFmpegProcessRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  operationIdentity: string;
  command: FFmpegCommandProjection;
  timeoutMilliseconds: number;
  cancellationSignal?: AbortSignal;
}>;

export type FFmpegProcessAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "spawn" | "monitor" | "classification";
  classification: FFmpegProcessClassification;
  reasonCode: FFmpegProcessReasonCode;
}>;
export type FFmpegProcessAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly FFmpegProcessAuditEntry[];
}>;

export type FFmpegProcessDecision = Readonly<{
  decisionVersion: "1.0";
  classification: FFmpegProcessClassification;
  reasonCode: FFmpegProcessReasonCode;
  retryClassification: RetryClassification;
  exitClassification: "zero" | "non-zero" | "not-observed";
  stdoutClassification: "empty" | "present" | "not-observed";
  stderrClassification: "empty" | "present" | "not-observed";
  audit: FFmpegProcessAudit;
}>;

export type FFmpegProcessCapability = Readonly<{
  execute(request: FFmpegProcessRequest): Promise<FFmpegProcessDecision>;
}>;
