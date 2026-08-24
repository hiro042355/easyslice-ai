import { createAcquisitionWorkerHttpService } from "./httpService";
import { createAcquisitionWorkerComposition } from "./composition";
import { probeWorkerReadiness } from "./runtimeReadiness";
import { probeControlledEgress } from "./networkReadiness";
import type { AcquisitionWorkerStartupTelemetrySink } from "./startupTelemetry";

export const startAcquisitionWorker = async (startupTelemetry: AcquisitionWorkerStartupTelemetrySink): Promise<void> => {
    const execution = await createAcquisitionWorkerComposition({ startupTelemetry });
    const service = createAcquisitionWorkerHttpService({ execute: execution.execute, telemetry: execution.telemetry, readiness: probeWorkerReadiness,
      networkReadiness: (signal) => probeControlledEgress(process.env.EXPECTED_EGRESS_IP, signal),
      log: (entry) => console.info(JSON.stringify(entry)) });
    startupTelemetry.enter("HTTP_BIND");
    const port = Number.parseInt(process.env.PORT ?? "8080", 10);
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error("invalid-worker-port");
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => reject(error);
      service.once("error", failed);
      service.listen(port, "0.0.0.0", () => {
        service.off("error", failed);
        startupTelemetry.prove("httpListenerBound");
        console.info(JSON.stringify(startupTelemetry.ready()));
        resolve();
      });
    });
    const shutdown = () => service.close(() => process.exit(0));
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
};
