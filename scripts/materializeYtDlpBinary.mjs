import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const YT_DLP_VERSION = "2026.03.13";
export const YT_DLP_ASSET = "yt-dlp_linux";
export const YT_DLP_SHA256 = "b15210c7791b8d473f8373f150a014194dbd7702ec4dd507e565411096a3284c";
export const YT_DLP_SOURCE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${YT_DLP_ASSET}`;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const PACKAGED_SEGMENTS = ["node_modules", ".nexcut-runtime", "yt-dlp", "yt-dlp"];

export const packagedYtDlpPath = (projectRoot = process.cwd()) => path.join(projectRoot, ...PACKAGED_SEGMENTS);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const downloadPinnedArtifact = async (fetchImpl) => {
  const response = await fetchImpl(YT_DLP_SOURCE, { redirect: "follow" });
  if (!response.ok) throw new Error("yt-dlp-download-failed");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && (declared <= 0 || declared > MAX_ARTIFACT_BYTES)) {
    throw new Error("yt-dlp-artifact-size-invalid");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_ARTIFACT_BYTES) throw new Error("yt-dlp-artifact-size-invalid");
  return bytes;
};

export const materializeYtDlpBinary = async ({
  projectRoot = process.cwd(),
  fetchImpl = fetch,
  artifact = /** @type {Uint8Array | undefined} */ (undefined),
  expectedSha256 = YT_DLP_SHA256,
  platform = process.platform,
} = {}) => {
  const bytes = artifact ? Buffer.from(artifact) : await downloadPinnedArtifact(fetchImpl);
  if (sha256(bytes) !== expectedSha256) throw new Error("yt-dlp-integrity-mismatch");

  const target = packagedYtDlpPath(projectRoot);
  const temporary = `${target}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(temporary, bytes, { mode: 0o755 });
    await chmod(temporary, 0o755);
    await rm(target, { force: true });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }

  const targetStat = await stat(target);
  await access(target, constants.F_OK | constants.X_OK);
  if (!targetStat.isFile() || targetStat.size === 0 || (platform !== "win32" && (targetStat.mode & 0o111) === 0)) {
    throw new Error("packaged-yt-dlp-invalid");
  }
  return target;
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  materializeYtDlpBinary()
    .then(() => console.info(`Packaged yt-dlp ${YT_DLP_VERSION} materialized with verified SHA-256.`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "yt-dlp-materialization-failed");
      process.exitCode = 1;
    });
}
