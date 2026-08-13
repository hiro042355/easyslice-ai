import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PACKAGED_DIRECTORY = path.join("node_modules", ".nexcut-runtime", "ffmpeg");

export const packagedFfmpegFilename = (platform = process.platform) =>
  platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

/**
 * @param {{ sourcePath?: string, projectRoot?: string, platform?: NodeJS.Platform }} [options]
 */
export const materializeFfmpegBinary = async (options = {}) => {
  const { sourcePath, projectRoot, platform = process.platform } = options;
  const resolvedSource = sourcePath ?? require("ffmpeg-static");
  if (!resolvedSource) throw new Error("ffmpeg-static-platform-unsupported");

  const root = projectRoot ?? process.cwd();
  const targetDirectory = path.join(root, PACKAGED_DIRECTORY);
  const targetPath = path.join(targetDirectory, packagedFfmpegFilename(platform));
  await mkdir(targetDirectory, { recursive: true });
  await copyFile(resolvedSource, targetPath);
  await chmod(targetPath, 0o755);

  const targetStat = await stat(targetPath);
  await access(targetPath, constants.F_OK);
  if (platform !== "win32") await access(targetPath, constants.X_OK);
  if (!targetStat.isFile() || targetStat.size === 0) {
    throw new Error("packaged-ffmpeg-invalid");
  }
  return targetPath;
};

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  materializeFfmpegBinary()
    .then(() => console.info("Packaged FFmpeg binary materialized."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "ffmpeg-materialization-failed");
      process.exitCode = 1;
    });
}
