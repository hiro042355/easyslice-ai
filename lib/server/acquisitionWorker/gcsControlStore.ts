import {
  ACQUISITION_CONTROL_PREFIX,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "./persistentIdempotency";
import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";

export const PRODUCTION_ACQUISITION_CONTROL_BUCKET = "nexcut-prod-jp-2026-media";
const STORAGE_API = "https://storage.googleapis.com";
const EXPERIMENT_BUCKET = /^nexcut-production-acquisition-host-experiment-[a-z0-9][a-z0-9-]{5,30}[a-z0-9]$/;
const STORAGE_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

type SafeFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type AcquisitionControlMode = "PRODUCTION" | "EXPERIMENT";
export type AcquisitionControlConfiguration = Readonly<{
  mode: AcquisitionControlMode;
  bucket: string;
  prefix: typeof ACQUISITION_CONTROL_PREFIX;
}>;
export interface GoogleAccessTokenSupplier {
  getAccessToken(signal?: AbortSignal): Promise<string>;
}

export type AcquisitionControlStoreStartupObserver = Readonly<{
  controlAuthorityValidated(): void;
  googleAuthStarting(): void;
  googleAuthInitialized(): void;
  controlStoreStarting(): void;
  controlStoreInitialized(): void;
}>;

export class AcquisitionControlAuthFailure extends Error {
  readonly code = "acquisition-control-auth-failed";
  constructor() {
    super("acquisition-control-auth-failed");
    this.name = "AcquisitionControlAuthFailure";
  }
}

const exactObject = (name: string, prefix: typeof ACQUISITION_CONTROL_PREFIX): string => {
  if (prefix !== ACQUISITION_CONTROL_PREFIX || !name.startsWith(prefix) || name.includes("..") || name.includes("\\")) {
    throw new TypeError("invalid-acquisition-control-object");
  }
  return encodeURIComponent(name);
};

const generation = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("invalid-gcs-generation");
  return value;
};

export const readAcquisitionControlConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AcquisitionControlConfiguration => {
  const mode = environment.ACQUISITION_CONTROL_MODE ?? "PRODUCTION";
  const bucket = environment.ACQUISITION_CONTROL_BUCKET ?? environment.MEDIA_BUCKET_NAME;
  const prefix = environment.ACQUISITION_CONTROL_PREFIX ?? ACQUISITION_CONTROL_PREFIX;
  if ((mode !== "PRODUCTION" && mode !== "EXPERIMENT") || !bucket || prefix !== ACQUISITION_CONTROL_PREFIX) {
    throw new Error("invalid-acquisition-control-authority");
  }
  if (mode === "PRODUCTION") {
    if (bucket !== PRODUCTION_ACQUISITION_CONTROL_BUCKET || environment.ACQUISITION_EXPERIMENT_BUCKET) {
      throw new Error("invalid-acquisition-control-authority");
    }
  } else if (bucket === PRODUCTION_ACQUISITION_CONTROL_BUCKET
    || bucket !== environment.ACQUISITION_EXPERIMENT_BUCKET || !EXPERIMENT_BUCKET.test(bucket)) {
    throw new Error("invalid-acquisition-control-authority");
  }
  return Object.freeze({ mode, bucket, prefix: ACQUISITION_CONTROL_PREFIX });
};

type GoogleAuthClient = Readonly<{ getAccessToken(): Promise<Readonly<{ token?: string | null }>> }>;
type GoogleAuthFactory = Readonly<{ getClient(): Promise<GoogleAuthClient> }>;

export const validateGoogleCredentialPolicy = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  load: (path: string) => Promise<string> = (path) => readFile(path, "utf8"),
): Promise<void> => {
  const credentialPath = environment.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) return;
  try {
    const value = JSON.parse(await load(credentialPath)) as Readonly<{ type?: unknown }>;
    if (value.type !== "external_account") throw new AcquisitionControlAuthFailure();
  } catch (error) {
    if (error instanceof AcquisitionControlAuthFailure) throw error;
    throw new AcquisitionControlAuthFailure();
  }
};

export const createAdcAccessTokenSupplier = (
  auth: GoogleAuthFactory = new GoogleAuth({ scopes: [STORAGE_SCOPE] }) as GoogleAuthFactory,
): GoogleAccessTokenSupplier => ({
  async getAccessToken(signal?: AbortSignal) {
    if (signal?.aborted) throw new AcquisitionControlAuthFailure();
    const failure = () => new AcquisitionControlAuthFailure();
    let onAbort: (() => void) | undefined;
    try {
      const operation = auth.getClient().then((client) => client.getAccessToken());
      const response = signal
        ? await Promise.race([operation, new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(failure());
          signal.addEventListener("abort", onAbort, { once: true });
        })])
        : await operation;
      if (typeof response.token !== "string" || response.token.length === 0) throw failure();
      return response.token;
    } catch {
      throw failure();
    } finally {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  },
});

export const createAcquisitionControlStore = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  auth?: GoogleAuthFactory,
  fetchImpl: SafeFetch = fetch,
  loadCredentialConfiguration?: (path: string) => Promise<string>,
  startup?: AcquisitionControlStoreStartupObserver,
): Promise<GcsAcquisitionControlObjectStore> => {
  const configuration = readAcquisitionControlConfiguration(environment);
  startup?.controlAuthorityValidated();
  await validateGoogleCredentialPolicy(environment, loadCredentialConfiguration);
  startup?.googleAuthStarting();
  const token = createAdcAccessTokenSupplier(auth);
  await token.getAccessToken();
  startup?.googleAuthInitialized();
  startup?.controlStoreStarting();
  const store = new GcsAcquisitionControlObjectStore(configuration, token, fetchImpl);
  startup?.controlStoreInitialized();
  return store;
};

export class GcsAcquisitionControlObjectStore implements AcquisitionControlObjectStore {
  constructor(
    private readonly configuration: AcquisitionControlConfiguration,
    private readonly token: GoogleAccessTokenSupplier,
    private readonly fetchImpl: SafeFetch = fetch,
  ) {
    if (configuration.prefix !== ACQUISITION_CONTROL_PREFIX
      || (configuration.mode === "PRODUCTION" && configuration.bucket !== PRODUCTION_ACQUISITION_CONTROL_BUCKET)
      || (configuration.mode === "EXPERIMENT" && (configuration.bucket === PRODUCTION_ACQUISITION_CONTROL_BUCKET
        || !EXPERIMENT_BUCKET.test(configuration.bucket)))) {
      throw new TypeError("invalid-acquisition-control-authority");
    }
  }

  async create(objectName: string, record: AcquisitionControlRecord) {
    return this.upload(objectName, "0", record, "created" as const);
  }

  async read(objectName: string) {
    const response = await this.fetchImpl(
      `${STORAGE_API}/storage/v1/b/${this.configuration.bucket}/o/${exactObject(objectName, this.configuration.prefix)}?alt=media`,
      { headers: { authorization: `Bearer ${await this.token.getAccessToken()}` } },
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
    const name = exactObject(objectName, this.configuration.prefix);
    const response = await this.fetchImpl(
      `${STORAGE_API}/upload/storage/v1/b/${this.configuration.bucket}/o?uploadType=media&name=${name}&ifGenerationMatch=${expectedGeneration}`,
      { method: "POST", headers: { authorization: `Bearer ${await this.token.getAccessToken()}`, "content-type": "application/json" },
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
