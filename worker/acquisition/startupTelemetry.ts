export const STARTUP_STAGES = [
  "CONTAINER_BOOTSTRAP", "ENTRY_MODULE_LOAD",
  "RUNTIME_RESOLUTION", "CONTROL_STORE_CONFIG", "GOOGLE_AUTH_INIT", "CONTROL_STORE_INIT",
  "TELEMETRY_PROXY_INIT", "HTTP_BIND", "READY", "UNKNOWN",
] as const;
export type StartupStage = typeof STARTUP_STAGES[number];

export const STARTUP_FAILURE_FAMILIES = [
  "ENTRY_MODULE_LOAD_FAILURE",
  "RUNTIME_DEPENDENCY_FAILURE", "INVALID_CONTROL_AUTHORITY", "GOOGLE_AUTH_FAILURE",
  "CONTROL_STORE_FAILURE", "TELEMETRY_PROXY_FAILURE", "HTTP_BIND_FAILURE", "UNKNOWN_STARTUP_FAILURE",
] as const;
export type StartupFailureFamily = typeof STARTUP_FAILURE_FAMILIES[number];
export type StartupEvidence = "YES" | "NO" | "UNKNOWN";
export const OUTER_CONTINUATION_EVIDENCE_KEYS = [
  "outerGetClientStarted", "outerClientResolved", "outerGetAccessTokenInvoked", "outerContinuationEntered",
] as const;
export type OuterContinuationEvidenceKey = typeof OUTER_CONTINUATION_EVIDENCE_KEYS[number];
export type OuterCorrelationBoundary = "INNER_PRODUCER" | "OUTER_CONTINUATION";
export const OUTER_ACCESS_TOKEN_PROGRESS = [
  "UNKNOWN", "OUTER_TOKEN_RESULT_RECEIVED", "TOKEN_PROPERTY_READ", "ACCEPTANCE_OBSERVER", "TOKEN_RETURN",
] as const;
export type OuterAccessTokenProgress = typeof OUTER_ACCESS_TOKEN_PROGRESS[number];
export const OUTER_TOKEN_RESULT_SHAPES = ["OBJECT", "NULLISH", "OTHER", "UNKNOWN"] as const;
export type OuterTokenResultShape = typeof OUTER_TOKEN_RESULT_SHAPES[number];
export const GOOGLE_AUTH_STAGES = [
  "CREDENTIAL_FILE_LOAD", "EXTERNAL_ACCOUNT_PARSE", "IMDSV2_TOKEN", "AWS_REGION_DISCOVERY",
  "AWS_ROLE_CREDENTIAL_FETCH", "GCP_STS_EXCHANGE", "SERVICE_ACCOUNT_IMPERSONATION", "READY", "UNKNOWN",
] as const;
export type GoogleAuthStage = typeof GOOGLE_AUTH_STAGES[number];
export const GCP_STS_FAILURE_REASONS = [
  "INVALID_AUDIENCE", "SUBJECT_TOKEN_REJECTED", "STS_PERMISSION_DENIED",
  "STS_UNAVAILABLE", "STS_TIMEOUT", "UNKNOWN",
] as const;
export type GcpStsFailureReason = typeof GCP_STS_FAILURE_REASONS[number];
export const SIGV4_TIMESTAMP_FRESHNESS = ["FRESH", "STALE", "FUTURE", "UNKNOWN"] as const;
export type Sigv4TimestampFreshness = typeof SIGV4_TIMESTAMP_FRESHNESS[number];
export const SIGV4_EVIDENCE_KEYS = [
  "sigv4SessionTokenPresent", "sigv4ExpectedRegion", "sigv4ExpectedHost",
  "sigv4AuthorizationPresent", "sigv4AmzDatePresent", "sigv4SecurityTokenHeaderPresent",
  "sigv4SecurityTokenSigned", "sigv4TargetResourcePresent", "sigv4TargetResourceMatchesAudience",
  "sigv4TargetResourceSigned", "sigv4GetCallerIdentityRequestValid", "sigv4SubjectTokenRoundTripValid",
] as const;
export type Sigv4EvidenceKey = typeof SIGV4_EVIDENCE_KEYS[number];
export type Sigv4StructuralEvidence = Readonly<Record<Sigv4EvidenceKey, StartupEvidence> & {
  sigv4TimestampFreshness: Sigv4TimestampFreshness;
}>;
export const GOOGLE_AUTH_EVIDENCE_KEYS = [
  "imdsv2TokenAcquired", "awsRegionResolved", "awsRoleCredentialsAcquired",
  "gcpStsExchangeSucceeded", "serviceAccountImpersonationSucceeded",
  "impersonationHttpResponse", "impersonationResponseSchema", "impersonatedTokenPresent",
  "impersonatedExpiryValid", "credentialCacheAssigned", "getAccessTokenReturned", "accessTokenAccepted",
] as const;
export type GoogleAuthEvidenceKey = typeof GOOGLE_AUTH_EVIDENCE_KEYS[number];
export const AWS_SESSION_TOKEN_BOUNDARY_KEYS = [
  "imdsv2RoleTokenPresent", "signerInputTokenPresent",
] as const;
export type AwsSessionTokenBoundaryKey = typeof AWS_SESSION_TOKEN_BOUNDARY_KEYS[number];
export const IMDSV2_ROLE_CREDENTIAL_PAYLOAD_SHAPES = [
  "PLAIN_OBJECT", "JSON_STRING", "OTHER", "UNKNOWN",
] as const;
export type Imdsv2RoleCredentialPayloadShape = typeof IMDSV2_ROLE_CREDENTIAL_PAYLOAD_SHAPES[number];

export type AcquisitionWorkerStartupEvent = Readonly<{
  event: "acquisition-worker-startup";
  startupStage: StartupStage;
  startupFailureFamily: StartupFailureFamily | null;
  googleAuthStage: GoogleAuthStage;
  gcpStsFailureReason: GcpStsFailureReason;
  imdsv2RoleCredentialPayloadShape: Imdsv2RoleCredentialPayloadShape;
  outerAccessTokenProgress: OuterAccessTokenProgress;
  outerTokenResultShape: OuterTokenResultShape;
  outerTelemetrySameExecution: StartupEvidence;
  outerGetClientStarted: StartupEvidence;
  outerClientResolved: StartupEvidence;
  outerGetAccessTokenInvoked: StartupEvidence;
  outerContinuationEntered: StartupEvidence;
  runtimeDependenciesResolved: StartupEvidence;
  controlAuthorityValidated: StartupEvidence;
  googleAuthInitialized: StartupEvidence;
  controlStoreInitialized: StartupEvidence;
  telemetryProxyInitialized: StartupEvidence;
  httpListenerBound: StartupEvidence;
  imdsv2TokenAcquired: StartupEvidence;
  awsRegionResolved: StartupEvidence;
  awsRoleCredentialsAcquired: StartupEvidence;
  gcpStsExchangeSucceeded: StartupEvidence;
  serviceAccountImpersonationSucceeded: StartupEvidence;
  impersonationHttpResponse: StartupEvidence;
  impersonationResponseSchema: StartupEvidence;
  impersonatedTokenPresent: StartupEvidence;
  impersonatedExpiryValid: StartupEvidence;
  credentialCacheAssigned: StartupEvidence;
  getAccessTokenReturned: StartupEvidence;
  accessTokenAccepted: StartupEvidence;
  imdsv2RoleTokenPresent: StartupEvidence;
  signerInputTokenPresent: StartupEvidence;
  sigv4SessionTokenPresent: StartupEvidence;
  sigv4ExpectedRegion: StartupEvidence;
  sigv4ExpectedHost: StartupEvidence;
  sigv4AuthorizationPresent: StartupEvidence;
  sigv4AmzDatePresent: StartupEvidence;
  sigv4SecurityTokenHeaderPresent: StartupEvidence;
  sigv4SecurityTokenSigned: StartupEvidence;
  sigv4TargetResourcePresent: StartupEvidence;
  sigv4TargetResourceMatchesAudience: StartupEvidence;
  sigv4TargetResourceSigned: StartupEvidence;
  sigv4GetCallerIdentityRequestValid: StartupEvidence;
  sigv4TimestampFreshness: Sigv4TimestampFreshness;
  sigv4SubjectTokenRoundTripValid: StartupEvidence;
}>;

const evidenceKeys = [
  "runtimeDependenciesResolved", "controlAuthorityValidated", "googleAuthInitialized",
  "controlStoreInitialized", "telemetryProxyInitialized", "httpListenerBound", ...GOOGLE_AUTH_EVIDENCE_KEYS,
  ...AWS_SESSION_TOKEN_BOUNDARY_KEYS, ...SIGV4_EVIDENCE_KEYS, ...OUTER_CONTINUATION_EVIDENCE_KEYS,
] as const;
type EvidenceKey = typeof evidenceKeys[number];
const evidenceValues = new Set<StartupEvidence>(["YES", "NO", "UNKNOWN"]);
const stages = new Set<StartupStage>(STARTUP_STAGES);
const families = new Set<StartupFailureFamily>(STARTUP_FAILURE_FAMILIES);
const googleAuthStages = new Set<GoogleAuthStage>(GOOGLE_AUTH_STAGES);
const gcpStsFailureReasons = new Set<GcpStsFailureReason>(GCP_STS_FAILURE_REASONS);
const imdsv2RoleCredentialPayloadShapes = new Set<Imdsv2RoleCredentialPayloadShape>(
  IMDSV2_ROLE_CREDENTIAL_PAYLOAD_SHAPES,
);
const outerAccessTokenProgressValues = new Set<OuterAccessTokenProgress>(OUTER_ACCESS_TOKEN_PROGRESS);
const outerTokenResultShapeValues = new Set<OuterTokenResultShape>(OUTER_TOKEN_RESULT_SHAPES);
const sigv4TimestampFreshness = new Set<Sigv4TimestampFreshness>(SIGV4_TIMESTAMP_FRESHNESS);
const exactKeys = ["event", "startupStage", "startupFailureFamily", "googleAuthStage", "gcpStsFailureReason",
  "imdsv2RoleCredentialPayloadShape", "outerAccessTokenProgress", "outerTokenResultShape",
  "outerTelemetrySameExecution",
  "sigv4TimestampFreshness", ...evidenceKeys].sort();

const familyForStage = (stage: StartupStage): StartupFailureFamily => ({
  CONTAINER_BOOTSTRAP: "ENTRY_MODULE_LOAD_FAILURE",
  ENTRY_MODULE_LOAD: "ENTRY_MODULE_LOAD_FAILURE",
  RUNTIME_RESOLUTION: "RUNTIME_DEPENDENCY_FAILURE",
  CONTROL_STORE_CONFIG: "INVALID_CONTROL_AUTHORITY",
  GOOGLE_AUTH_INIT: "GOOGLE_AUTH_FAILURE",
  CONTROL_STORE_INIT: "CONTROL_STORE_FAILURE",
  TELEMETRY_PROXY_INIT: "TELEMETRY_PROXY_FAILURE",
  HTTP_BIND: "HTTP_BIND_FAILURE",
  READY: "UNKNOWN_STARTUP_FAILURE",
  UNKNOWN: "UNKNOWN_STARTUP_FAILURE",
})[stage] as StartupFailureFamily;

export class AcquisitionWorkerStartupTelemetry {
  private stage: StartupStage = "UNKNOWN";
  private googleAuthStage: GoogleAuthStage = "UNKNOWN";
  private gcpStsFailureReason: GcpStsFailureReason = "UNKNOWN";
  private imdsv2RoleCredentialPayloadShape: Imdsv2RoleCredentialPayloadShape = "UNKNOWN";
  private outerAccessTokenProgress: OuterAccessTokenProgress = "UNKNOWN";
  private outerTokenResultShape: OuterTokenResultShape = "UNKNOWN";
  private readonly outerCorrelation: Partial<Record<OuterCorrelationBoundary, object>> = {};
  private outerTelemetrySameExecution: StartupEvidence = "UNKNOWN";
  private readonly evidence: Record<EvidenceKey, StartupEvidence> = {
    runtimeDependenciesResolved: "UNKNOWN", controlAuthorityValidated: "UNKNOWN",
    googleAuthInitialized: "UNKNOWN", controlStoreInitialized: "UNKNOWN",
    telemetryProxyInitialized: "UNKNOWN", httpListenerBound: "UNKNOWN",
    imdsv2TokenAcquired: "UNKNOWN", awsRegionResolved: "UNKNOWN", awsRoleCredentialsAcquired: "UNKNOWN",
    gcpStsExchangeSucceeded: "UNKNOWN", serviceAccountImpersonationSucceeded: "UNKNOWN",
    impersonationHttpResponse: "UNKNOWN", impersonationResponseSchema: "UNKNOWN",
    impersonatedTokenPresent: "UNKNOWN", impersonatedExpiryValid: "UNKNOWN",
    credentialCacheAssigned: "UNKNOWN", getAccessTokenReturned: "UNKNOWN", accessTokenAccepted: "UNKNOWN",
    imdsv2RoleTokenPresent: "UNKNOWN", signerInputTokenPresent: "UNKNOWN",
    sigv4SessionTokenPresent: "UNKNOWN", sigv4ExpectedRegion: "UNKNOWN", sigv4ExpectedHost: "UNKNOWN",
    sigv4AuthorizationPresent: "UNKNOWN", sigv4AmzDatePresent: "UNKNOWN",
    sigv4SecurityTokenHeaderPresent: "UNKNOWN", sigv4SecurityTokenSigned: "UNKNOWN",
    sigv4TargetResourcePresent: "UNKNOWN", sigv4TargetResourceMatchesAudience: "UNKNOWN",
    sigv4TargetResourceSigned: "UNKNOWN", sigv4GetCallerIdentityRequestValid: "UNKNOWN",
    sigv4SubjectTokenRoundTripValid: "UNKNOWN",
    outerGetClientStarted: "UNKNOWN", outerClientResolved: "UNKNOWN",
    outerGetAccessTokenInvoked: "UNKNOWN", outerContinuationEntered: "UNKNOWN",
  };
  private sigv4TimestampFreshness: Sigv4TimestampFreshness = "UNKNOWN";

  enter(stage: Exclude<StartupStage, "READY">): void { this.stage = stage; }
  prove(key: EvidenceKey): void { this.evidence[key] = "YES"; }
  enterGoogleAuth(stage: GoogleAuthStage): void { this.googleAuthStage = stage; }
  proveGoogleAuth(key: GoogleAuthEvidenceKey): void { this.evidence[key] = "YES"; }
  observeGoogleAuth(key: GoogleAuthEvidenceKey, value: StartupEvidence): void { this.evidence[key] = value; }
  observeSessionTokenBoundary(key: AwsSessionTokenBoundaryKey, value: StartupEvidence): void {
    this.evidence[key] = value;
  }
  observeImdsv2PayloadShape(value: Imdsv2RoleCredentialPayloadShape): void {
    this.imdsv2RoleCredentialPayloadShape = value;
  }
  observeOuterAccessToken(progress: OuterAccessTokenProgress, shape?: OuterTokenResultShape): void {
    this.outerAccessTokenProgress = progress;
    if (shape) this.outerTokenResultShape = shape;
  }
  observeOuterContinuation(key: OuterContinuationEvidenceKey): void { this.evidence[key] = "YES"; }
  observeOuterCorrelation(boundary: OuterCorrelationBoundary, marker: object): void {
    this.outerCorrelation[boundary] = marker;
    const inner = this.outerCorrelation.INNER_PRODUCER;
    const outer = this.outerCorrelation.OUTER_CONTINUATION;
    this.outerTelemetrySameExecution = inner && outer ? (inner === outer ? "YES" : "NO") : "UNKNOWN";
  }
  failGcpSts(reason: GcpStsFailureReason): void { this.gcpStsFailureReason = reason; }
  observeSigv4(value: Sigv4StructuralEvidence): void {
    for (const key of SIGV4_EVIDENCE_KEYS) this.evidence[key] = value[key];
    this.sigv4TimestampFreshness = value.sigv4TimestampFreshness;
  }

  failure(): AcquisitionWorkerStartupEvent {
    const failedKey: Partial<Record<StartupStage, EvidenceKey>> = {
      RUNTIME_RESOLUTION: "runtimeDependenciesResolved", CONTROL_STORE_CONFIG: "controlAuthorityValidated",
      GOOGLE_AUTH_INIT: "googleAuthInitialized", CONTROL_STORE_INIT: "controlStoreInitialized",
      TELEMETRY_PROXY_INIT: "telemetryProxyInitialized", HTTP_BIND: "httpListenerBound",
    };
    const key = failedKey[this.stage];
    if (key && this.evidence[key] !== "YES") this.evidence[key] = "NO";
    if (this.stage === "GOOGLE_AUTH_INIT") {
      const googleFailureKey: Partial<Record<GoogleAuthStage, GoogleAuthEvidenceKey>> = {
        IMDSV2_TOKEN: "imdsv2TokenAcquired", AWS_REGION_DISCOVERY: "awsRegionResolved",
        AWS_ROLE_CREDENTIAL_FETCH: "awsRoleCredentialsAcquired", GCP_STS_EXCHANGE: "gcpStsExchangeSucceeded",
        SERVICE_ACCOUNT_IMPERSONATION: "serviceAccountImpersonationSucceeded",
      };
      const googleKey = googleFailureKey[this.googleAuthStage];
      if (googleKey && this.evidence[googleKey] !== "YES") this.evidence[googleKey] = "NO";
    }
    return Object.freeze({ event: "acquisition-worker-startup", startupStage: this.stage, googleAuthStage: this.googleAuthStage,
      gcpStsFailureReason: this.gcpStsFailureReason,
      imdsv2RoleCredentialPayloadShape: this.imdsv2RoleCredentialPayloadShape,
      outerAccessTokenProgress: this.outerAccessTokenProgress, outerTokenResultShape: this.outerTokenResultShape,
      outerTelemetrySameExecution: this.outerTelemetrySameExecution,
      sigv4TimestampFreshness: this.sigv4TimestampFreshness,
      startupFailureFamily: familyForStage(this.stage), ...this.evidence });
  }

  ready(): AcquisitionWorkerStartupEvent {
    this.stage = "READY";
    this.googleAuthStage = "READY";
    return Object.freeze({ event: "acquisition-worker-startup", startupStage: "READY", googleAuthStage: "READY",
      gcpStsFailureReason: "UNKNOWN",
      imdsv2RoleCredentialPayloadShape: this.imdsv2RoleCredentialPayloadShape,
      outerAccessTokenProgress: this.outerAccessTokenProgress, outerTokenResultShape: this.outerTokenResultShape,
      outerTelemetrySameExecution: this.outerTelemetrySameExecution,
      sigv4TimestampFreshness: this.sigv4TimestampFreshness,
      startupFailureFamily: null, ...this.evidence });
  }
}

export type AcquisitionWorkerStartupTelemetrySink = Pick<
  AcquisitionWorkerStartupTelemetry,
  "enter" | "prove" | "enterGoogleAuth" | "proveGoogleAuth" | "observeGoogleAuth" | "observeSessionTokenBoundary"
  | "observeImdsv2PayloadShape" | "observeOuterAccessToken" | "observeOuterContinuation"
  | "observeOuterCorrelation" | "failGcpSts" | "observeSigv4" | "failure" | "ready"
>;

export const validateAcquisitionWorkerStartupEvent = (input: unknown): AcquisitionWorkerStartupEvent => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-startup-telemetry");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join("\0") !== exactKeys.join("\0")
    || value.event !== "acquisition-worker-startup" || !stages.has(value.startupStage as StartupStage)
    || !googleAuthStages.has(value.googleAuthStage as GoogleAuthStage)
    || !gcpStsFailureReasons.has(value.gcpStsFailureReason as GcpStsFailureReason)
    || !imdsv2RoleCredentialPayloadShapes.has(
      value.imdsv2RoleCredentialPayloadShape as Imdsv2RoleCredentialPayloadShape,
    )
    || !outerAccessTokenProgressValues.has(value.outerAccessTokenProgress as OuterAccessTokenProgress)
    || !outerTokenResultShapeValues.has(value.outerTokenResultShape as OuterTokenResultShape)
    || !evidenceValues.has(value.outerTelemetrySameExecution as StartupEvidence)
    || !sigv4TimestampFreshness.has(value.sigv4TimestampFreshness as Sigv4TimestampFreshness)
    || (value.startupFailureFamily !== null && !families.has(value.startupFailureFamily as StartupFailureFamily))
    || evidenceKeys.some((key) => !evidenceValues.has(value[key] as StartupEvidence))
    || (value.startupStage === "READY") !== (value.startupFailureFamily === null)) {
    throw new TypeError("invalid-startup-telemetry");
  }
  return Object.freeze(value) as AcquisitionWorkerStartupEvent;
};
