import { AcquisitionWorkerCore, type AcquisitionArtifactConsumer, type AcquisitionMediaInspector } from "../../lib/server/acquisitionWorker/core";
import { createAcquisitionControlStore } from "../../lib/server/acquisitionWorker/gcsControlStore";
import type { AcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/idempotency";
import { inspectCanonicalMp4 } from "../../lib/server/acquisitionWorker/mediaValidation";
import { PersistentAcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { BgutilHttpPoTokenProvider } from "../../lib/server/acquisitionWorker/provider";
import { resolveAcquisitionRuntime } from "../../lib/server/acquisitionWorker/runtime";
import { SourceAdapterRegistry, type AcquisitionRuntime, type PoTokenProvider } from "../../lib/server/acquisitionWorker/sourceAdapter";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";
import { classifyYouTubeProcessFailure, YouTubeSourceAdapter, type AcquisitionProcessRunner } from "../../lib/server/acquisitionWorker/youtubeAdapter";
import { runPackagedYtDlp, YtDlpProcessFailure } from "../../lib/server/packagedYtDlp";
import { probeBgutilProviderHealth } from "./runtimeReadiness";
import { ProviderTelemetryProxy } from "./providerTelemetryProxy";
import type { AcquisitionSafeTelemetry } from "../../lib/server/acquisitionWorker/telemetry";
import { emitAcquisitionWorkerSafeYtDlpFailureLog, projectAcquisitionWorkerYtDlpFailure, type AcquisitionWorkerSafeYtDlpFailureLog } from "./safeYtDlpFailureLog";
import type { AcquisitionWorkerStartupTelemetrySink } from "./startupTelemetry";

const DEFAULT_AUTHORITY_ROOT = "/workspace/acquisitions";
export type AcquisitionWorkerExecution = Readonly<{
  execute(input: unknown, signal?: AbortSignal): Promise<AcquisitionResult>;
  telemetry(acquisitionId: string): AcquisitionSafeTelemetry | undefined;
}>;
export type AcquisitionWorkerCompositionOptions = Readonly<{
  authorityRoot?: string;
  resolveRuntime?: () => Promise<AcquisitionRuntime>;
  run?: AcquisitionProcessRunner;
  inspectMedia?: AcquisitionMediaInspector;
  consumeArtifact?: AcquisitionArtifactConsumer;
  idempotency?: AcquisitionIdempotencyStore;
  provider?: PoTokenProvider;
  telemetryProxy?: ProviderTelemetryProxy;
  logYtDlpFailure?: (entry: AcquisitionWorkerSafeYtDlpFailureLog) => void;
  startupTelemetry?: AcquisitionWorkerStartupTelemetrySink;
}>;

export const createProductionAcquisitionRunner = (
  log: (entry: AcquisitionWorkerSafeYtDlpFailureLog) => void,
  run: typeof runPackagedYtDlp = runPackagedYtDlp,
): AcquisitionProcessRunner => async (args, options) => {
  try {
    await run(args, { ...options, onSpawnStarted: () => options.telemetry?.ytDlpStarted() });
  } catch (error) {
    if (error instanceof YtDlpProcessFailure) {
      if (error.diagnostic.closedStageTelemetry) options.telemetry?.processEvidence(error.diagnostic.closedStageTelemetry);
      options.telemetry?.processTerminated();
      const failure = classifyYouTubeProcessFailure(error.reason);
      options.telemetry?.failure(failure.code);
      if (options.telemetry) {
        const safe = projectAcquisitionWorkerYtDlpFailure(error, options.telemetry.snapshot());
        options.telemetry.processFailureEvidence({ family: error.reason, has403: safe.has403, has429: safe.has429,
          has5xx: safe.has5xx, timedOut: error.diagnostic.timedOut });
        log(projectAcquisitionWorkerYtDlpFailure(error, options.telemetry.snapshot()));
      }
    }
    throw error;
  }
};
const ephemeralResult: AcquisitionArtifactConsumer = async ({ acquisitionId }) => `acquisition:${acquisitionId}`;

export const createAcquisitionWorkerComposition = async (
  options: AcquisitionWorkerCompositionOptions = {},
): Promise<AcquisitionWorkerExecution> => {
  options.startupTelemetry?.enter("RUNTIME_RESOLUTION");
  const runtime = await (options.resolveRuntime ?? resolveAcquisitionRuntime)();
  options.startupTelemetry?.prove("runtimeDependenciesResolved");
  options.startupTelemetry?.enter("CONTROL_STORE_CONFIG");
  const idempotency = options.idempotency ?? new PersistentAcquisitionIdempotencyStore(
    await createAcquisitionControlStore(process.env, undefined, fetch, undefined, options.startupTelemetry ? {
      controlAuthorityValidated: () => options.startupTelemetry!.prove("controlAuthorityValidated"),
      googleAuthStage: (stage) => options.startupTelemetry!.enterGoogleAuth(stage),
      googleAuthEvidence: (key) => options.startupTelemetry!.proveGoogleAuth(key),
      googleAuthBoundaryEvidence: (key, value) => options.startupTelemetry!.observeGoogleAuth(key, value),
      sessionTokenBoundaryEvidence: (key, value) => options.startupTelemetry!.observeSessionTokenBoundary(key, value),
      imdsv2PayloadShape: (value) => options.startupTelemetry!.observeImdsv2PayloadShape(value),
      outerAccessTokenBoundary: (progress, shape) => options.startupTelemetry!.observeOuterAccessToken(progress, shape),
      outerContinuationEvidence: (key) => options.startupTelemetry!.observeOuterContinuation(key),
      outerCorrelationEvidence: (boundary, marker) => options.startupTelemetry!.observeOuterCorrelation(boundary, marker),
      gcpStsFailure: (reason) => options.startupTelemetry!.failGcpSts(reason),
      projectIdEvidence: (key, value) => options.startupTelemetry!.observeProjectId(key, value),
      projectIdFailure: (reason) => options.startupTelemetry!.failProjectId(reason),
      sigv4Evidence: (evidence) => options.startupTelemetry!.observeSigv4(evidence),
      googleAuthStarting: () => options.startupTelemetry!.enter("GOOGLE_AUTH_INIT"),
      googleAuthInitialized: () => options.startupTelemetry!.prove("googleAuthInitialized"),
      controlStoreStarting: () => options.startupTelemetry!.enter("CONTROL_STORE_INIT"),
      controlStoreInitialized: () => options.startupTelemetry!.prove("controlStoreInitialized"),
    } : undefined),
  );
  const retained = new Map<string, AcquisitionSafeTelemetry>();
  const proxy = options.provider ? undefined : (options.telemetryProxy ?? new ProviderTelemetryProxy());
  options.startupTelemetry?.enter("TELEMETRY_PROXY_INIT");
  if (proxy) await proxy.start();
  options.startupTelemetry?.prove("telemetryProxyInitialized");
  const provider = options.provider ?? new BgutilHttpPoTokenProvider(probeBgutilProviderHealth,
    "http://127.0.0.1:4417", (collector, operation) => proxy!.observe(collector, operation));
  const runner = options.run ?? createProductionAcquisitionRunner(options.logYtDlpFailure ?? emitAcquisitionWorkerSafeYtDlpFailureLog);
  const core = new AcquisitionWorkerCore({
    adapters: new SourceAdapterRegistry([new YouTubeSourceAdapter(runner)]),
    idempotency,
    runtime,
    authorityRoot: options.authorityRoot ?? process.env.ACQUISITION_WORKSPACE_ROOT ?? DEFAULT_AUTHORITY_ROOT,
    inspectMedia: options.inspectMedia ?? inspectCanonicalMp4,
    consumeArtifact: options.consumeArtifact ?? ephemeralResult,
    provider,
    telemetryRuntime: { pluginArtifact: true, nodeConfigured: true, nodeExecutable: true,
      nodeVersionMatch: runtime.nodeMajorVersion === 24, ejsAvailable: true },
    retainTelemetry(acquisitionId, telemetry) { retained.set(acquisitionId, telemetry); },
  });
  return Object.freeze({ execute: (input, signal) => core.execute(input, signal),
    telemetry: (acquisitionId) => {
      const telemetry = retained.get(acquisitionId);
      retained.delete(acquisitionId);
      return telemetry;
    } });
};
