import { AcquisitionWorkerCore, type AcquisitionArtifactConsumer, type AcquisitionMediaInspector } from "../../lib/server/acquisitionWorker/core";
import { GcsAcquisitionControlObjectStore, createMetadataAccessTokenSupplier, readProductionAcquisitionControlConfiguration } from "../../lib/server/acquisitionWorker/gcsControlStore";
import type { AcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/idempotency";
import { inspectCanonicalMp4 } from "../../lib/server/acquisitionWorker/mediaValidation";
import { PersistentAcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { BgutilHttpPoTokenProvider } from "../../lib/server/acquisitionWorker/provider";
import { resolveAcquisitionRuntime } from "../../lib/server/acquisitionWorker/runtime";
import { SourceAdapterRegistry, type AcquisitionRuntime, type PoTokenProvider } from "../../lib/server/acquisitionWorker/sourceAdapter";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";
import { YouTubeSourceAdapter, type AcquisitionProcessRunner } from "../../lib/server/acquisitionWorker/youtubeAdapter";
import { runPackagedYtDlp } from "../../lib/server/packagedYtDlp";
import { probeBgutilProviderHealth } from "./runtimeReadiness";

const DEFAULT_AUTHORITY_ROOT = "/workspace/acquisitions";
export type AcquisitionWorkerExecution = Readonly<{ execute(input: unknown, signal?: AbortSignal): Promise<AcquisitionResult> }>;
export type AcquisitionWorkerCompositionOptions = Readonly<{
  authorityRoot?: string;
  resolveRuntime?: () => Promise<AcquisitionRuntime>;
  run?: AcquisitionProcessRunner;
  inspectMedia?: AcquisitionMediaInspector;
  consumeArtifact?: AcquisitionArtifactConsumer;
  idempotency?: AcquisitionIdempotencyStore;
  provider?: PoTokenProvider;
}>;

const productionRunner: AcquisitionProcessRunner = async (args, options) => { await runPackagedYtDlp(args, options); };
const ephemeralResult: AcquisitionArtifactConsumer = async ({ acquisitionId }) => `acquisition:${acquisitionId}`;

export const createAcquisitionWorkerComposition = async (
  options: AcquisitionWorkerCompositionOptions = {},
): Promise<AcquisitionWorkerExecution> => {
  const runtime = await (options.resolveRuntime ?? resolveAcquisitionRuntime)();
  const configuration = options.idempotency ? undefined : readProductionAcquisitionControlConfiguration();
  const idempotency = options.idempotency ?? new PersistentAcquisitionIdempotencyStore(
    new GcsAcquisitionControlObjectStore(configuration!.bucket, createMetadataAccessTokenSupplier()),
  );
  const core = new AcquisitionWorkerCore({
    adapters: new SourceAdapterRegistry([new YouTubeSourceAdapter(options.run ?? productionRunner)]),
    idempotency,
    runtime,
    authorityRoot: options.authorityRoot ?? process.env.ACQUISITION_WORKSPACE_ROOT ?? DEFAULT_AUTHORITY_ROOT,
    inspectMedia: options.inspectMedia ?? inspectCanonicalMp4,
    consumeArtifact: options.consumeArtifact ?? ephemeralResult,
    provider: options.provider ?? new BgutilHttpPoTokenProvider(probeBgutilProviderHealth),
  });
  return Object.freeze({ execute: (input, signal) => core.execute(input, signal) });
};
