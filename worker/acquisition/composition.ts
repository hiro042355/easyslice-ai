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
import { runProductionControlStoreProof } from "./controlStoreProof";

const DEFAULT_AUTHORITY_ROOT = "/workspace/acquisitions";
export type AcquisitionWorkerExecution = Readonly<{
  execute(input: unknown, signal?: AbortSignal): Promise<AcquisitionResult>;
  telemetry(acquisitionId: string): AcquisitionSafeTelemetry | undefined;
  controlStoreProof(): Promise<Readonly<Record<string, boolean | number>>>;
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
}>;

export const createProductionAcquisitionRunner = (
  log: (entry: AcquisitionWorkerSafeYtDlpFailureLog) => void,
  run: typeof runPackagedYtDlp = runPackagedYtDlp,
): AcquisitionProcessRunner => async (args, options) => {
  try {
    await run(args, options);
  } catch (error) {
    if (error instanceof YtDlpProcessFailure) {
      if (error.diagnostic.closedStageTelemetry) options.telemetry?.processEvidence(error.diagnostic.closedStageTelemetry);
      const failure = classifyYouTubeProcessFailure(error.reason);
      options.telemetry?.failure(failure.code);
      if (options.telemetry) log(projectAcquisitionWorkerYtDlpFailure(error, options.telemetry.snapshot()));
    }
    throw error;
  }
};
const ephemeralResult: AcquisitionArtifactConsumer = async ({ acquisitionId }) => `acquisition:${acquisitionId}`;

export const createAcquisitionWorkerComposition = async (
  options: AcquisitionWorkerCompositionOptions = {},
): Promise<AcquisitionWorkerExecution> => {
  const runtime = await (options.resolveRuntime ?? resolveAcquisitionRuntime)();
  const idempotency = options.idempotency ?? new PersistentAcquisitionIdempotencyStore(
    await createAcquisitionControlStore(),
  );
  const retained = new Map<string, AcquisitionSafeTelemetry>();
  const proxy = options.provider ? undefined : (options.telemetryProxy ?? new ProviderTelemetryProxy());
  if (proxy) await proxy.start();
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
  return Object.freeze({ execute: (input, signal) => core.execute(input, signal), controlStoreProof: runProductionControlStoreProof,
    telemetry: (acquisitionId) => {
      const telemetry = retained.get(acquisitionId);
      retained.delete(acquisitionId);
      return telemetry;
    } });
};
