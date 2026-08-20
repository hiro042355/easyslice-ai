import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolvePackagedFfmpeg } from "../packagedFfmpeg";
import { resolvePackagedYtDlp } from "../packagedYtDlp";
import { AcquisitionWorkerFailure } from "./types";
import type { AcquisitionRuntime } from "./sourceAdapter";

export const resolveAcquisitionRuntime = async (options: Readonly<{
  projectRoot?: string;
  nodeExecutable?: string;
  nodeVersion?: string;
}> = {}): Promise<AcquisitionRuntime> => {
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const nodeMajorVersion = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (!Number.isSafeInteger(nodeMajorVersion) || nodeMajorVersion < 22) {
    throw new AcquisitionWorkerFailure("js-runtime-unavailable");
  }
  try {
    await access(nodeExecutable, constants.F_OK | constants.X_OK);
  } catch {
    throw new AcquisitionWorkerFailure("js-runtime-unavailable");
  }
  return Object.freeze({
    ytDlpExecutable: await resolvePackagedYtDlp(options.projectRoot),
    ffmpegExecutable: resolvePackagedFfmpeg(options.projectRoot),
    nodeExecutable,
    nodeMajorVersion,
  });
};

export const nodeJsRuntimeArgument = (nodeExecutable: string): string => `node:${nodeExecutable}`;
