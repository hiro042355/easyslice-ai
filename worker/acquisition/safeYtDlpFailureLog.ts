import {
  createSafeYtDlpFailureLog,
  type YtDlpProcessFailure,
  type YtDlpProcessFailureReason,
} from "../../lib/server/packagedYtDlp";
import type { AcquisitionSafeTelemetry } from "../../lib/server/acquisitionWorker/telemetry";

export type AcquisitionWorkerSafeYtDlpFailureLog = Readonly<{
  severity: "ERROR";
  event: "acquisition-process-failure";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  safeFailureFamily: YtDlpProcessFailureReason;
  has403: boolean;
  has429: boolean;
  has5xx: boolean;
  requestedFormatFailure: boolean;
  ffmpegFailure: boolean;
  writeFailure: boolean;
  permissionFailure: boolean;
  networkFailure: boolean;
  providerTokenResponseObserved: AcquisitionSafeTelemetry["providerTokenResponseObserved"];
  providerTokenSchemaValid: AcquisitionSafeTelemetry["providerTokenSchemaValid"];
  tokenContext: AcquisitionSafeTelemetry["tokenContext"];
  tokenConsumedByYtDlp: AcquisitionSafeTelemetry["tokenConsumedByYtDlp"];
  playerClient: AcquisitionSafeTelemetry["playerClient"];
  gvsRequestReached: AcquisitionSafeTelemetry["gvsRequestReached"];
  mediaRequestReached: AcquisitionSafeTelemetry["mediaRequestReached"];
  selectedTransport: AcquisitionSafeTelemetry["selectedTransport"];
  hlsManifestReached: AcquisitionSafeTelemetry["hlsManifestReached"];
  hlsFragmentReached: AcquisitionSafeTelemetry["hlsFragmentReached"];
  http403Stage: AcquisitionSafeTelemetry["http403Stage"];
  retryCount: AcquisitionSafeTelemetry["retryCount"];
  safeFailureCode: AcquisitionSafeTelemetry["safeFailureCode"];
  failureStage: AcquisitionSafeTelemetry["failureStage"];
}>;

const ALLOWED_SIGNALS = new Set<NodeJS.Signals>([
  "SIGABRT", "SIGALRM", "SIGBUS", "SIGCHLD", "SIGCONT", "SIGFPE", "SIGHUP",
  "SIGILL", "SIGINT", "SIGIO", "SIGIOT", "SIGKILL", "SIGPIPE", "SIGPOLL",
  "SIGPROF", "SIGPWR", "SIGQUIT", "SIGSEGV", "SIGSTKFLT", "SIGSTOP", "SIGSYS",
  "SIGTERM", "SIGTRAP", "SIGTSTP", "SIGTTIN", "SIGTTOU", "SIGURG", "SIGUSR1",
  "SIGUSR2", "SIGVTALRM", "SIGWINCH", "SIGXCPU", "SIGXFSZ",
]);

const projectExitCode = (value: number | null): number | null => {
  if (value === null || (Number.isFinite(value) && Number.isInteger(value))) return value;
  throw new TypeError("unsafe acquisition process exit code");
};

const projectSignal = (value: string | null): NodeJS.Signals | null => {
  if (value === null) return null;
  if (ALLOWED_SIGNALS.has(value as NodeJS.Signals)) return value as NodeJS.Signals;
  throw new TypeError("unsafe acquisition process signal");
};

export const projectAcquisitionWorkerYtDlpFailure = (
  error: YtDlpProcessFailure,
  telemetry: AcquisitionSafeTelemetry,
): AcquisitionWorkerSafeYtDlpFailureLog => {
  const safe = createSafeYtDlpFailureLog(error, true);
  return Object.freeze({
    severity: "ERROR",
    event: "acquisition-process-failure",
    exitCode: projectExitCode(safe.exitCode),
    signal: projectSignal(safe.signal),
    safeFailureFamily: safe.errorCode,
    has403: safe.has403,
    has429: safe.has429,
    has5xx: safe.has5xx,
    requestedFormatFailure: safe.hasRequestedFormat,
    ffmpegFailure: safe.hasFfmpeg,
    writeFailure: safe.hasWrite,
    permissionFailure: safe.hasPermission,
    networkFailure: safe.hasNetwork,
    providerTokenResponseObserved: telemetry.providerTokenResponseObserved,
    providerTokenSchemaValid: telemetry.providerTokenSchemaValid,
    tokenContext: telemetry.tokenContext,
    tokenConsumedByYtDlp: telemetry.tokenConsumedByYtDlp,
    playerClient: telemetry.playerClient,
    gvsRequestReached: telemetry.gvsRequestReached,
    mediaRequestReached: telemetry.mediaRequestReached,
    selectedTransport: telemetry.selectedTransport,
    hlsManifestReached: telemetry.hlsManifestReached,
    hlsFragmentReached: telemetry.hlsFragmentReached,
    http403Stage: telemetry.http403Stage,
    retryCount: telemetry.retryCount,
    safeFailureCode: telemetry.safeFailureCode,
    failureStage: telemetry.failureStage,
  });
};

export const serializeAcquisitionWorkerSafeYtDlpFailureLog = (
  entry: AcquisitionWorkerSafeYtDlpFailureLog,
): string => JSON.stringify(entry);

export const emitAcquisitionWorkerSafeYtDlpFailureLog = (
  entry: AcquisitionWorkerSafeYtDlpFailureLog,
  write: (line: string) => void = (line) => console.error(line),
): void => write(serializeAcquisitionWorkerSafeYtDlpFailureLog(entry));
