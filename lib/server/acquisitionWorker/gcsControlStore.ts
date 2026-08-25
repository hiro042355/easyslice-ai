import {
  ACQUISITION_CONTROL_PREFIX,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "./persistentIdempotency";
import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import { Gaxios, type GaxiosOptions } from "gaxios";
import type { GcpStsFailureReason, GoogleAuthEvidenceKey, GoogleAuthStage } from "../../../worker/acquisition/startupTelemetry";

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
  googleAuthStage(stage: GoogleAuthStage): void;
  googleAuthEvidence(key: GoogleAuthEvidenceKey): void;
  gcpStsFailure?(reason: GcpStsFailureReason): void;
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

const fixedString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

export const classifyGcpStsFailure = (error: unknown): GcpStsFailureReason => {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const value = error as Readonly<{ code?: unknown; response?: unknown }>;
  const code = fixedString(value.code);
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "ECONNABORTED") return "STS_TIMEOUT";
  if (!value.response || typeof value.response !== "object") return "UNKNOWN";
  const response = value.response as Readonly<{ status?: unknown; data?: unknown }>;
  const data = response.data && typeof response.data === "object"
    ? response.data as Readonly<{ error?: unknown }> : undefined;
  const oauthCode = fixedString(data?.error);
  if (oauthCode === "invalid_target") return "INVALID_AUDIENCE";
  if (oauthCode === "invalid_grant") return "SUBJECT_TOKEN_REJECTED";
  if (oauthCode === "access_denied" || response.status === 403) return "STS_PERMISSION_DENIED";
  if (oauthCode === "server_error" || oauthCode === "temporarily_unavailable"
    || (typeof response.status === "number" && response.status >= 500 && response.status <= 599)) {
    return "STS_UNAVAILABLE";
  }
  return "UNKNOWN";
};

const exactObject = (name: string, prefix: typeof ACQUISITION_CONTROL_PREFIX): string => {
  if (prefix !== ACQUISITION_CONTROL_PREFIX || !name.startsWith(prefix) || name.includes("..") || name.includes("\\")) {
    throw new TypeError("invalid-acquisition-control-object");
  }
  return encodeURIComponent(name);
};

type GoogleAuthRequestBoundary = Readonly<{
  stage: Exclude<GoogleAuthStage, "CREDENTIAL_FILE_LOAD" | "EXTERNAL_ACCOUNT_PARSE" | "READY" | "UNKNOWN">;
  success: readonly GoogleAuthEvidenceKey[];
}>;

const classifyGoogleAuthRequest = (input: string): GoogleAuthRequestBoundary | undefined => {
  let url: URL;
  try { url = new URL(input); } catch { return undefined; }
  if (url.hostname === "169.254.169.254" && url.pathname === "/latest/api/token") {
    return { stage: "IMDSV2_TOKEN", success: ["imdsv2TokenAcquired"] };
  }
  if (url.hostname === "169.254.169.254" && url.pathname === "/latest/meta-data/placement/availability-zone") {
    return { stage: "AWS_REGION_DISCOVERY", success: ["awsRegionResolved"] };
  }
  if (url.hostname === "169.254.169.254" && url.pathname.startsWith("/latest/meta-data/iam/security-credentials")) {
    return { stage: "AWS_ROLE_CREDENTIAL_FETCH", success: url.pathname === "/latest/meta-data/iam/security-credentials"
      ? [] : ["awsRoleCredentialsAcquired"] };
  }
  if (url.hostname === "sts.googleapis.com" && url.pathname === "/v1/token") {
    return { stage: "GCP_STS_EXCHANGE", success: ["gcpStsExchangeSucceeded"] };
  }
  if (url.hostname === "iamcredentials.googleapis.com" && url.pathname.endsWith(":generateAccessToken")) {
    return { stage: "SERVICE_ACCOUNT_IMPERSONATION", success: ["serviceAccountImpersonationSucceeded"] };
  }
  return undefined;
};

export const createGoogleAuthTelemetryTransporter = (
  startup: AcquisitionControlStoreStartupObserver,
  transporter: Gaxios = new Gaxios(),
): Gaxios => {
  const request = transporter.request.bind(transporter);
  let gcpStsSucceeded = false;
  transporter.request = (async <T>(options: GaxiosOptions) => {
    const boundary = classifyGoogleAuthRequest(String(options.url ?? ""));
    if (boundary?.stage === "SERVICE_ACCOUNT_IMPERSONATION" && !gcpStsSucceeded) {
      startup.googleAuthEvidence("gcpStsExchangeSucceeded");
      gcpStsSucceeded = true;
    }
    if (boundary) startup.googleAuthStage(boundary.stage);
    const response = await request<T>(options);
    if (boundary) for (const key of boundary.success) {
      startup.googleAuthEvidence(key);
      if (key === "gcpStsExchangeSucceeded") gcpStsSucceeded = true;
    }
    if (boundary?.success.includes("awsRoleCredentialsAcquired")) {
      startup.googleAuthStage("GCP_STS_EXCHANGE");
    }
    return response;
  }) as typeof transporter.request;
  return transporter;
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
  startup?: Pick<AcquisitionControlStoreStartupObserver, "googleAuthStage">,
): Promise<void> => {
  const credentialPath = environment.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) return;
  try {
    startup?.googleAuthStage("CREDENTIAL_FILE_LOAD");
    const contents = await load(credentialPath);
    startup?.googleAuthStage("EXTERNAL_ACCOUNT_PARSE");
    const value = JSON.parse(contents) as Readonly<{ type?: unknown }>;
    if (value.type !== "external_account") throw new AcquisitionControlAuthFailure();
  } catch (error) {
    if (error instanceof AcquisitionControlAuthFailure) throw error;
    throw new AcquisitionControlAuthFailure();
  }
};

export const createAdcAccessTokenSupplier = (
  auth: GoogleAuthFactory = new GoogleAuth({ scopes: [STORAGE_SCOPE] }) as GoogleAuthFactory,
  onFailure?: (error: unknown) => void,
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
    } catch (error) {
      onFailure?.(error);
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
  const currentGoogleAuth = { stage: "UNKNOWN" as GoogleAuthStage };
  const observedStartup: AcquisitionControlStoreStartupObserver | undefined = startup ? {
    controlAuthorityValidated: () => startup.controlAuthorityValidated(),
    googleAuthStage: (stage) => { currentGoogleAuth.stage = stage; startup.googleAuthStage(stage); },
    googleAuthEvidence: (key) => startup.googleAuthEvidence(key),
    gcpStsFailure: (reason) => startup.gcpStsFailure?.(reason),
    googleAuthStarting: () => startup.googleAuthStarting(),
    googleAuthInitialized: () => startup.googleAuthInitialized(),
    controlStoreStarting: () => startup.controlStoreStarting(),
    controlStoreInitialized: () => startup.controlStoreInitialized(),
  } : undefined;
  observedStartup?.controlAuthorityValidated();
  await validateGoogleCredentialPolicy(environment, loadCredentialConfiguration, observedStartup);
  observedStartup?.googleAuthStarting();
  const resolvedAuth = auth ?? new GoogleAuth({ scopes: [STORAGE_SCOPE],
    clientOptions: observedStartup ? { transporter: createGoogleAuthTelemetryTransporter(observedStartup) } : undefined }) as GoogleAuthFactory;
  const token = createAdcAccessTokenSupplier(resolvedAuth, (error) => {
    if (currentGoogleAuth.stage === "GCP_STS_EXCHANGE") observedStartup?.gcpStsFailure?.(classifyGcpStsFailure(error));
  });
  await token.getAccessToken();
  if (currentGoogleAuth.stage === "GCP_STS_EXCHANGE") observedStartup?.googleAuthEvidence("gcpStsExchangeSucceeded");
  observedStartup?.googleAuthStage("READY");
  observedStartup?.googleAuthInitialized();
  observedStartup?.controlStoreStarting();
  const store = new GcsAcquisitionControlObjectStore(configuration, token, fetchImpl);
  observedStartup?.controlStoreInitialized();
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
