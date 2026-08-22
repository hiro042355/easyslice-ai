import { ACQUISITION_FAILURE_CODES, type AcquisitionFailureCode } from "./types";

export const TELEMETRY_TRI_STATES = ["YES", "NO", "UNKNOWN"] as const;
export type TelemetryTriState = (typeof TELEMETRY_TRI_STATES)[number];

export const PLAYER_CLIENTS = ["DEFAULT", "WEB", "MWEB", "OTHER", "UNKNOWN"] as const;
export type TelemetryPlayerClient = (typeof PLAYER_CLIENTS)[number];
export const TOKEN_CONTEXTS = ["GVS", "PLAYER", "SUBS", "UNKNOWN"] as const;
export type TelemetryTokenContext = (typeof TOKEN_CONTEXTS)[number];
export const HTTP_403_STAGES = ["PLAYER", "GVS", "MEDIA", "UNKNOWN"] as const;
export type TelemetryHttp403Stage = (typeof HTTP_403_STAGES)[number];

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
  providerTokenResponseObserved: TelemetryTriState;
  providerTokenSchemaValid: TelemetryTriState;
  tokenContext: TelemetryTokenContext;
  tokenConsumedByYtDlp: TelemetryTriState;
  playerClient: TelemetryPlayerClient;
  gvsRequestReached: TelemetryTriState;
  mediaRequestReached: TelemetryTriState;
  http403Stage: TelemetryHttp403Stage;
  retryCount: 0;
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
const tokenContexts = new Set<string>(TOKEN_CONTEXTS);
const http403Stages = new Set<string>(HTTP_403_STAGES);
const safeFailureCodes = new Set<string>([...ACQUISITION_FAILURE_CODES, "NONE"]);
const keys = [
  "expectedPluginArtifactPresent", "runtimePluginDetection", "providerConfigured", "providerHealthy",
  "acquisitionProviderRequest", "acquisitionProviderSuccess", "acquisitionProviderFailure", "nodeConfigured",
  "providerTokenResponseObserved", "providerTokenSchemaValid", "tokenContext", "tokenConsumedByYtDlp",
  "playerClient", "gvsRequestReached", "mediaRequestReached", "http403Stage", "retryCount",
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
    if (key === "playerClient" || key === "configuredPlayerClient" || key === "observedPlayerClient") {
      if (typeof item !== "string" || !players.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "tokenContext") {
      if (typeof item !== "string" || !tokenContexts.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "http403Stage") {
      if (typeof item !== "string" || !http403Stages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "retryCount") {
      if (item !== 0) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "safeFailureCode") {
      if (typeof item !== "string" || !safeFailureCodes.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "failureStage") {
      if (typeof item !== "string" || !stages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (typeof item !== "string" || !tri.has(item)) throw new TypeError("invalid-acquisition-telemetry");
  }
  return Object.freeze({ ...value }) as AcquisitionSafeTelemetry;
};

export class AcquisitionTelemetryCollector {
  readonly #state: Record<string, string | number>;
  constructor(runtime: Readonly<{ pluginArtifact: boolean; nodeConfigured: boolean; nodeExecutable: boolean; nodeVersionMatch: boolean; ejsAvailable: boolean }>) {
    this.#state = {
      expectedPluginArtifactPresent: runtime.pluginArtifact ? "YES" : "NO", runtimePluginDetection: "UNKNOWN",
      providerConfigured: "YES", providerHealthy: "UNKNOWN", acquisitionProviderRequest: "NO",
      acquisitionProviderSuccess: "NO", acquisitionProviderFailure: "NO", nodeConfigured: runtime.nodeConfigured ? "YES" : "NO",
      providerTokenResponseObserved: "NO", providerTokenSchemaValid: "UNKNOWN", tokenContext: "UNKNOWN",
      tokenConsumedByYtDlp: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "UNKNOWN",
      mediaRequestReached: "UNKNOWN", http403Stage: "UNKNOWN", retryCount: 0,
      nodeExecutable: runtime.nodeExecutable ? "YES" : "NO", nodeVersionMatch: runtime.nodeVersionMatch ? "YES" : "NO",
      ejsAvailable: runtime.ejsAvailable ? "YES" : "NO", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB",
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
  providerTokenResponse(observed: boolean, schemaValid: boolean, context: TelemetryTokenContext = "UNKNOWN"): void {
    this.#state.providerTokenResponseObserved = observed ? "YES" : "NO";
    this.#state.providerTokenSchemaValid = observed ? (schemaValid ? "YES" : "NO") : "UNKNOWN";
    this.#state.tokenContext = context;
  }
  processEvidence(evidence: Readonly<{
    tokenContext: TelemetryTokenContext;
    tokenConsumedByYtDlp: TelemetryTriState;
    gvsRequestReached: TelemetryTriState;
    mediaRequestReached: TelemetryTriState;
    http403Stage: TelemetryHttp403Stage;
  }>): void {
    this.#state.tokenContext = evidence.tokenContext;
    this.#state.tokenConsumedByYtDlp = evidence.tokenConsumedByYtDlp;
    this.#state.gvsRequestReached = evidence.gvsRequestReached;
    this.#state.mediaRequestReached = evidence.mediaRequestReached;
    this.#state.http403Stage = evidence.http403Stage;
  }
  failure(code: AcquisitionFailureCode): void { this.#state.safeFailureCode = code; }
  snapshot(): AcquisitionSafeTelemetry { return validateAcquisitionSafeTelemetry(this.#state); }
}
