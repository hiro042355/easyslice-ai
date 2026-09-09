import { createProviderDisabledExperimentComposition } from "./composition";
import { startAcquisitionWorkerWithFactory } from "./main";
import type { AcquisitionWorkerStartupTelemetrySink } from "./startupTelemetry";

export const startProviderDisabledExperimentWorker = (
  startupTelemetry: AcquisitionWorkerStartupTelemetrySink,
): Promise<void> => startAcquisitionWorkerWithFactory(
  startupTelemetry,
  (telemetry) => createProviderDisabledExperimentComposition({ startupTelemetry: telemetry }),
);
