import {
  ACQUISITION_CONTROL_PREFIX,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "./persistentIdempotency";
import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import { StsCredentials } from "google-auth-library/build/src/auth/stscredentials";
import { Gaxios, type GaxiosOptions } from "gaxios";
import type { AwsSessionTokenBoundaryKey, GcpStsFailureReason, GoogleAuthEvidenceKey, GoogleAuthStage,
  Imdsv2RoleCredentialPayloadShape, OuterAccessTokenProgress, OuterContinuationEvidenceKey,
  OuterCorrelationBoundary, OuterTokenResultShape, ProjectIdEvidenceKey, ProjectIdFailureReason,
  Sigv4StructuralEvidence,
  StartupEvidence } from "../../../worker/acquisition/startupTelemetry";

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
  googleAuthBoundaryEvidence?(key: GoogleAuthEvidenceKey, value: StartupEvidence): void;
  sessionTokenBoundaryEvidence?(key: AwsSessionTokenBoundaryKey, value: StartupEvidence): void;
  imdsv2PayloadShape?(value: Imdsv2RoleCredentialPayloadShape): void;
  outerAccessTokenBoundary?(progress: OuterAccessTokenProgress, shape?: OuterTokenResultShape): void;
  outerContinuationEvidence?(key: OuterContinuationEvidenceKey): void;
  outerCorrelationEvidence?(boundary: OuterCorrelationBoundary, marker: object): void;
  gcpStsFailure?(reason: GcpStsFailureReason): void;
  projectIdEvidence?(key: ProjectIdEvidenceKey, value: StartupEvidence): void;
  projectIdFailure?(reason: ProjectIdFailureReason): void;
  sigv4Evidence?(evidence: Sigv4StructuralEvidence): void;
  googleAuthStarting(): void;
  googleAuthInitialized(): void;
  controlStoreStarting(): void;
  controlStoreInitialized(): void;
}>;

const EXPECTED_AWS_REGION = "ap-northeast-1";
const EXPECTED_AWS_STS_HOST = "sts.ap-northeast-1.amazonaws.com";
export const SIGV4_FRESHNESS_TOLERANCE_MS = 5 * 60 * 1000;
const unknownSigv4Evidence = (): Sigv4StructuralEvidence => ({
  sigv4SessionTokenPresent: "UNKNOWN", sigv4ExpectedRegion: "UNKNOWN", sigv4ExpectedHost: "UNKNOWN",
  sigv4AuthorizationPresent: "UNKNOWN", sigv4AmzDatePresent: "UNKNOWN",
  sigv4SecurityTokenHeaderPresent: "UNKNOWN", sigv4SecurityTokenSigned: "UNKNOWN",
  sigv4TargetResourcePresent: "UNKNOWN", sigv4TargetResourceMatchesAudience: "UNKNOWN",
  sigv4TargetResourceSigned: "UNKNOWN", sigv4GetCallerIdentityRequestValid: "UNKNOWN",
  sigv4TimestampFreshness: "UNKNOWN", sigv4SubjectTokenRoundTripValid: "UNKNOWN",
});

const formValue = (data: unknown, key: string): string | undefined => {
  if (data instanceof URLSearchParams) return data.get(key) ?? undefined;
  if (typeof data === "string") return new URLSearchParams(data).get(key) ?? undefined;
  return undefined;
};

const parseAmzDate = (value: string | undefined): number | undefined => {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  const timestamp = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!, parts[5]!);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

export const projectSigv4SubjectToken = (
  options: Pick<GaxiosOptions, "data">,
  now = Date.now(),
): Sigv4StructuralEvidence => {
  const subjectToken = formValue(options.data, "subject_token");
  if (!subjectToken) return Object.freeze(unknownSigv4Evidence());
  const result = unknownSigv4Evidence();
  let parsed: unknown;
  try { parsed = JSON.parse(decodeURIComponent(subjectToken)); } catch {
    return Object.freeze({ ...result, sigv4SubjectTokenRoundTripValid: "NO" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Object.freeze({ ...result, sigv4SubjectTokenRoundTripValid: "NO" });
  }
  const token = parsed as Record<string, unknown>;
  const exactShape = Object.keys(token).sort().join("\0") === ["headers", "method", "url"].sort().join("\0");
  const headersInput = Array.isArray(token.headers) ? token.headers : [];
  const validHeaders = headersInput.every((header) => header && typeof header === "object" && !Array.isArray(header)
    && Object.keys(header).sort().join("\0") === "key\0value"
    && typeof (header as Record<string, unknown>).key === "string"
    && typeof (header as Record<string, unknown>).value === "string");
  if (!exactShape || typeof token.url !== "string" || typeof token.method !== "string" || !validHeaders) {
    return Object.freeze({ ...result, sigv4SubjectTokenRoundTripValid: "NO" });
  }
  let url: URL;
  try { url = new URL(token.url); } catch {
    return Object.freeze({ ...result, sigv4SubjectTokenRoundTripValid: "NO" });
  }
  const headers = new Map(headersInput.map((header) => {
    const value = header as { key: string; value: string };
    return [value.key.toLowerCase(), value.value] as const;
  }));
  const authorization = headers.get("authorization");
  const signedHeaders = new Set(((authorization ?? "").match(/SignedHeaders=([^,\s]+)/)?.[1] ?? "").split(";").filter(Boolean));
  const credential = (authorization ?? "").match(/Credential=[^/\s,]+\/\d{8}\/([^/\s,]+)\/([^/\s,]+)\/aws4_request/);
  const amzDate = headers.get("x-amz-date");
  const timestamp = parseAmzDate(amzDate);
  const freshness = timestamp === undefined ? "UNKNOWN"
    : timestamp < now - SIGV4_FRESHNESS_TOLERANCE_MS ? "STALE"
      : timestamp > now + SIGV4_FRESHNESS_TOLERANCE_MS ? "FUTURE" : "FRESH";
  const securityToken = headers.get("x-amz-security-token");
  const targetResource = headers.get("x-goog-cloud-target-resource");
  const expectedHost = url.hostname === EXPECTED_AWS_STS_HOST && headers.get("host") === EXPECTED_AWS_STS_HOST;
  const expectedRegion = credential?.[1] === EXPECTED_AWS_REGION;
  const expectedService = credential?.[2] === "sts";
  const getCallerIdentity = token.method === "POST" && expectedHost && expectedRegion && expectedService
    && url.searchParams.get("Action") === "GetCallerIdentity" && url.searchParams.get("Version") === "2011-06-15";
  return Object.freeze({
    sigv4SessionTokenPresent: securityToken ? "YES" : "NO",
    sigv4ExpectedRegion: expectedRegion ? "YES" : "NO",
    sigv4ExpectedHost: expectedHost ? "YES" : "NO",
    sigv4AuthorizationPresent: authorization ? "YES" : "NO",
    sigv4AmzDatePresent: amzDate ? "YES" : "NO",
    sigv4SecurityTokenHeaderPresent: securityToken ? "YES" : "NO",
    sigv4SecurityTokenSigned: signedHeaders.has("x-amz-security-token") ? "YES" : "NO",
    sigv4TargetResourcePresent: targetResource ? "YES" : "NO",
    sigv4TargetResourceMatchesAudience: targetResource && targetResource === formValue(options.data, "audience") ? "YES" : "NO",
    sigv4TargetResourceSigned: signedHeaders.has("x-goog-cloud-target-resource") ? "YES" : "NO",
    sigv4GetCallerIdentityRequestValid: getCallerIdentity ? "YES" : "NO",
    sigv4TimestampFreshness: freshness,
    sigv4SubjectTokenRoundTripValid: "YES",
  });
};

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

const isCloudResourceManagerProjectLookup = (input: string): boolean => {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  return url.hostname === "cloudresourcemanager.googleapis.com"
    && /^\/v1\/projects\/[^/]+$/.test(url.pathname) && url.search === "" && url.hash === "";
};

export const classifyProjectIdFailure = (error: unknown): ProjectIdFailureReason => {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const value = error as Readonly<{ code?: unknown; response?: unknown }>;
  const code = fixedString(value.code);
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "ECONNABORTED") return "TIMEOUT";
  if (!value.response || typeof value.response !== "object") return "UNKNOWN";
  const response = value.response as Readonly<{ status?: unknown; data?: unknown }>;
  const data = isPlainObject(response.data) && isPlainObject(response.data.error) ? response.data.error : undefined;
  const statusAuthority = fixedString(data?.status);
  if (response.status === 401 || response.status === 403 || statusAuthority === "PERMISSION_DENIED") {
    return "PERMISSION_DENIED";
  }
  if ((typeof response.status === "number" && response.status >= 500 && response.status <= 599)
    || statusAuthority === "UNAVAILABLE") return "UNAVAILABLE";
  return "UNKNOWN";
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isImdsRoleCredentialDocumentRequest = (input: string): boolean => {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  return url.hostname === "169.254.169.254"
    && /^\/latest\/meta-data\/iam\/security-credentials\/[^/]+$/.test(url.pathname)
    && url.search === "" && url.hash === "";
};

const normalizeImdsRoleCredentialResponseData = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPlainObject(parsed)
      || !Object.hasOwn(parsed, "AccessKeyId") || !Object.hasOwn(parsed, "SecretAccessKey")
      || typeof parsed.AccessKeyId !== "string" || typeof parsed.SecretAccessKey !== "string") return value;
    return parsed;
  } catch {
    return value;
  }
};

export const createGoogleAuthTelemetryTransporter = (
  startup: AcquisitionControlStoreStartupObserver,
  transporter: Gaxios = new Gaxios(),
): Gaxios => {
  const request = transporter.request.bind(transporter);
  let gcpStsSucceeded = false;
  transporter.request = (async (options: GaxiosOptions) => {
    const requestUrl = String(options.url ?? "");
    const boundary = classifyGoogleAuthRequest(requestUrl);
    const projectLookup = isCloudResourceManagerProjectLookup(requestUrl);
    if (projectLookup) startup.projectIdEvidence?.("cloudResourceManagerRequestStarted", "YES");
    if (boundary?.stage === "GCP_STS_EXCHANGE") startup.sigv4Evidence?.(projectSigv4SubjectToken(options));
    if (boundary?.stage === "SERVICE_ACCOUNT_IMPERSONATION" && !gcpStsSucceeded) {
      startup.googleAuthEvidence("gcpStsExchangeSucceeded");
      gcpStsSucceeded = true;
    }
    if (boundary) startup.googleAuthStage(boundary.stage);
    let response;
    try {
      response = await request(options);
    } catch (error) {
      if (projectLookup) {
        const observed = Boolean(error && typeof error === "object" && Reflect.get(error, "response"));
        startup.projectIdEvidence?.("cloudResourceManagerResponseObserved", observed ? "YES" : "NO");
        if (observed) startup.projectIdEvidence?.("cloudResourceManagerProjectIdPresent", "NO");
        startup.projectIdFailure?.(classifyProjectIdFailure(error));
      }
      throw error;
    }
    if (projectLookup) {
      startup.projectIdEvidence?.("cloudResourceManagerResponseObserved", "YES");
      const data = response.data;
      const present = isPlainObject(data) && typeof data.projectId === "string" && data.projectId.trim().length > 0;
      startup.projectIdEvidence?.("cloudResourceManagerProjectIdPresent", present ? "YES" : "NO");
      if (!present) startup.projectIdFailure?.("INVALID_RESPONSE");
    }
    if (boundary?.stage === "SERVICE_ACCOUNT_IMPERSONATION") {
      startup.googleAuthBoundaryEvidence?.("impersonationHttpResponse", "YES");
      const data = response.data;
      const responseObject = isPlainObject(data);
      const hasMinimumShape = responseObject
        && Object.hasOwn(data, "accessToken") && Object.hasOwn(data, "expireTime");
      startup.googleAuthBoundaryEvidence?.("impersonationResponseSchema", hasMinimumShape ? "YES" : "NO");
      startup.googleAuthBoundaryEvidence?.("impersonatedTokenPresent", responseObject
        ? (typeof data.accessToken === "string" && data.accessToken.length > 0 ? "YES" : "NO") : "UNKNOWN");
      const expiry = responseObject && typeof data.expireTime === "string" ? Date.parse(data.expireTime) : Number.NaN;
      startup.googleAuthBoundaryEvidence?.("impersonatedExpiryValid", responseObject
        ? (Number.isFinite(expiry) && expiry > Date.now() ? "YES" : "NO") : "UNKNOWN");
    }
    if (boundary?.success.includes("awsRoleCredentialsAcquired")) {
      const classification = classifyImdsv2RoleCredentialPayload(response.data);
      startup.imdsv2PayloadShape?.(classification.shape);
      startup.sessionTokenBoundaryEvidence?.("imdsv2RoleTokenPresent", classification.tokenPresent);
      if (isImdsRoleCredentialDocumentRequest(String(options.url ?? ""))) {
        response.data = normalizeImdsRoleCredentialResponseData(response.data);
      }
    }
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

type Imdsv2RoleCredentialPayloadClassification = Readonly<{
  shape: Imdsv2RoleCredentialPayloadShape;
  tokenPresent: StartupEvidence;
}>;

const classifyCredentialObject = (
  value: Record<string, unknown>,
  shape: "PLAIN_OBJECT" | "JSON_STRING",
): Imdsv2RoleCredentialPayloadClassification => {
  const stringValue = (key: string): string | undefined => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value : undefined;
  };
  const accessKeyId = stringValue("AccessKeyId");
  const secretAccessKey = stringValue("SecretAccessKey");
  if (!accessKeyId || !secretAccessKey) {
    return Object.freeze({ shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
  }
  const token = stringValue("Token");
  return Object.freeze({
    shape,
    tokenPresent: token && token.length > 0 ? "YES" : "NO",
  });
};

export const classifyImdsv2RoleCredentialPayload = (
  value: unknown,
): Imdsv2RoleCredentialPayloadClassification => {
  try {
    if (isPlainObject(value)) return classifyCredentialObject(value, "PLAIN_OBJECT");
    if (typeof value === "string") {
      const parsed: unknown = JSON.parse(value);
      return isPlainObject(parsed)
        ? classifyCredentialObject(parsed, "JSON_STRING")
        : Object.freeze({ shape: "OTHER", tokenPresent: "UNKNOWN" });
    }
    if (value === null || value === undefined) {
      return Object.freeze({ shape: "UNKNOWN", tokenPresent: "UNKNOWN" });
    }
    return Object.freeze({ shape: "OTHER", tokenPresent: "UNKNOWN" });
  } catch {
    return Object.freeze({
      shape: typeof value === "string" ? "OTHER" : "UNKNOWN",
      tokenPresent: "UNKNOWN",
    });
  }
};

const bridgedStsCredentials = new WeakSet<object>();
const bridgedAwsCredentialSuppliers = new WeakSet<object>();
const observedAccessTokenClients = new WeakSet<object>();
const observedProjectIdClients = new WeakSet<object>();

export const installStsTransporterTelemetryBridge = (
  client: unknown,
  startup: AcquisitionControlStoreStartupObserver,
): boolean => {
  if (!client || typeof client !== "object") return false;
  if (!observedProjectIdClients.has(client)) {
    const getProjectId = Reflect.get(client, "getProjectId") as unknown;
    if (typeof getProjectId === "function") {
      const delegated = getProjectId.bind(client) as () => Promise<unknown>;
      Reflect.set(client, "getProjectId", async () => {
        startup.projectIdEvidence?.("projectIdResolutionStarted", "YES");
        try {
          const result = await delegated();
          const valid = typeof result === "string" && result.trim().length > 0;
          startup.projectIdEvidence?.("projectIdResolutionCompleted", valid ? "YES" : "NO");
          if (!valid) startup.projectIdFailure?.("INVALID_RESPONSE");
          return result;
        } catch (error) {
          startup.projectIdEvidence?.("projectIdResolutionCompleted", "NO");
          throw error;
        }
      });
      observedProjectIdClients.add(client);
    }
  }
  const stsCredential = Reflect.get(client, "stsCredential") as unknown;
  if (!(stsCredential instanceof StsCredentials)
    || typeof Reflect.get(stsCredential, "exchangeToken") !== "function") return false;
  if (bridgedStsCredentials.has(stsCredential)) return true;
  const transporter = Reflect.get(stsCredential, "transporter") as unknown;
  if (!(transporter instanceof Gaxios)) return false;
  createGoogleAuthTelemetryTransporter(startup, transporter);
  if (!observedAccessTokenClients.has(client)) {
    const getAccessToken = Reflect.get(client, "getAccessToken") as unknown;
    if (typeof getAccessToken === "function") {
      const delegated = getAccessToken.bind(client) as () => Promise<unknown>;
      Reflect.set(client, "getAccessToken", async () => {
        try {
          const result = await delegated();
          startup.googleAuthBoundaryEvidence?.("getAccessTokenReturned", "YES");
          const token = result && typeof result === "object" ? Reflect.get(result, "token") : undefined;
          const cache = Reflect.get(client, "cachedAccessToken") as unknown;
          const cachedToken = cache && typeof cache === "object" ? Reflect.get(cache, "access_token") : undefined;
          startup.googleAuthBoundaryEvidence?.("credentialCacheAssigned",
            typeof token === "string" && token.length > 0 && cachedToken === token ? "YES" : "NO");
          return result;
        } catch (error) {
          startup.googleAuthBoundaryEvidence?.("getAccessTokenReturned", "NO");
          throw error;
        }
      });
      observedAccessTokenClients.add(client);
    }
  }
  const supplier = Reflect.get(client, "awsSecurityCredentialsSupplier") as unknown;
  if (supplier && typeof supplier === "object" && !bridgedAwsCredentialSuppliers.has(supplier)) {
    const getCredentials = Reflect.get(supplier, "getAwsSecurityCredentials") as unknown;
    if (typeof getCredentials === "function") {
      const delegated = getCredentials.bind(supplier) as (context: unknown) => Promise<unknown>;
      Reflect.set(supplier, "getAwsSecurityCredentials", async (context: unknown) => {
        const credentials = await delegated(context);
        const tokenEvidence: StartupEvidence = credentials && typeof credentials === "object" && !Array.isArray(credentials)
          ? (Boolean(Reflect.get(credentials, "token")) ? "YES" : "NO")
          : "UNKNOWN";
        startup.sessionTokenBoundaryEvidence?.("signerInputTokenPresent", tokenEvidence);
        return credentials;
      });
      bridgedAwsCredentialSuppliers.add(supplier);
    }
  }
  bridgedStsCredentials.add(stsCredential);
  return true;
};

const createObservedGoogleAuth = (startup: AcquisitionControlStoreStartupObserver): GoogleAuth => {
  const auth = new GoogleAuth({ scopes: [STORAGE_SCOPE],
    clientOptions: { transporter: createGoogleAuthTelemetryTransporter(startup) } });
  const fromJSON = auth.fromJSON.bind(auth);
  auth.fromJSON = ((json: Parameters<GoogleAuth["fromJSON"]>[0], options?: Parameters<GoogleAuth["fromJSON"]>[1]) => {
    const client = fromJSON(json, options);
    try { installStsTransporterTelemetryBridge(client, startup); } catch { /* Telemetry must not affect authentication. */ }
    return client;
  }) as GoogleAuth["fromJSON"];
  return auth;
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
  observe?: (key: GoogleAuthEvidenceKey, value: StartupEvidence) => void,
  observeOuter?: (progress: OuterAccessTokenProgress, shape?: OuterTokenResultShape) => void,
  observeContinuation?: (key: OuterContinuationEvidenceKey) => void,
  observeCorrelation?: (boundary: OuterCorrelationBoundary, marker: object) => void,
  correlationMarker: object = Object.freeze({}),
): GoogleAccessTokenSupplier => ({
  async getAccessToken(signal?: AbortSignal) {
    if (signal?.aborted) throw new AcquisitionControlAuthFailure();
    const failure = () => new AcquisitionControlAuthFailure();
    let onAbort: (() => void) | undefined;
    try {
      observeContinuation?.("outerGetClientStarted");
      const operation = auth.getClient().then((client) => {
        observeContinuation?.("outerClientResolved");
        observeContinuation?.("outerGetAccessTokenInvoked");
        return client.getAccessToken();
      });
      const response = signal
        ? await Promise.race([operation, new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(failure());
          signal.addEventListener("abort", onAbort, { once: true });
        })])
       : await operation;
      observeContinuation?.("outerContinuationEntered");
      observeCorrelation?.("OUTER_CONTINUATION", correlationMarker);
      const shape: OuterTokenResultShape = response === null || response === undefined
        ? "NULLISH" : typeof response === "object" ? "OBJECT" : "OTHER";
      observeOuter?.("OUTER_TOKEN_RESULT_RECEIVED", shape);
      const tokenType = typeof response.token;
      observeOuter?.("TOKEN_PROPERTY_READ");
      if (tokenType !== "string" || (response.token as string).length === 0) {
        observeOuter?.("ACCEPTANCE_OBSERVER");
        observe?.("accessTokenAccepted", "NO");
        throw failure();
      }
      observeOuter?.("ACCEPTANCE_OBSERVER");
      observe?.("accessTokenAccepted", "YES");
      observeOuter?.("TOKEN_RETURN");
      return response.token as string;
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
  const outerCorrelationMarker = Object.freeze({});
  const observedStartup: AcquisitionControlStoreStartupObserver | undefined = startup ? {
    controlAuthorityValidated: () => startup.controlAuthorityValidated(),
    googleAuthStage: (stage) => { currentGoogleAuth.stage = stage; startup.googleAuthStage(stage); },
    googleAuthEvidence: (key) => startup.googleAuthEvidence(key),
    googleAuthBoundaryEvidence: (key, value) => {
      if (key === "getAccessTokenReturned" || key === "credentialCacheAssigned") {
        startup.outerCorrelationEvidence?.("INNER_PRODUCER", outerCorrelationMarker);
      }
      startup.googleAuthBoundaryEvidence?.(key, value);
    },
    sessionTokenBoundaryEvidence: (key, value) => startup.sessionTokenBoundaryEvidence?.(key, value),
    imdsv2PayloadShape: (value) => startup.imdsv2PayloadShape?.(value),
    outerAccessTokenBoundary: (progress, shape) => startup.outerAccessTokenBoundary?.(progress, shape),
    outerContinuationEvidence: (key) => startup.outerContinuationEvidence?.(key),
    outerCorrelationEvidence: (boundary, marker) => startup.outerCorrelationEvidence?.(boundary, marker),
    gcpStsFailure: (reason) => startup.gcpStsFailure?.(reason),
    projectIdEvidence: (key, value) => startup.projectIdEvidence?.(key, value),
    projectIdFailure: (reason) => startup.projectIdFailure?.(reason),
    sigv4Evidence: (evidence) => startup.sigv4Evidence?.(evidence),
    googleAuthStarting: () => startup.googleAuthStarting(),
    googleAuthInitialized: () => startup.googleAuthInitialized(),
    controlStoreStarting: () => startup.controlStoreStarting(),
    controlStoreInitialized: () => startup.controlStoreInitialized(),
  } : undefined;
  observedStartup?.controlAuthorityValidated();
  await validateGoogleCredentialPolicy(environment, loadCredentialConfiguration, observedStartup);
  observedStartup?.googleAuthStarting();
  const resolvedAuth = auth ?? (observedStartup ? createObservedGoogleAuth(observedStartup)
    : new GoogleAuth({ scopes: [STORAGE_SCOPE] })) as GoogleAuthFactory;
  const token = createAdcAccessTokenSupplier(resolvedAuth, (error) => {
    if (currentGoogleAuth.stage === "GCP_STS_EXCHANGE") observedStartup?.gcpStsFailure?.(classifyGcpStsFailure(error));
  }, (key, value) => observedStartup?.googleAuthBoundaryEvidence?.(key, value),
  (progress, shape) => observedStartup?.outerAccessTokenBoundary?.(progress, shape),
  (key) => observedStartup?.outerContinuationEvidence?.(key),
  (boundary, marker) => observedStartup?.outerCorrelationEvidence?.(boundary, marker), outerCorrelationMarker);
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
