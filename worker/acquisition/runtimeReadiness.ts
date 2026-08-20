import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { PACKAGED_YT_DLP_VERSION, probePackagedYtDlpVersion } from "../../lib/server/packagedYtDlp";
import { resolveAcquisitionRuntime } from "../../lib/server/acquisitionWorker/runtime";
import type { WorkerReadiness } from "./httpService";

const execFileAsync = promisify(execFile);
const PROVIDER_VERSION = "1.3.1";

export const probeWorkerReadiness = async (signal?: AbortSignal): Promise<WorkerReadiness> => {
  let ytDlpVersionMatch = false;
  let ffmpegAvailable = false;
  let nodeSupported = false;
  let providerHealthy = false;
  try {
    const runtime = await resolveAcquisitionRuntime();
    nodeSupported = runtime.nodeMajorVersion >= 22;
    await access(runtime.ffmpegExecutable, constants.F_OK | constants.X_OK);
    await execFileAsync(runtime.ffmpegExecutable, ["-version"], { timeout: 5_000, maxBuffer: 16 * 1024 });
    ffmpegAvailable = true;
    ytDlpVersionMatch = await probePackagedYtDlpVersion() === PACKAGED_YT_DLP_VERSION;
    const response = await fetch("http://127.0.0.1:4416/ping", { signal });
    if (response.ok) {
      const body = await response.json() as Readonly<{ version?: unknown }>;
      providerHealthy = body.version === PROVIDER_VERSION;
    }
  } catch {
    // Readiness is represented only by fixed booleans.
  }
  return Object.freeze({
    ready: ytDlpVersionMatch && ffmpegAvailable && nodeSupported && providerHealthy,
    ytDlpVersionMatch,
    ffmpegAvailable,
    nodeSupported,
    providerHealthy,
  });
};
