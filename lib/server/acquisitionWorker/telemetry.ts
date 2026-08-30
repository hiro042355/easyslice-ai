import { ACQUISITION_FAILURE_CODES, type AcquisitionFailureCode } from "./types";

export const TELEMETRY_TRI_STATES = ["YES", "NO", "UNKNOWN"] as const;
export type TelemetryTriState = (typeof TELEMETRY_TRI_STATES)[number];

export const PLAYER_CLIENTS = ["DEFAULT", "WEB", "MWEB", "OTHER", "UNKNOWN"] as const;
export type TelemetryPlayerClient = (typeof PLAYER_CLIENTS)[number];
export const TOKEN_CONTEXTS = ["GVS", "PLAYER", "SUBS", "UNKNOWN"] as const;
export type TelemetryTokenContext = (typeof TOKEN_CONTEXTS)[number];
export const ACQUISITION_TRANSPORTS = ["HLS", "DIRECT", "DASH", "UNKNOWN"] as const;
export type AcquisitionTransport = (typeof ACQUISITION_TRANSPORTS)[number];
export const HTTP_403_STAGES = ["PLAYER", "GVS", "MEDIA", "HLS_MANIFEST", "HLS_FRAGMENT", "UNKNOWN"] as const;
export type TelemetryHttp403Stage = (typeof HTTP_403_STAGES)[number];
export const BOT_CHECK_EVIDENCE_STAGES = [
  "PRE_EXTERNAL_REQUEST", "PLAYER_RESPONSE", "GVS_RESPONSE", "MEDIA_RESPONSE", "EXTRACTOR", "UNKNOWN",
] as const;
export type BotCheckEvidenceStage = (typeof BOT_CHECK_EVIDENCE_STAGES)[number];
export const PROVIDER_PRECHECK_OUTCOMES = ["NOT_RUN", "NOT_CONFIGURED", "AVAILABLE", "UNAVAILABLE", "FAILED", "UNKNOWN"] as const;
export type ProviderPrecheckOutcome = (typeof PROVIDER_PRECHECK_OUTCOMES)[number];
export const PROCESS_FAILURE_FAMILIES = [
  "yt-dlp-missing", "yt-dlp-not-executable", "yt-dlp-spawn-failed", "yt-dlp-timeout",
  "yt-dlp-cancelled", "yt-dlp-output-limit", "yt-dlp-exit-failed", "youtube-sign-in-required",
  "youtube-bot-check", "video-unavailable", "private-video", "age-restricted", "region-restricted",
  "live-stream-unsupported", "playlist-unsupported", "format-unavailable", "ffmpeg-unavailable",
  "network-failure", "extractor-failure", "permission-failure", "output-path-failure",
  "unknown-yt-dlp-failure", "yt-dlp-version-mismatch", "NONE",
] as const;
export type ProcessFailureFamily = (typeof PROCESS_FAILURE_FAMILIES)[number];

export const FAILURE_STAGES = [
  "PRE_EXECUTION", "PROVIDER_REQUEST", "PO_TOKEN", "EXTRACTOR", "JS_CHALLENGE",
  "FORMAT_ENUMERATION", "MEDIA_REQUEST", "MEDIA_DOWNLOAD", "POSTPROCESS", "VALIDATION", "UNKNOWN",
] as const;
export type TelemetryFailureStage = (typeof FAILURE_STAGES)[number];

export type AcquisitionSafeTelemetry = Readonly<{
  acquisitionExecutionBegan: TelemetryTriState;
  providerPrecheckOutcome: ProviderPrecheckOutcome;
  ytDlpSpawnAttempted: TelemetryTriState;
  ytDlpProcessStarted: TelemetryTriState;
  externalRequestStageReached: TelemetryTriState;
  has403: boolean;
  has429: boolean;
  has5xx: boolean;
  timeoutObserved: boolean;
  processFailureFamily: ProcessFailureFamily;
  expectedPluginArtifactPresent: TelemetryTriState;
  runtimePluginDetection: TelemetryTriState;
  providerConfigured: TelemetryTriState;
  providerHealthy: TelemetryTriState;
  providerPluginConfigured: TelemetryTriState;
  providerPluginDiscovered: TelemetryTriState;
  providerPluginActivated: TelemetryTriState;
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
  selectedTransport: AcquisitionTransport;
  hlsManifestReached: TelemetryTriState;
  hlsFragmentReached: TelemetryTriState;
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
  botCheckEvidenceStage: BotCheckEvidenceStage;
  extractorTerminatedBeforeProviderRequest: TelemetryTriState;
}>;

const tri = new Set<string>(TELEMETRY_TRI_STATES);
const players = new Set<string>(PLAYER_CLIENTS);
const stages = new Set<string>(FAILURE_STAGES);
const tokenContexts = new Set<string>(TOKEN_CONTEXTS);
const transports = new Set<string>(ACQUISITION_TRANSPORTS);
const http403Stages = new Set<string>(HTTP_403_STAGES);
const providerPrecheckOutcomes = new Set<string>(PROVIDER_PRECHECK_OUTCOMES);
const processFailureFamilies = new Set<string>(PROCESS_FAILURE_FAMILIES);
const botCheckEvidenceStages = new Set<string>(BOT_CHECK_EVIDENCE_STAGES);
const safeFailureCodes = new Set<string>([...ACQUISITION_FAILURE_CODES, "NONE"]);
const keys = [
  "acquisitionExecutionBegan", "providerPrecheckOutcome", "ytDlpSpawnAttempted", "ytDlpProcessStarted",
  "externalRequestStageReached", "has403", "has429", "has5xx", "timeoutObserved", "processFailureFamily",
  "expectedPluginArtifactPresent", "runtimePluginDetection", "providerConfigured", "providerHealthy",
  "providerPluginConfigured", "providerPluginDiscovered", "providerPluginActivated",
  "acquisitionProviderRequest", "acquisitionProviderSuccess", "acquisitionProviderFailure", "nodeConfigured",
  "providerTokenResponseObserved", "providerTokenSchemaValid", "tokenContext", "tokenConsumedByYtDlp",
  "playerClient", "gvsRequestReached", "mediaRequestReached", "selectedTransport", "hlsManifestReached",
  "hlsFragmentReached", "http403Stage", "retryCount",
  "nodeExecutable", "nodeVersionMatch", "ejsAvailable", "ejsActualUse", "configuredPlayerClient",
  "observedPlayerClient", "jsChallengeObserved", "formatEnumerationObserved", "mediaRequestObserved",
  "mediaBytesObserved", "safeFailureCode", "failureStage", "botCheckEvidenceStage",
  "extractorTerminatedBeforeProviderRequest",
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
    } else if (key === "selectedTransport") {
      if (typeof item !== "string" || !transports.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "http403Stage") {
      if (typeof item !== "string" || !http403Stages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "retryCount") {
      if (item !== 0) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "providerPrecheckOutcome") {
      if (typeof item !== "string" || !providerPrecheckOutcomes.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "has403" || key === "has429" || key === "has5xx" || key === "timeoutObserved") {
      if (typeof item !== "boolean") throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "processFailureFamily") {
      if (typeof item !== "string" || !processFailureFamilies.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "safeFailureCode") {
      if (typeof item !== "string" || !safeFailureCodes.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "failureStage") {
      if (typeof item !== "string" || !stages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "botCheckEvidenceStage") {
      if (typeof item !== "string" || !botCheckEvidenceStages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (typeof item !== "string" || !tri.has(item)) throw new TypeError("invalid-acquisition-telemetry");
  }
  return Object.freeze({ ...value }) as AcquisitionSafeTelemetry;
};

export class AcquisitionTelemetryCollector {
  readonly #state: Record<string, string | number | boolean>;
  constructor(runtime: Readonly<{ pluginArtifact: boolean; nodeConfigured: boolean; nodeExecutable: boolean; nodeVersionMatch: boolean; ejsAvailable: boolean }>) {
    this.#state = {
      acquisitionExecutionBegan: "NO", providerPrecheckOutcome: "NOT_RUN", ytDlpSpawnAttempted: "NO",
      ytDlpProcessStarted: "NO", externalRequestStageReached: "UNKNOWN", has403: false, has429: false,
      has5xx: false, timeoutObserved: false, processFailureFamily: "NONE",
      expectedPluginArtifactPresent: runtime.pluginArtifact ? "YES" : "NO", runtimePluginDetection: "UNKNOWN",
      providerConfigured: "YES", providerHealthy: "UNKNOWN", providerPluginConfigured: "UNKNOWN",
      providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", acquisitionProviderRequest: "NO",
      acquisitionProviderSuccess: "NO", acquisitionProviderFailure: "NO", nodeConfigured: runtime.nodeConfigured ? "YES" : "NO",
      providerTokenResponseObserved: "NO", providerTokenSchemaValid: "UNKNOWN", tokenContext: "UNKNOWN",
      tokenConsumedByYtDlp: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "UNKNOWN",
      mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
      hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", retryCount: 0,
      nodeExecutable: runtime.nodeExecutable ? "YES" : "NO", nodeVersionMatch: runtime.nodeVersionMatch ? "YES" : "NO",
      ejsAvailable: runtime.ejsAvailable ? "YES" : "NO", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB",
      observedPlayerClient: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
      mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN", safeFailureCode: "NONE", failureStage: "UNKNOWN",
      botCheckEvidenceStage: "UNKNOWN", extractorTerminatedBeforeProviderRequest: "UNKNOWN",
    };
  }
  providerHealth(value: boolean): void { this.#state.providerHealthy = value ? "YES" : "NO"; }
  providerPluginConfiguration(value: boolean): void { this.#state.providerPluginConfigured = value ? "YES" : "NO"; }
  executionBegan(): void { this.#state.acquisitionExecutionBegan = "YES"; }
  providerPrecheck(value: Exclude<ProviderPrecheckOutcome, "NOT_RUN">): void {
    this.#state.providerPrecheckOutcome = value;
  }
  ytDlpSpawnAttempt(): void { this.#state.ytDlpSpawnAttempted = "YES"; }
  ytDlpStarted(): void { this.#state.ytDlpProcessStarted = "YES"; }
  processFailureEvidence(value: Readonly<{ family: Exclude<ProcessFailureFamily, "NONE">; has403: boolean; has429: boolean; has5xx: boolean; timedOut: boolean }>): void {
    this.#state.processFailureFamily = value.family;
    this.#state.has403 = value.has403;
    this.#state.has429 = value.has429;
    this.#state.has5xx = value.has5xx;
    this.#state.timeoutObserved = value.timedOut;
  }
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
    selectedTransport: AcquisitionTransport;
    hlsManifestReached: TelemetryTriState;
    hlsFragmentReached: TelemetryTriState;
    http403Stage: TelemetryHttp403Stage;
    botCheckEvidenceStage: BotCheckEvidenceStage;
  }>): void {
    this.#state.tokenContext = evidence.tokenContext;
    this.#state.tokenConsumedByYtDlp = evidence.tokenConsumedByYtDlp;
    this.#state.gvsRequestReached = evidence.gvsRequestReached;
    this.#state.mediaRequestReached = evidence.mediaRequestReached;
    this.#state.selectedTransport = evidence.selectedTransport;
    this.#state.hlsManifestReached = evidence.hlsManifestReached;
    this.#state.hlsFragmentReached = evidence.hlsFragmentReached;
    this.#state.http403Stage = evidence.http403Stage;
    this.#state.botCheckEvidenceStage = evidence.botCheckEvidenceStage;
    if (evidence.botCheckEvidenceStage === "EXTRACTOR") this.#state.failureStage = "EXTRACTOR";
    this.#state.externalRequestStageReached = evidence.gvsRequestReached === "YES" || evidence.mediaRequestReached === "YES"
      ? "YES" : "UNKNOWN";
  }
  processTerminated(): void {
    this.#state.extractorTerminatedBeforeProviderRequest = this.#state.ytDlpProcessStarted === "YES"
      && this.#state.botCheckEvidenceStage === "EXTRACTOR" && this.#state.acquisitionProviderRequest === "NO"
      ? "YES" : this.#state.acquisitionProviderRequest === "YES" ? "NO" : "UNKNOWN";
  }
  failure(code: AcquisitionFailureCode): void { this.#state.safeFailureCode = code; }
  snapshot(): AcquisitionSafeTelemetry { return validateAcquisitionSafeTelemetry(this.#state); }
}
