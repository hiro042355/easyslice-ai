import { bootstrapAcquisitionWorker } from "./bootstrap";

if (require.main === module) {
  void bootstrapAcquisitionWorker(
    () => import("./startupTelemetry.js"),
    () => import("./experimentControlMain.js").then(({ startProviderDisabledExperimentWorker }) => ({
      startAcquisitionWorker: startProviderDisabledExperimentWorker,
    })),
  );
}
