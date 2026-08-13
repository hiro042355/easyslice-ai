import path from "node:path";

const PACKAGED_FFMPEG_SEGMENTS = Object.freeze([
  "node_modules",
  ".nexcut-runtime",
  "ffmpeg",
]);

export const resolvePackagedFfmpeg = (
  projectRoot = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): string => path.join(
  projectRoot,
  ...PACKAGED_FFMPEG_SEGMENTS,
  platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
