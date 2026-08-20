import { createAcquisitionWorkerHttpService } from "./httpService";
import { probeWorkerReadiness } from "./runtimeReadiness";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error("invalid-worker-port");

const service = createAcquisitionWorkerHttpService({
  execute: async (input): Promise<AcquisitionResult> => Object.freeze({
    acquisitionId: (input as Readonly<{ acquisitionId: string }>).acquisitionId,
    status: "failed",
    errorCode: "unknown-acquisition-failure",
    retryable: false,
  }),
  readiness: probeWorkerReadiness,
  log: (entry) => console.info(JSON.stringify(entry)),
});

service.listen(port, "0.0.0.0", () => {
  console.info(JSON.stringify({ event: "worker-listening" }));
});

const shutdown = () => service.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
