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
  "PRE_EXTERNAL_REQUEST_LEXICAL", "PLAYER_RESPONSE_LEXICAL", "GVS_RESPONSE_LEXICAL", "MEDIA_RESPONSE_LEXICAL",
  "EXTRACTOR_LEXICAL", "UNKNOWN",
] as const;
export type BotCheckEvidenceStage = (typeof BOT_CHECK_EVIDENCE_STAGES)[number];
export const PROVIDER_OBSERVATION_COVERAGE = ["COMPLETE", "NOT_STARTED", "INTERRUPTED", "UNKNOWN"] as const;
export type ProviderObservationCoverage = (typeof PROVIDER_OBSERVATION_COVERAGE)[number];
export const PROVIDER_REQUEST_COUNTS = ["ZERO", "ONE", "MULTIPLE", "UNKNOWN"] as const;
export type ProviderRequestCount = (typeof PROVIDER_REQUEST_COUNTS)[number];
export const PROVIDER_SCHEMA_OUTCOMES = ["VALID", "INVALID", "NOT_OBSERVED", "UNKNOWN"] as const;
export type ProviderSchemaOutcome = (typeof PROVIDER_SCHEMA_OUTCOMES)[number];
export const PROVIDER_TEMPORAL_RELATIONS = ["BEFORE_TERMINATION", "AFTER_TERMINATION", "NOT_OBSERVED", "UNKNOWN"] as const;
export type ProviderTemporalRelation = (typeof PROVIDER_TEMPORAL_RELATIONS)[number];
export const TOKEN_RETRIEVAL_RELATIONS = ["BEFORE_RETRIEVAL", "AFTER_RETRIEVAL", "UNKNOWN"] as const;
export type TokenRetrievalRelation = (typeof TOKEN_RETRIEVAL_RELATIONS)[number];
export const BOT_CHECK_EVIDENCE_KINDS = ["STRUCTURED", "BOUNDARY", "LEXICAL", "UNKNOWN"] as const;
export type BotCheckEvidenceKind = (typeof BOT_CHECK_EVIDENCE_KINDS)[number];
export const POST_RETRIEVAL_EXTERNAL_REQUEST_STAGES = [
  "PLAYER_API", "GVS_ERROR", "MEDIA", "HLS_MANIFEST", "HLS_FRAGMENT", "UNKNOWN",
] as const;
export type PostRetrievalExternalRequestStage = (typeof POST_RETRIEVAL_EXTERNAL_REQUEST_STAGES)[number];
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
  ytDlpProcessTerminated: "YES" | "UNKNOWN";
  providerRequestObservationCoverage: ProviderObservationCoverage;
  providerRequestCount: ProviderRequestCount;
  providerTokenDemandObserved: "YES" | "UNKNOWN";
  providerResponseObserved: TelemetryTriState;
  providerResponseSchemaOutcome: ProviderSchemaOutcome;
  providerRequestTemporalRelation: ProviderTemporalRelation;
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
  tokenRetrievedByYtDlp: "YES" | "UNKNOWN";
  tokenAttachedToOutboundRequest: "UNKNOWN";
  tokenConsumedByYtDlp: TelemetryTriState;
  botCheckRelativeToTokenRetrieval: TokenRetrievalRelation;
  botCheckRelativeToTokenAttachment: "UNKNOWN";
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
  botCheckEvidenceKind: BotCheckEvidenceKind;
  extractorTerminatedWithoutObservedProviderRequest: TelemetryTriState;
  /** @deprecated Temporal ordering was not independently observed. Always UNKNOWN. */
  extractorTerminatedBeforeProviderRequest: TelemetryTriState;
  postRetrievalExternalRequestStage: PostRetrievalExternalRequestStage;
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
const providerObservationCoverage = new Set<string>(PROVIDER_OBSERVATION_COVERAGE);
const providerRequestCounts = new Set<string>(PROVIDER_REQUEST_COUNTS);
const providerSchemaOutcomes = new Set<string>(PROVIDER_SCHEMA_OUTCOMES);
const providerTemporalRelations = new Set<string>(PROVIDER_TEMPORAL_RELATIONS);
const tokenRetrievalRelations = new Set<string>(TOKEN_RETRIEVAL_RELATIONS);
const botCheckEvidenceKinds = new Set<string>(BOT_CHECK_EVIDENCE_KINDS);
const postRetrievalExternalRequestStages = new Set<string>(POST_RETRIEVAL_EXTERNAL_REQUEST_STAGES);
const safeFailureCodes = new Set<string>([...ACQUISITION_FAILURE_CODES, "NONE"]);
const keys = [
  "acquisitionExecutionBegan", "providerPrecheckOutcome", "ytDlpSpawnAttempted", "ytDlpProcessStarted",
  "ytDlpProcessTerminated", "providerRequestObservationCoverage", "providerRequestCount",
  "providerTokenDemandObserved", "providerResponseObserved", "providerResponseSchemaOutcome",
  "providerRequestTemporalRelation",
  "externalRequestStageReached", "has403", "has429", "has5xx", "timeoutObserved", "processFailureFamily",
  "expectedPluginArtifactPresent", "runtimePluginDetection", "providerConfigured", "providerHealthy",
  "providerPluginConfigured", "providerPluginDiscovered", "providerPluginActivated",
  "acquisitionProviderRequest", "acquisitionProviderSuccess", "acquisitionProviderFailure", "nodeConfigured",
  "providerTokenResponseObserved", "providerTokenSchemaValid", "tokenContext", "tokenRetrievedByYtDlp",
  "tokenAttachedToOutboundRequest", "tokenConsumedByYtDlp", "botCheckRelativeToTokenRetrieval",
  "botCheckRelativeToTokenAttachment",
  "playerClient", "gvsRequestReached", "mediaRequestReached", "selectedTransport", "hlsManifestReached",
  "hlsFragmentReached", "http403Stage", "retryCount",
  "nodeExecutable", "nodeVersionMatch", "ejsAvailable", "ejsActualUse", "configuredPlayerClient",
  "observedPlayerClient", "jsChallengeObserved", "formatEnumerationObserved", "mediaRequestObserved",
  "mediaBytesObserved", "safeFailureCode", "failureStage", "botCheckEvidenceStage", "botCheckEvidenceKind",
  "extractorTerminatedWithoutObservedProviderRequest", "extractorTerminatedBeforeProviderRequest",
  "postRetrievalExternalRequestStage",
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
    } else if (key === "providerRequestObservationCoverage") {
      if (typeof item !== "string" || !providerObservationCoverage.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "providerRequestCount") {
      if (typeof item !== "string" || !providerRequestCounts.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "providerResponseSchemaOutcome") {
      if (typeof item !== "string" || !providerSchemaOutcomes.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "providerRequestTemporalRelation") {
      if (typeof item !== "string" || !providerTemporalRelations.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "botCheckRelativeToTokenRetrieval") {
      if (typeof item !== "string" || !tokenRetrievalRelations.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "botCheckEvidenceKind") {
      if (typeof item !== "string" || !botCheckEvidenceKinds.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (key === "postRetrievalExternalRequestStage") {
      if (typeof item !== "string" || !postRetrievalExternalRequestStages.has(item)) throw new TypeError("invalid-acquisition-telemetry");
    } else if (typeof item !== "string" || !tri.has(item)) throw new TypeError("invalid-acquisition-telemetry");
  }
  const invalid = (): never => { throw new TypeError("invalid-acquisition-telemetry-invariant"); };
  const positiveRequestCount = value.providerRequestCount === "ONE" || value.providerRequestCount === "MULTIPLE";
  if (value.tokenAttachedToOutboundRequest !== "UNKNOWN" || value.botCheckRelativeToTokenAttachment !== "UNKNOWN") invalid();
  if (value.tokenConsumedByYtDlp !== "UNKNOWN") invalid();
  if (value.botCheckRelativeToTokenRetrieval !== "UNKNOWN" && value.tokenRetrievedByYtDlp !== "YES") invalid();
  if (value.extractorTerminatedBeforeProviderRequest !== "UNKNOWN") invalid();
  if (value.postRetrievalExternalRequestStage !== "UNKNOWN" && value.tokenRetrievedByYtDlp !== "YES") invalid();
  if (value.extractorTerminatedWithoutObservedProviderRequest === "YES" && !(
    value.ytDlpProcessTerminated === "YES"
    && value.botCheckEvidenceStage === "EXTRACTOR_LEXICAL"
    && value.providerRequestObservationCoverage === "COMPLETE"
    && value.providerRequestCount === "ZERO"
  )) invalid();
  if (value.extractorTerminatedWithoutObservedProviderRequest === "NO" && !positiveRequestCount) invalid();
  if (value.providerRequestCount === "ZERO" && value.providerRequestObservationCoverage !== "COMPLETE") invalid();
  if (positiveRequestCount && (value.providerRequestObservationCoverage === "NOT_STARTED"
    || value.acquisitionProviderRequest !== "YES")) invalid();
  if ((value.providerRequestTemporalRelation === "BEFORE_TERMINATION"
    || value.providerRequestTemporalRelation === "AFTER_TERMINATION") && !positiveRequestCount) invalid();
  if (value.providerRequestTemporalRelation === "NOT_OBSERVED" && !(
    value.providerRequestObservationCoverage === "COMPLETE" && value.providerRequestCount === "ZERO"
  )) invalid();
  if ((value.providerResponseObserved === "YES" || value.providerResponseObserved === "NO") && !positiveRequestCount) invalid();
  if ((value.providerResponseSchemaOutcome === "VALID" || value.providerResponseSchemaOutcome === "INVALID")
    && value.providerResponseObserved !== "YES") invalid();
  if (value.providerResponseSchemaOutcome === "NOT_OBSERVED" && value.providerResponseObserved === "YES") invalid();
  const lexicalStage = typeof value.botCheckEvidenceStage === "string"
    && value.botCheckEvidenceStage !== "UNKNOWN" && value.botCheckEvidenceStage.endsWith("_LEXICAL");
  if (lexicalStage !== (value.botCheckEvidenceKind === "LEXICAL")) invalid();
  if (value.botCheckEvidenceKind === "STRUCTURED" || value.botCheckEvidenceKind === "BOUNDARY") invalid();
  return Object.freeze({ ...value }) as AcquisitionSafeTelemetry;
};

export class AcquisitionTelemetryCollector {
  readonly #state: Record<string, string | number | boolean>;
  #providerRequestCount = 0;
  constructor(runtime: Readonly<{ pluginArtifact: boolean; nodeConfigured: boolean; nodeExecutable: boolean; nodeVersionMatch: boolean; ejsAvailable: boolean }>) {
    this.#state = {
      acquisitionExecutionBegan: "NO", providerPrecheckOutcome: "NOT_RUN", ytDlpSpawnAttempted: "NO",
      ytDlpProcessStarted: "NO", ytDlpProcessTerminated: "UNKNOWN",
      providerRequestObservationCoverage: "NOT_STARTED", providerRequestCount: "UNKNOWN",
      providerTokenDemandObserved: "UNKNOWN", providerResponseObserved: "UNKNOWN",
      providerResponseSchemaOutcome: "UNKNOWN", providerRequestTemporalRelation: "UNKNOWN",
      externalRequestStageReached: "UNKNOWN", has403: false, has429: false,
      has5xx: false, timeoutObserved: false, processFailureFamily: "NONE",
      expectedPluginArtifactPresent: runtime.pluginArtifact ? "YES" : "NO", runtimePluginDetection: "UNKNOWN",
      providerConfigured: "YES", providerHealthy: "UNKNOWN", providerPluginConfigured: "UNKNOWN",
      providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", acquisitionProviderRequest: "NO",
      acquisitionProviderSuccess: "NO", acquisitionProviderFailure: "NO", nodeConfigured: runtime.nodeConfigured ? "YES" : "NO",
      providerTokenResponseObserved: "NO", providerTokenSchemaValid: "UNKNOWN", tokenContext: "UNKNOWN",
      tokenRetrievedByYtDlp: "UNKNOWN", tokenAttachedToOutboundRequest: "UNKNOWN",
      tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
      botCheckRelativeToTokenAttachment: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "UNKNOWN",
      mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
      hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", retryCount: 0,
      nodeExecutable: runtime.nodeExecutable ? "YES" : "NO", nodeVersionMatch: runtime.nodeVersionMatch ? "YES" : "NO",
      ejsAvailable: runtime.ejsAvailable ? "YES" : "NO", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB",
      observedPlayerClient: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
      mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN", safeFailureCode: "NONE", failureStage: "UNKNOWN",
      botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
      extractorTerminatedWithoutObservedProviderRequest: "UNKNOWN", extractorTerminatedBeforeProviderRequest: "UNKNOWN",
      postRetrievalExternalRequestStage: "UNKNOWN",
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
  providerObservationStarted(): void {
    this.#state.providerRequestObservationCoverage = "UNKNOWN";
    this.#providerRequestCount = 0;
    this.#state.providerRequestCount = "UNKNOWN";
  }
  providerObservationComplete(): void {
    this.#state.providerRequestObservationCoverage = "COMPLETE";
    this.#state.providerRequestCount = this.#providerRequestCount === 0 ? "ZERO"
      : this.#providerRequestCount === 1 ? "ONE" : "MULTIPLE";
    this.#deriveClosedProviderFacts();
  }
  providerObservationInterrupted(): void {
    this.#state.providerRequestObservationCoverage = "INTERRUPTED";
    this.#state.providerRequestCount = this.#providerRequestCount === 0 ? "UNKNOWN"
      : this.#providerRequestCount === 1 ? "ONE" : "MULTIPLE";
    this.#deriveClosedProviderFacts();
  }
  providerRequest(): void {
    if (this.#state.providerRequestObservationCoverage === "NOT_STARTED") {
      this.#state.providerRequestObservationCoverage = "UNKNOWN";
    }
    this.#state.acquisitionProviderRequest = "YES";
    this.#providerRequestCount += 1;
    this.#state.providerRequestCount = this.#providerRequestCount === 1 ? "ONE" : "MULTIPLE";
    this.#state.providerRequestTemporalRelation = this.#state.ytDlpProcessTerminated === "YES"
      ? "AFTER_TERMINATION" : "BEFORE_TERMINATION";
  }
  providerResult(success: boolean): void {
    this.#state.acquisitionProviderSuccess = success ? "YES" : "NO";
    this.#state.acquisitionProviderFailure = success ? "NO" : "YES";
    if (!success) this.#state.failureStage = "PROVIDER_REQUEST";
  }
  providerTokenResponse(observed: boolean, schemaValid: boolean, context: TelemetryTokenContext = "UNKNOWN"): void {
    if (observed && this.#state.acquisitionProviderRequest !== "YES") this.providerRequest();
    this.#state.providerTokenResponseObserved = observed ? "YES" : "NO";
    this.#state.providerTokenSchemaValid = observed ? (schemaValid ? "YES" : "NO") : "UNKNOWN";
    this.#state.tokenContext = context;
    this.#state.providerResponseObserved = observed ? "YES" : "NO";
    this.#state.providerResponseSchemaOutcome = observed ? (schemaValid ? "VALID" : "INVALID") : "NOT_OBSERVED";
  }
  processEvidence(evidence: Readonly<{
    providerPluginDiscovered: "YES" | "UNKNOWN";
    providerPluginActivated: "YES" | "UNKNOWN";
    observedPlayerClient: TelemetryPlayerClient;
    ejsActualUse: "YES" | "UNKNOWN";
    jsChallengeObserved: "YES" | "UNKNOWN";
    formatEnumerationObserved: "YES" | "UNKNOWN";
    mediaRequestObserved: "YES" | "UNKNOWN";
    mediaBytesObserved: "YES" | "UNKNOWN";
    tokenContext: TelemetryTokenContext;
    tokenRetrievedByYtDlp: "YES" | "UNKNOWN";
    tokenAttachedToOutboundRequest: "UNKNOWN";
    tokenConsumedByYtDlp: TelemetryTriState;
    botCheckRelativeToTokenRetrieval: TokenRetrievalRelation;
    botCheckRelativeToTokenAttachment: "UNKNOWN";
    gvsRequestReached: TelemetryTriState;
    mediaRequestReached: TelemetryTriState;
    selectedTransport: AcquisitionTransport;
    hlsManifestReached: TelemetryTriState;
    hlsFragmentReached: TelemetryTriState;
    http403Stage: TelemetryHttp403Stage;
    botCheckEvidenceStage: BotCheckEvidenceStage | "PRE_EXTERNAL_REQUEST" | "PLAYER_RESPONSE" | "GVS_RESPONSE" | "MEDIA_RESPONSE" | "EXTRACTOR";
    botCheckEvidenceKind?: BotCheckEvidenceKind;
    postRetrievalExternalRequestStage?: PostRetrievalExternalRequestStage;
  }>): void {
    this.#state.providerPluginDiscovered = evidence.providerPluginDiscovered;
    this.#state.providerPluginActivated = evidence.providerPluginActivated;
    this.#state.observedPlayerClient = evidence.observedPlayerClient;
    this.#state.ejsActualUse = evidence.ejsActualUse;
    this.#state.jsChallengeObserved = evidence.jsChallengeObserved;
    this.#state.formatEnumerationObserved = evidence.formatEnumerationObserved;
    this.#state.mediaRequestObserved = evidence.mediaRequestObserved;
    this.#state.mediaBytesObserved = evidence.mediaBytesObserved;
    this.#state.tokenContext = evidence.tokenContext;
    this.#state.tokenRetrievedByYtDlp = evidence.tokenRetrievedByYtDlp;
    this.#state.tokenAttachedToOutboundRequest = evidence.tokenAttachedToOutboundRequest;
    this.#state.tokenConsumedByYtDlp = "UNKNOWN";
    this.#state.botCheckRelativeToTokenRetrieval = evidence.botCheckRelativeToTokenRetrieval;
    this.#state.botCheckRelativeToTokenAttachment = evidence.botCheckRelativeToTokenAttachment;
    this.#state.gvsRequestReached = evidence.gvsRequestReached;
    this.#state.mediaRequestReached = evidence.mediaRequestReached;
    this.#state.selectedTransport = evidence.selectedTransport;
    this.#state.hlsManifestReached = evidence.hlsManifestReached;
    this.#state.hlsFragmentReached = evidence.hlsFragmentReached;
    this.#state.http403Stage = evidence.http403Stage;
    const legacyStages = {
      PRE_EXTERNAL_REQUEST: "PRE_EXTERNAL_REQUEST_LEXICAL", PLAYER_RESPONSE: "PLAYER_RESPONSE_LEXICAL",
      GVS_RESPONSE: "GVS_RESPONSE_LEXICAL", MEDIA_RESPONSE: "MEDIA_RESPONSE_LEXICAL", EXTRACTOR: "EXTRACTOR_LEXICAL",
    } as const;
    const botCheckEvidenceStage = evidence.botCheckEvidenceStage in legacyStages
      ? legacyStages[evidence.botCheckEvidenceStage as keyof typeof legacyStages] : evidence.botCheckEvidenceStage;
    this.#state.botCheckEvidenceStage = botCheckEvidenceStage;
    this.#state.botCheckEvidenceKind = evidence.botCheckEvidenceKind
      ?? (botCheckEvidenceStage === "UNKNOWN" ? "UNKNOWN" : "LEXICAL");
    this.#state.postRetrievalExternalRequestStage = evidence.postRetrievalExternalRequestStage ?? "UNKNOWN";
    if (botCheckEvidenceStage === "EXTRACTOR_LEXICAL") this.#state.failureStage = "EXTRACTOR";
    this.#state.externalRequestStageReached = evidence.gvsRequestReached === "YES" || evidence.mediaRequestReached === "YES"
      ? "YES" : "UNKNOWN";
  }
  processTerminated(): void {
    this.#state.ytDlpProcessTerminated = "YES";
    this.#deriveClosedProviderFacts();
  }
  #deriveClosedProviderFacts(): void {
    this.#state.extractorTerminatedBeforeProviderRequest = "UNKNOWN";
    const complete = this.#state.providerRequestObservationCoverage === "COMPLETE";
    const zero = this.#state.providerRequestCount === "ZERO";
    this.#state.extractorTerminatedWithoutObservedProviderRequest = this.#state.ytDlpProcessTerminated === "YES"
      && this.#state.botCheckEvidenceStage === "EXTRACTOR_LEXICAL" && complete && zero ? "YES"
      : this.#state.providerRequestCount === "ONE" || this.#state.providerRequestCount === "MULTIPLE" ? "NO" : "UNKNOWN";
    if (complete && zero) this.#state.providerRequestTemporalRelation = "NOT_OBSERVED";
    if (complete && zero) {
      this.#state.providerResponseObserved = "UNKNOWN";
      this.#state.providerResponseSchemaOutcome = "NOT_OBSERVED";
    }
  }
  failure(code: AcquisitionFailureCode): void { this.#state.safeFailureCode = code; }
  snapshot(): AcquisitionSafeTelemetry { return validateAcquisitionSafeTelemetry(this.#state); }
}
