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
export const GOOGLE_AUTH_EVIDENCE_KEYS = [
  "imdsv2TokenAcquired", "awsRegionResolved", "awsRoleCredentialsAcquired",
  "gcpStsExchangeSucceeded", "serviceAccountImpersonationSucceeded",
] as const;
export type GoogleAuthEvidenceKey = typeof GOOGLE_AUTH_EVIDENCE_KEYS[number];

export type AcquisitionWorkerStartupEvent = Readonly<{
  event: "acquisition-worker-startup";
  startupStage: StartupStage;
  startupFailureFamily: StartupFailureFamily | null;
  googleAuthStage: GoogleAuthStage;
  gcpStsFailureReason: GcpStsFailureReason;
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
}>;

const evidenceKeys = [
  "runtimeDependenciesResolved", "controlAuthorityValidated", "googleAuthInitialized",
  "controlStoreInitialized", "telemetryProxyInitialized", "httpListenerBound", ...GOOGLE_AUTH_EVIDENCE_KEYS,
] as const;
type EvidenceKey = typeof evidenceKeys[number];
const evidenceValues = new Set<StartupEvidence>(["YES", "NO", "UNKNOWN"]);
const stages = new Set<StartupStage>(STARTUP_STAGES);
const families = new Set<StartupFailureFamily>(STARTUP_FAILURE_FAMILIES);
const googleAuthStages = new Set<GoogleAuthStage>(GOOGLE_AUTH_STAGES);
const gcpStsFailureReasons = new Set<GcpStsFailureReason>(GCP_STS_FAILURE_REASONS);
const exactKeys = ["event", "startupStage", "startupFailureFamily", "googleAuthStage", "gcpStsFailureReason", ...evidenceKeys].sort();

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
  private readonly evidence: Record<EvidenceKey, StartupEvidence> = {
    runtimeDependenciesResolved: "UNKNOWN", controlAuthorityValidated: "UNKNOWN",
    googleAuthInitialized: "UNKNOWN", controlStoreInitialized: "UNKNOWN",
    telemetryProxyInitialized: "UNKNOWN", httpListenerBound: "UNKNOWN",
    imdsv2TokenAcquired: "UNKNOWN", awsRegionResolved: "UNKNOWN", awsRoleCredentialsAcquired: "UNKNOWN",
    gcpStsExchangeSucceeded: "UNKNOWN", serviceAccountImpersonationSucceeded: "UNKNOWN",
  };

  enter(stage: Exclude<StartupStage, "READY">): void { this.stage = stage; }
  prove(key: EvidenceKey): void { this.evidence[key] = "YES"; }
  enterGoogleAuth(stage: GoogleAuthStage): void { this.googleAuthStage = stage; }
  proveGoogleAuth(key: GoogleAuthEvidenceKey): void { this.evidence[key] = "YES"; }
  failGcpSts(reason: GcpStsFailureReason): void { this.gcpStsFailureReason = reason; }

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
      startupFailureFamily: familyForStage(this.stage), ...this.evidence });
  }

  ready(): AcquisitionWorkerStartupEvent {
    this.stage = "READY";
    this.googleAuthStage = "READY";
    return Object.freeze({ event: "acquisition-worker-startup", startupStage: "READY", googleAuthStage: "READY",
      gcpStsFailureReason: "UNKNOWN",
      startupFailureFamily: null, ...this.evidence });
  }
}

export type AcquisitionWorkerStartupTelemetrySink = Pick<
  AcquisitionWorkerStartupTelemetry,
  "enter" | "prove" | "enterGoogleAuth" | "proveGoogleAuth" | "failGcpSts" | "failure" | "ready"
>;

export const validateAcquisitionWorkerStartupEvent = (input: unknown): AcquisitionWorkerStartupEvent => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-startup-telemetry");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join("\0") !== exactKeys.join("\0")
    || value.event !== "acquisition-worker-startup" || !stages.has(value.startupStage as StartupStage)
    || !googleAuthStages.has(value.googleAuthStage as GoogleAuthStage)
    || !gcpStsFailureReasons.has(value.gcpStsFailureReason as GcpStsFailureReason)
    || (value.startupFailureFamily !== null && !families.has(value.startupFailureFamily as StartupFailureFamily))
    || evidenceKeys.some((key) => !evidenceValues.has(value[key] as StartupEvidence))
    || (value.startupStage === "READY") !== (value.startupFailureFamily === null)) {
    throw new TypeError("invalid-startup-telemetry");
  }
  return Object.freeze(value) as AcquisitionWorkerStartupEvent;
};
