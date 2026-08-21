import { ACQUISITION_FAILURE_CODES, type AcquisitionFailureCode } from "./types";

export const TELEMETRY_TRI_STATES = ["YES", "NO", "UNKNOWN"] as const;
export type TelemetryTriState = (typeof TELEMETRY_TRI_STATES)[number];

export const PLAYER_CLIENTS = ["DEFAULT", "WEB", "MWEB", "OTHER", "UNKNOWN"] as const;
export type TelemetryPlayerClient = (typeof PLAYER_CLIENTS)[number];

export const FAILURE_STAGES = [
  "PRE_EXECUTION", "PROVIDER_REQUEST", "PO_TOKEN", "EXTRACTOR", "JS_CHALLENGE",
  "FORMAT_ENUMERATION", "MEDIA_REQUEST", "MEDIA_DOWNLOAD", "POSTPROCESS", "VALIDATION", "UNKNOWN",
] as const;
export type TelemetryFailureStage = (typeof FAILURE_STAGES)[number];

export type AcquisitionSafeTelemetry = Readonly<{
  expectedPluginArtifactPresent: TelemetryTriState;
  runtimePluginDetection: TelemetryTriState;
  providerConfigured: TelemetryTriState;
  providerHealthy: TelemetryTriState;
  acquisitionProviderRequest: TelemetryTriState;
  acquisitionProviderSuccess: TelemetryTriState;
  acquisitionProviderFailure: TelemetryTriState;
  nodeConfigured: TelemetryTriState;
  nodeExecutable: TelemetryTriState;
  nodeVersionMatch: TelemetryTriState;
  ejsAvailable: TelemetryTriState;
  ejsActualUse: TelemetryTriState;
  configuredPlayerClient: TelemetryPlayerClient;
  observedPlayerClient: TelemetryPlayerClient;
  jsChallengeObserved: TelemetryTriState;
  formatEnumerationObserved: TelemetryTriState;
  mediaRequestObserved: TelemetryTriState;
  mediaBytesObserved: TelemetryTriState;
  safeFailureCode: AcquisitionFailureCode | "NONE";
  failureStage: TelemetryFailureStage;
}>;

const tri = new Set<string>(TELEMETRY_TRI_STATES);
const players = new Set<string>(PLAYER_CLIENTS);
const stages = new Set<string>(FAILURE_STAGES);
const safeFailureCodes = new Set<string>([...ACQUISITION_FAILURE_CODES, "NONE"]);
const keys = [
  "expectedPluginArtifactPresent", "runtimePluginDetection", "providerConfigured", "providerHealthy",
  "acquisitionProviderRequest", "acquisitionProviderSuccess", "acquisitionProviderFailure", "nodeConfigured",
  "nodeExecutable", "nodeVersionMatch", "ejsAvailable", "ejsActualUse", "configuredPlayerClient",
  "observedPlayerClient", "jsChallengeObserved", "formatEnumerationObserved", "mediaRequestObserved",
  "mediaBytesObserved", "safeFailureCode", "failureStage",
] as const;

export const validateAcquisitionSafeTelemetry = (input: unknown): AcquisitionSafeTelemetry => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-acquisition-telemetry");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key as typeof keys[number]))) {
    throw new TypeError("invalid-acquisition-telemetry");
  }
  for (const key of keys) {
    const item = value[key];
    if (key === "configuredPlayerClient" || key === "observedPlayerClient") {
      if (typeof item !== "string" || !players.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "safeFailureCode") {
      if (typeof item !== "string" || !safeFailureCodes.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "failureStage") {
      if (typeof item !== "string" || !stages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (typeof item !== "string" || !tri.has(item)) throw new TypeError("invalid-acquisition-telemetry");
  }
  return Object.freeze({ ...value }) as AcquisitionSafeTelemetry;
};

export class AcquisitionTelemetryCollector {
  readonly #state: Record<string, string>;
  constructor(runtime: Readonly<{ pluginArtifact: boolean; nodeConfigured: boolean; nodeExecutable: boolean; nodeVersionMatch: boolean; ejsAvailable: boolean }>) {
    this.#state = {
      expectedPluginArtifactPresent: runtime.pluginArtifact ? "YES" : "NO", runtimePluginDetection: "UNKNOWN",
      providerConfigured: "YES", providerHealthy: "UNKNOWN", acquisitionProviderRequest: "NO",
      acquisitionProviderSuccess: "NO", acquisitionProviderFailure: "NO", nodeConfigured: runtime.nodeConfigured ? "YES" : "NO",
      nodeExecutable: runtime.nodeExecutable ? "YES" : "NO", nodeVersionMatch: runtime.nodeVersionMatch ? "YES" : "NO",
      ejsAvailable: runtime.ejsAvailable ? "YES" : "NO", ejsActualUse: "UNKNOWN", configuredPlayerClient: "DEFAULT",
      observedPlayerClient: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
      mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN", safeFailureCode: "NONE", failureStage: "UNKNOWN",
    };
  }
  providerHealth(value: boolean): void { this.#state.providerHealthy = value ? "YES" : "NO"; }
  providerRequest(): void { this.#state.acquisitionProviderRequest = "YES"; }
  providerResult(success: boolean): void {
    this.#state.acquisitionProviderSuccess = success ? "YES" : "NO";
    this.#state.acquisitionProviderFailure = success ? "NO" : "YES";
    if (!success) this.#state.failureStage = "PROVIDER_REQUEST";
  }
  failure(code: AcquisitionFailureCode): void { this.#state.safeFailureCode = code; }
  snapshot(): AcquisitionSafeTelemetry { return validateAcquisitionSafeTelemetry(this.#state); }
}
