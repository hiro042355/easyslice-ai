import { createAcquisitionWorkerHttpService } from "./httpService";
import { createAcquisitionWorkerComposition } from "./composition";
import { probeWorkerReadiness } from "./runtimeReadiness";
import { probeControlledEgress } from "./networkReadiness";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error("invalid-worker-port");

const start = async (): Promise<void> => {
  const execution = await createAcquisitionWorkerComposition();
  const service = createAcquisitionWorkerHttpService({ execute: execution.execute, telemetry: execution.telemetry, readiness: probeWorkerReadiness,
    networkReadiness: (signal) => probeControlledEgress(process.env.EXPECTED_EGRESS_IP, signal),
    log: (entry) => console.info(JSON.stringify(entry)) });
  service.listen(port, "0.0.0.0", () => console.info(JSON.stringify({ event: "worker-listening" })));
  const shutdown = () => service.close(() => process.exit(0));
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

void start().catch(() => {
  console.error(JSON.stringify({ event: "worker-start-failed" }));
  process.exit(1);
});
