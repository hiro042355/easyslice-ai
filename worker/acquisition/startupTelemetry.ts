export const STARTUP_STAGES = [
  "RUNTIME_RESOLUTION", "CONTROL_STORE_CONFIG", "GOOGLE_AUTH_INIT", "CONTROL_STORE_INIT",
  "TELEMETRY_PROXY_INIT", "HTTP_BIND", "READY", "UNKNOWN",
] as const;
export type StartupStage = typeof STARTUP_STAGES[number];

export const STARTUP_FAILURE_FAMILIES = [
  "RUNTIME_DEPENDENCY_FAILURE", "INVALID_CONTROL_AUTHORITY", "GOOGLE_AUTH_FAILURE",
  "CONTROL_STORE_FAILURE", "TELEMETRY_PROXY_FAILURE", "HTTP_BIND_FAILURE", "UNKNOWN_STARTUP_FAILURE",
] as const;
export type StartupFailureFamily = typeof STARTUP_FAILURE_FAMILIES[number];
export type StartupEvidence = "YES" | "NO" | "UNKNOWN";

export type AcquisitionWorkerStartupEvent = Readonly<{
  event: "acquisition-worker-startup";
  startupStage: StartupStage;
  startupFailureFamily: StartupFailureFamily | null;
  runtimeDependenciesResolved: StartupEvidence;
  controlAuthorityValidated: StartupEvidence;
  googleAuthInitialized: StartupEvidence;
  controlStoreInitialized: StartupEvidence;
  telemetryProxyInitialized: StartupEvidence;
  httpListenerBound: StartupEvidence;
}>;

const evidenceKeys = [
  "runtimeDependenciesResolved", "controlAuthorityValidated", "googleAuthInitialized",
  "controlStoreInitialized", "telemetryProxyInitialized", "httpListenerBound",
] as const;
type EvidenceKey = typeof evidenceKeys[number];
const evidenceValues = new Set<StartupEvidence>(["YES", "NO", "UNKNOWN"]);
const stages = new Set<StartupStage>(STARTUP_STAGES);
const families = new Set<StartupFailureFamily>(STARTUP_FAILURE_FAMILIES);
const exactKeys = ["event", "startupStage", "startupFailureFamily", ...evidenceKeys].sort();

const familyForStage = (stage: StartupStage): StartupFailureFamily => ({
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
  private readonly evidence: Record<EvidenceKey, StartupEvidence> = {
    runtimeDependenciesResolved: "UNKNOWN", controlAuthorityValidated: "UNKNOWN",
    googleAuthInitialized: "UNKNOWN", controlStoreInitialized: "UNKNOWN",
    telemetryProxyInitialized: "UNKNOWN", httpListenerBound: "UNKNOWN",
  };

  enter(stage: Exclude<StartupStage, "READY">): void { this.stage = stage; }
  prove(key: EvidenceKey): void { this.evidence[key] = "YES"; }

  failure(): AcquisitionWorkerStartupEvent {
    const failedKey: Partial<Record<StartupStage, EvidenceKey>> = {
      RUNTIME_RESOLUTION: "runtimeDependenciesResolved", CONTROL_STORE_CONFIG: "controlAuthorityValidated",
      GOOGLE_AUTH_INIT: "googleAuthInitialized", CONTROL_STORE_INIT: "controlStoreInitialized",
      TELEMETRY_PROXY_INIT: "telemetryProxyInitialized", HTTP_BIND: "httpListenerBound",
    };
    const key = failedKey[this.stage];
    if (key && this.evidence[key] !== "YES") this.evidence[key] = "NO";
    return Object.freeze({ event: "acquisition-worker-startup", startupStage: this.stage,
      startupFailureFamily: familyForStage(this.stage), ...this.evidence });
  }

  ready(): AcquisitionWorkerStartupEvent {
    this.stage = "READY";
    return Object.freeze({ event: "acquisition-worker-startup", startupStage: "READY",
      startupFailureFamily: null, ...this.evidence });
  }
}

export const validateAcquisitionWorkerStartupEvent = (input: unknown): AcquisitionWorkerStartupEvent => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-startup-telemetry");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join("\0") !== exactKeys.join("\0")
    || value.event !== "acquisition-worker-startup" || !stages.has(value.startupStage as StartupStage)
    || (value.startupFailureFamily !== null && !families.has(value.startupFailureFamily as StartupFailureFamily))
    || evidenceKeys.some((key) => !evidenceValues.has(value[key] as StartupEvidence))
    || (value.startupStage === "READY") !== (value.startupFailureFamily === null)) {
    throw new TypeError("invalid-startup-telemetry");
  }
  return Object.freeze(value) as AcquisitionWorkerStartupEvent;
};
