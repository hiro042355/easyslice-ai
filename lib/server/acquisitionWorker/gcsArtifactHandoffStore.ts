import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { Storage, type Bucket, type UploadOptions } from "@google-cloud/storage";
import type { ArtifactHandoffStore } from "./core";
import { createArtifactHandoffReference } from "./contracts";
import { AcquisitionWorkerFailure, type AcquisitionArtifactHandoff } from "./types";

const PROJECT = "nexcut-prod-jp-2026" as const;
const BUCKET = "nexcut-prod-jp-2026-media" as const;
export const ACQUISITION_HANDOFF_PREFIX = "acquisition-handoff/v1/" as const;
export const ACQUISITION_HANDOFF_TTL_DAYS = 7 as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HandoffBucket = Pick<Bucket, "upload">;

const digestFile = async (filePath: string, expectedBytes: number): Promise<string> => {
  let file;
  try {
    file = await lstat(filePath);
  } catch {
    throw new AcquisitionWorkerFailure("handoff-artifact-invalid");
  }
  if (!file.isFile() || file.isSymbolicLink() || file.size !== expectedBytes || file.size <= 0) {
    throw new AcquisitionWorkerFailure("handoff-artifact-invalid");
  }
  const digest = createHash("sha256");
  try {
    for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  } catch {
    throw new AcquisitionWorkerFailure("handoff-artifact-invalid");
  }
  return digest.digest("hex");
};

const statusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; response?: { statusCode?: unknown; status?: unknown } };
  const value = candidate.code ?? candidate.response?.statusCode ?? candidate.response?.status;
  return typeof value === "number" ? value : typeof value === "string" && /^\d{3}$/.test(value)
    ? Number.parseInt(value, 10) : undefined;
};

export class GcsArtifactHandoffStore implements ArtifactHandoffStore {
  constructor(
    private readonly bucket: HandoffBucket,
    private readonly prefix: typeof ACQUISITION_HANDOFF_PREFIX,
    private readonly ttlDays: typeof ACQUISITION_HANDOFF_TTL_DAYS,
    private readonly now: () => number = Date.now,
  ) {}

  async create(input: Parameters<ArtifactHandoffStore["create"]>[0]): Promise<AcquisitionArtifactHandoff> {
    if (!UUID.test(input.acquisitionId) || input.media.contentType !== "video/mp4"
      || !Number.isSafeInteger(input.media.byteSize) || input.media.byteSize <= 0
      || !Number.isFinite(input.media.durationSeconds) || input.media.durationSeconds <= 0) {
      throw new AcquisitionWorkerFailure("handoff-artifact-invalid");
    }
    const sha256 = await digestFile(input.path, input.media.byteSize);
    const objectName = `${this.prefix}${input.acquisitionId}/${sha256}.mp4`;
    const options: UploadOptions = {
      destination: objectName,
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "video/mp4" },
    };
    try {
      await this.bucket.upload(input.path, options);
    } catch (error) {
      const code = statusCode(error);
      if (code === 412) throw new AcquisitionWorkerFailure("handoff-conflict");
      if (code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429) {
        throw new AcquisitionWorkerFailure("handoff-definitive-failure");
      }
      throw new AcquisitionWorkerFailure("handoff-outcome-ambiguous");
    }
    return Object.freeze({
      artifactReference: createArtifactHandoffReference(input.acquisitionId, sha256),
      contentType: "video/mp4",
      byteSize: input.media.byteSize,
      sha256,
      workerObservedDurationSeconds: input.media.durationSeconds,
      videoPresent: true,
      audioPresent: input.media.hasAudio,
      expiresAt: new Date(this.now() + this.ttlDays * 24 * 60 * 60 * 1_000).toISOString(),
    });
  }
}

export const createGcsArtifactHandoffStore = (
  environment: NodeJS.ProcessEnv,
  storage = new Storage({ projectId: PROJECT, retryOptions: { autoRetry: false, maxRetries: 0 } }),
  now: () => number = Date.now,
): ArtifactHandoffStore => {
  if (environment.ACQUISITION_HANDOFF_BUCKET !== BUCKET
    || environment.ACQUISITION_HANDOFF_PREFIX !== ACQUISITION_HANDOFF_PREFIX
    || environment.ACQUISITION_HANDOFF_TTL_DAYS !== String(ACQUISITION_HANDOFF_TTL_DAYS)) {
    throw new AcquisitionWorkerFailure("handoff-configuration-failure");
  }
  return new GcsArtifactHandoffStore(storage.bucket(BUCKET), ACQUISITION_HANDOFF_PREFIX,
    ACQUISITION_HANDOFF_TTL_DAYS, now);
};
