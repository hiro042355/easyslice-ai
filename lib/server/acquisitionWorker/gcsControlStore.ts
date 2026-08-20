import {
  ACQUISITION_CONTROL_PREFIX,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "./persistentIdempotency";

const PRODUCTION_BUCKET = "nexcut-prod-jp-2026-media";
const STORAGE_API = "https://storage.googleapis.com";
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type SafeFetch = (input: string, init?: RequestInit) => Promise<Response>;

const exactObject = (name: string): string => {
  if (!name.startsWith(ACQUISITION_CONTROL_PREFIX) || name.includes("..") || name.includes("\\")) {
    throw new TypeError("invalid-acquisition-control-object");
  }
  return encodeURIComponent(name);
};

const generation = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("invalid-gcs-generation");
  return value;
};

export const readProductionAcquisitionControlConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<{ bucket: string; prefix: typeof ACQUISITION_CONTROL_PREFIX }> => {
  if (environment.MEDIA_BUCKET_NAME !== PRODUCTION_BUCKET) throw new Error("invalid-acquisition-control-bucket");
  return Object.freeze({ bucket: PRODUCTION_BUCKET, prefix: ACQUISITION_CONTROL_PREFIX });
};

export const createMetadataAccessTokenSupplier = (fetchImpl: SafeFetch = fetch): (() => Promise<string>) => {
  let cached: Readonly<{ token: string; expiresAt: number }> | undefined;
  return async () => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) throw new Error("acquisition-control-auth-failed");
    const body = await response.json() as Readonly<{ access_token?: unknown; expires_in?: unknown }>;
    if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
      throw new Error("acquisition-control-auth-failed");
    }
    cached = Object.freeze({ token: body.access_token, expiresAt: Date.now() + body.expires_in * 1_000 });
    return cached.token;
  };
};

export class GcsAcquisitionControlObjectStore implements AcquisitionControlObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly token: () => Promise<string>,
    private readonly fetchImpl: SafeFetch = fetch,
  ) {
    if (bucket !== PRODUCTION_BUCKET) throw new TypeError("invalid-acquisition-control-bucket");
  }

  async create(objectName: string, record: AcquisitionControlRecord) {
    return this.upload(objectName, "0", record, "created" as const);
  }

  async read(objectName: string) {
    const response = await this.fetchImpl(
      `${STORAGE_API}/storage/v1/b/${this.bucket}/o/${exactObject(objectName)}?alt=media`,
      { headers: { authorization: `Bearer ${await this.token()}` } },
    );
    if (response.status === 404) return Object.freeze({ status: "missing" as const });
    if (!response.ok) throw new Error("acquisition-control-read-failed");
    const headerGeneration = response.headers.get("x-goog-generation");
    const record = validateAcquisitionControlRecord(await response.json());
    return Object.freeze({ status: "found" as const, object: Object.freeze({
      generation: generation(headerGeneration), record,
    }) });
  }

  async replace(objectName: string, expectedGeneration: string, record: AcquisitionControlRecord) {
    return this.upload(objectName, generation(expectedGeneration), record, "updated" as const);
  }

  private async upload<T extends "created" | "updated">(
    objectName: string,
    expectedGeneration: string,
    record: AcquisitionControlRecord,
    success: T,
  ): Promise<Readonly<{ status: T; generation: string } | { status: T extends "created" ? "exists" : "precondition-failed" }>> {
    const name = exactObject(objectName);
    const response = await this.fetchImpl(
      `${STORAGE_API}/upload/storage/v1/b/${this.bucket}/o?uploadType=media&name=${name}&ifGenerationMatch=${expectedGeneration}`,
      { method: "POST", headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
        body: JSON.stringify(validateAcquisitionControlRecord(record)) },
    );
    if (response.status === 412) {
      return Object.freeze({ status: (success === "created" ? "exists" : "precondition-failed") as T extends "created" ? "exists" : "precondition-failed" });
    }
    if (!response.ok) throw new Error("acquisition-control-write-failed");
    const metadata = await response.json() as Readonly<{ generation?: unknown }>;
    return Object.freeze({ status: success, generation: generation(metadata.generation) });
  }
}
