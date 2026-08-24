import type { AcquisitionWorkerStartupTelemetrySink } from "./startupTelemetry";

type ClosedStartupTelemetry = AcquisitionWorkerStartupTelemetrySink;

type StartupTelemetryModule = Readonly<{
  AcquisitionWorkerStartupTelemetry: new () => ClosedStartupTelemetry;
}>;

type WorkerMainModule = Readonly<{
  startAcquisitionWorker(telemetry: ClosedStartupTelemetry): Promise<void>;
}>;

const bootstrapFailure = Object.freeze({
  event: "acquisition-worker-startup",
  startupStage: "CONTAINER_BOOTSTRAP",
  googleAuthStage: "UNKNOWN",
  startupFailureFamily: "ENTRY_MODULE_LOAD_FAILURE",
  runtimeDependenciesResolved: "UNKNOWN",
  controlAuthorityValidated: "UNKNOWN",
  googleAuthInitialized: "UNKNOWN",
  controlStoreInitialized: "UNKNOWN",
  telemetryProxyInitialized: "UNKNOWN",
  httpListenerBound: "UNKNOWN",
  imdsv2TokenAcquired: "UNKNOWN",
  awsRegionResolved: "UNKNOWN",
  awsRoleCredentialsAcquired: "UNKNOWN",
  gcpStsExchangeSucceeded: "UNKNOWN",
  serviceAccountImpersonationSucceeded: "UNKNOWN",
});

export const bootstrapAcquisitionWorker = async (
  loadTelemetry: () => Promise<StartupTelemetryModule> = () => import("./startupTelemetry.js"),
  loadMain: () => Promise<WorkerMainModule> = () => import("./main.js"),
): Promise<void> => {
  let telemetry: ClosedStartupTelemetry | undefined;
  try {
    const telemetryModule = await loadTelemetry();
    telemetry = new telemetryModule.AcquisitionWorkerStartupTelemetry();
    telemetry.enter("ENTRY_MODULE_LOAD");
    const main = await loadMain();
    await main.startAcquisitionWorker(telemetry);
  } catch {
    console.error(JSON.stringify(telemetry?.failure() ?? bootstrapFailure));
    process.exitCode = 1;
  }
};

if (require.main === module) void bootstrapAcquisitionWorker();
