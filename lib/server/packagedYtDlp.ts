import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { resolvePackagedFfmpeg } from "./packagedFfmpeg";

export const PACKAGED_YT_DLP_VERSION = "2026.03.13" as const;
const OUTPUT_LIMIT_BYTES = 64 * 1024;

export type YtDlpProcessFailureReason =
  | "yt-dlp-missing"
  | "yt-dlp-not-executable"
  | "yt-dlp-spawn-failed"
  | "yt-dlp-timeout"
  | "yt-dlp-cancelled"
  | "yt-dlp-output-limit"
  | "yt-dlp-exit-failed"
  | "youtube-sign-in-required"
  | "youtube-bot-check"
  | "video-unavailable"
  | "private-video"
  | "age-restricted"
  | "region-restricted"
  | "live-stream-unsupported"
  | "playlist-unsupported"
  | "format-unavailable"
  | "ffmpeg-unavailable"
  | "network-failure"
  | "extractor-failure"
  | "permission-failure"
  | "output-path-failure"
  | "unknown-yt-dlp-failure"
  | "yt-dlp-version-mismatch";

export type YtDlpClosedStageTelemetry = Readonly<{
  stderrCaptureComplete: "YES" | "NO" | "UNKNOWN";
  providerPluginDiscovered: "YES" | "UNKNOWN";
  providerPluginActivated: "YES" | "UNKNOWN";
  observedPlayerClient: "WEB" | "MWEB" | "OTHER" | "UNKNOWN";
  ejsActualUse: "YES" | "UNKNOWN";
  jsChallengeObserved: "YES" | "UNKNOWN";
  formatEnumerationObserved: "YES" | "UNKNOWN";
  mediaRequestObserved: "YES" | "UNKNOWN";
  mediaBytesObserved: "YES" | "UNKNOWN";
  tokenContext: "GVS" | "PLAYER" | "SUBS" | "UNKNOWN";
  tokenRetrievedByYtDlp: "YES" | "UNKNOWN";
  tokenAttachedToOutboundRequest: "UNKNOWN";
  tokenConsumedByYtDlp: "YES" | "NO" | "UNKNOWN";
  botCheckRelativeToTokenRetrieval: "BEFORE_RETRIEVAL" | "AFTER_RETRIEVAL" | "UNKNOWN";
  botCheckRelativeToTokenAttachment: "UNKNOWN";
  gvsRequestReached: "YES" | "NO" | "UNKNOWN";
  mediaRequestReached: "YES" | "NO" | "UNKNOWN";
  selectedTransport: "HLS" | "DIRECT" | "DASH" | "UNKNOWN";
  hlsManifestReached: "YES" | "NO" | "UNKNOWN";
  hlsFragmentReached: "YES" | "NO" | "UNKNOWN";
  http403Stage: "PLAYER" | "GVS" | "MEDIA" | "HLS_MANIFEST" | "HLS_FRAGMENT" | "UNKNOWN";
  botCheckEvidenceStage: "PRE_EXTERNAL_REQUEST_LEXICAL" | "PLAYER_RESPONSE_LEXICAL" | "GVS_RESPONSE_LEXICAL" | "MEDIA_RESPONSE_LEXICAL" | "EXTRACTOR_LEXICAL" | "UNKNOWN";
  botCheckEvidenceKind: "LEXICAL" | "UNKNOWN";
  postRetrievalExternalRequestStage: "PLAYER_API" | "GVS_ERROR" | "MEDIA" | "HLS_MANIFEST" | "HLS_FRAGMENT" | "UNKNOWN";
}>;

const EMPTY_CLOSED_STAGE_TELEMETRY: YtDlpClosedStageTelemetry = Object.freeze({
  stderrCaptureComplete: "UNKNOWN",
  providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
  ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
  mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN",
  tokenContext: "UNKNOWN", tokenRetrievedByYtDlp: "UNKNOWN", tokenAttachedToOutboundRequest: "UNKNOWN",
  tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
  botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "UNKNOWN",
  mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
  hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN",
  botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
  postRetrievalExternalRequestStage: "UNKNOWN",
});

export const YT_DLP_BOUNDED_EVENTS = [
  "TOKEN_RETRIEVED", "PLAYER_API", "GVS_ERROR", "MEDIA", "HLS_MANIFEST", "HLS_FRAGMENT",
] as const;
export type YtDlpBoundedEvent = (typeof YT_DLP_BOUNDED_EVENTS)[number];

const TOKEN_RETRIEVED_LINE = /\bretrieved\s+(?:a\s+)?(?:gvs|player|subs)\s+po token for\s+[0-9A-Za-z_-]+\s+client\b/i;
const classifyBoundedExternalEvent = (line: string): Exclude<YtDlpBoundedEvent, "TOKEN_RETRIEVED"> | undefined => {
  if (/^\s*\[youtube\]\s+\S+:\s+Downloading\s+mweb\s+player API JSON\s*$/i.test(line)) return "PLAYER_API";
  if (/^\s*ERROR:\s+gvs request:\s+HTTP Error 403(?:\s|$)/i.test(line)) return "GVS_ERROR";
  if (/^\s*\[download\]\s+Destination:/i.test(line)) return "MEDIA";
  if (/^\s*(?:\[youtube\]\s+\S+:\s+)?Downloading\s+m3u8 information\s*$/i.test(line)
    || /^\s*\[hlsnative\]\s+Downloading\s+m3u8 manifest\s*$/i.test(line)) return "HLS_MANIFEST";
  if (/^\s*(?:ERROR:\s+)?(?:HLS\s+)?fragment\s+\d+[^\r\n]*HTTP Error 403\s*$/i.test(line)) return "HLS_FRAGMENT";
  return undefined;
};

export const createYtDlpBoundedEventProjector = () => {
  let retrievalCount = 0;
  const postRetrievalStages = new Set<Exclude<YtDlpBoundedEvent, "TOKEN_RETRIEVED">>();
  return Object.freeze({
    observeLine(line: string): void {
      if (TOKEN_RETRIEVED_LINE.test(line)) {
        retrievalCount += 1;
        return;
      }
      if (retrievalCount !== 1) return;
      const event = classifyBoundedExternalEvent(line);
      if (event) postRetrievalStages.add(event);
    },
    snapshot(captureComplete?: boolean): Readonly<{
      tokenRetrievedByYtDlp: "YES" | "UNKNOWN";
      postRetrievalExternalRequestStage: YtDlpClosedStageTelemetry["postRetrievalExternalRequestStage"];
      stderrCaptureComplete: YtDlpClosedStageTelemetry["stderrCaptureComplete"];
    }> {
      const stderrCaptureComplete = captureComplete === true ? "YES" : captureComplete === false ? "NO" : "UNKNOWN";
      const postRetrievalExternalRequestStage = captureComplete === false || retrievalCount !== 1
        || postRetrievalStages.size !== 1 ? "UNKNOWN" : [...postRetrievalStages][0]!;
      return Object.freeze({
        tokenRetrievedByYtDlp: retrievalCount === 1 ? "YES" : "UNKNOWN",
        postRetrievalExternalRequestStage,
        stderrCaptureComplete,
      });
    },
  });
};

export type YtDlpFailureDiagnostic = Readonly<{
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  stdoutLimitExceeded: boolean;
  stderrLimitExceeded: boolean;
  stderrSignature: YtDlpStderrSignature;
  closedStageTelemetry?: YtDlpClosedStageTelemetry;
}>;

export type YtDlpStderrKeywordFlags = Readonly<{
  error: boolean;
  warning: boolean;
  httpError: boolean;
  unable: boolean;
  failed: boolean;
  requestedFormat: boolean;
  extractor: boolean;
  signature: boolean;
  javascript: boolean;
  nsig: boolean;
  player: boolean;
  remoteComponents: boolean;
  ffmpeg: boolean;
  merge: boolean;
  write: boolean;
  permission: boolean;
  network: boolean;
  http403: boolean;
  http429: boolean;
  http5xx: boolean;
}>;

export type YtDlpStderrSignature = Readonly<{
  lineCount: number;
  prefix: "empty" | "error" | "warning" | "other";
  beginsWithYtDlpError: boolean;
  multipleErrorLines: boolean;
  warningBeforeError: boolean;
  keywords: YtDlpStderrKeywordFlags;
}>;

export type SafeYtDlpFailureLog = Readonly<{
  event: "youtube-ingest-yt-dlp-failure";
  errorCode: YtDlpProcessFailureReason;
  runtimeVersionMatch: boolean;
  exitCode: number | null;
  signal: string | null;
  stderrLineCount: number;
  errorPrefixPresent: boolean;
  warningPrefixPresent: boolean;
  timedOut: boolean;
  aborted: boolean;
  stdoutLimitExceeded: boolean;
  stderrLimitExceeded: boolean;
  hasError: boolean;
  hasWarning: boolean;
  hasHttpError: boolean;
  hasUnable: boolean;
  hasFailed: boolean;
  hasRequestedFormat: boolean;
  hasExtractor: boolean;
  hasSignature: boolean;
  hasJavascript: boolean;
  hasNsig: boolean;
  hasPlayer: boolean;
  hasRemoteComponents: boolean;
  hasFfmpeg: boolean;
  hasMerge: boolean;
  hasWrite: boolean;
  hasPermission: boolean;
  hasNetwork: boolean;
  has403: boolean;
  has429: boolean;
  has5xx: boolean;
}>;

const EMPTY_STDERR_KEYWORDS: YtDlpStderrKeywordFlags = Object.freeze({
  error: false,
  warning: false,
  httpError: false,
  unable: false,
  failed: false,
  requestedFormat: false,
  extractor: false,
  signature: false,
  javascript: false,
  nsig: false,
  player: false,
  remoteComponents: false,
  ffmpeg: false,
  merge: false,
  write: false,
  permission: false,
  network: false,
  http403: false,
  http429: false,
  http5xx: false,
});

const EMPTY_STDERR_SIGNATURE: YtDlpStderrSignature = Object.freeze({
  lineCount: 0,
  prefix: "empty",
  beginsWithYtDlpError: false,
  multipleErrorLines: false,
  warningBeforeError: false,
  keywords: EMPTY_STDERR_KEYWORDS,
});

const EMPTY_FAILURE_DIAGNOSTIC: YtDlpFailureDiagnostic = Object.freeze({
  exitCode: null,
  signal: null,
  timedOut: false,
  aborted: false,
  stdoutLimitExceeded: false,
  stderrLimitExceeded: false,
  stderrSignature: EMPTY_STDERR_SIGNATURE,
  closedStageTelemetry: EMPTY_CLOSED_STAGE_TELEMETRY,
});

export const extractClosedYtDlpStageTelemetry = (
  stderr: string,
  options: Readonly<{ outputComplete?: boolean }> = {},
): YtDlpClosedStageTelemetry => {
  const lines = stderr.split(/\r?\n/);
  const boundedEvents = createYtDlpBoundedEventProjector();
  for (const line of lines) boundedEvents.observeLine(line);
  const boundedSnapshot = boundedEvents.snapshot(options.outputComplete);
  const providerListLine = lines.find((line) => /^\s*\[debug\]\s+\[youtube\]\s+\[pot\]\s+(?:TRACE:\s+)?PO Token Providers:/i.test(line));
  const providerPluginDiscovered = providerListLine
    ? /\bbgutil:http(?:-[0-9A-Za-z._-]+)?\s+\(external\)(?:\s*,|\s*$)/i.test(providerListLine)
    : false;
  const tokenEventPattern = /\b(?:generating|requesting|retrieved)\s+(?:a\s+)?(gvs|player|subs)\s+po token for\s+([0-9A-Za-z_-]+)\s+client\b/i;
  const requestIndex = lines.findIndex((line) => /\b(?:generating|requesting)\s+(?:a\s+)?(?:gvs|player|subs)\s+po token for\s+[0-9A-Za-z_-]+\s+client\b/i.test(line));
  const retrievalIndexes = lines.flatMap((line, index) =>
    /\bretrieved\s+(?:a\s+)?(?:gvs|player|subs)\s+po token for\s+[0-9A-Za-z_-]+\s+client\b/i.test(line) ? [index] : []);
  const retrievalIndex = retrievalIndexes.length === 1 ? retrievalIndexes[0]! : -1;
  const eventLine = retrievalIndex >= 0 ? lines[retrievalIndex] : requestIndex >= 0 ? lines[requestIndex] : undefined;
  const eventMatch = eventLine?.match(tokenEventPattern);
  const context = eventMatch?.[1]?.toUpperCase() as YtDlpClosedStageTelemetry["tokenContext"] | undefined;
  const rawClient = eventMatch?.[2]?.toLowerCase();
  const observedPlayerClient = rawClient === "mweb" ? "MWEB" : rawClient === "web" ? "WEB"
    : rawClient ? "OTHER" : "UNKNOWN";
  const player403 = /player[^\r\n]*http error 403|http error 403[^\r\n]*player/i.test(stderr);
  const gvs403 = /gvs[^\r\n]*http error 403|http error 403[^\r\n]*gvs/i.test(stderr);
  const hlsManifestMarker = /(?:downloading|downloaded|extracting)[^\r\n]*(?:m3u8|hls)[^\r\n]*(?:manifest|information)|(?:m3u8|hls)[^\r\n]*(?:manifest|information)/i.test(stderr);
  const hlsFragmentMarker = /\[hlsnative\]|(?:downloading|downloaded)[^\r\n]*hls[^\r\n]*fragment|fragment\s+\d+/i.test(stderr);
  const hlsManifest403 = /(?:m3u8|hls)[^\r\n]*(?:manifest|information)[^\r\n]*403|403[^\r\n]*(?:m3u8|hls)[^\r\n]*(?:manifest|information)/i.test(stderr);
  const hlsFragment403 = /(?:hls[^\r\n]*)?fragment[^\r\n]*403|403[^\r\n]*(?:hls[^\r\n]*)?fragment/i.test(stderr);
  const dashMarker = /\[dashsegments\]|downloading[^\r\n]*(?:mpd|dash)[^\r\n]*manifest|http_dash_segments/i.test(stderr);
  const directMarker = /invoking\s+http\s+downloader|unable to download video data|downloading\s+video\s+format/i.test(stderr);
  const selectedTransport = hlsManifestMarker || hlsFragmentMarker || hlsManifest403 || hlsFragment403
    ? "HLS" : dashMarker ? "DASH" : directMarker ? "DIRECT" : "UNKNOWN";
  const media403 = !hlsFragment403 && /unable to download video data[^\r\n]*403|403[^\r\n]*video data/i.test(stderr);
  const mediaReached = media403 || hlsFragmentMarker || hlsFragment403 || /\[download\]\s+destination:|downloading\s+video\s+format/i.test(stderr);
  const providerPluginActivated = requestIndex >= 0 || retrievalIndex >= 0;
  const ejsActualUse = /(?:executing|solving|using)[^\r\n]*(?:\bejs\b|external javascript)/i.test(stderr);
  const jsChallengeObserved = /\b(?:js|javascript)\s+challenge\b/i.test(stderr);
  const formatEnumerationObserved = /(?:enumerating|available)\s+(?:video\s+)?formats?|format\s+code\s+extension/i.test(stderr);
  const mediaBytesObserved = /\[download\]\s+(?:[1-9]\d*(?:\.\d+)?%|[1-9]\d*\s+bytes?\b)|downloaded\s+[1-9]\d*\s+bytes?\b/i.test(stderr);
  const botCheck = /confirm you(?:'|’)re not a bot|sign in to confirm you(?:'|’)re not a bot/i;
  const botCheckIndex = lines.findIndex((line) => botCheck.test(line));
  const botCheckLine = botCheckIndex >= 0 ? lines[botCheckIndex] : undefined;
  const botCheckRelativeToTokenRetrieval = botCheckIndex < 0 || retrievalIndex < 0 ? "UNKNOWN"
    : botCheckIndex < retrievalIndex ? "BEFORE_RETRIEVAL" : "AFTER_RETRIEVAL";
  const botCheckEvidenceStage = !botCheckLine ? "UNKNOWN"
    : /before (?:the )?(?:first )?(?:external|youtube) request/i.test(botCheckLine) ? "PRE_EXTERNAL_REQUEST_LEXICAL"
      : /player[^\r\n]*(?:response|request)/i.test(botCheckLine) ? "PLAYER_RESPONSE_LEXICAL"
        : /gvs[^\r\n]*(?:response|request)/i.test(botCheckLine) ? "GVS_RESPONSE_LEXICAL"
          : /(?:media|video data)[^\r\n]*(?:response|request)|(?:response|request)[^\r\n]*(?:media|video data)/i.test(botCheckLine) ? "MEDIA_RESPONSE_LEXICAL"
            : /\[youtube(?::[^\]]+)?\]|extractor/i.test(botCheckLine) ? "EXTRACTOR_LEXICAL" : "UNKNOWN";
  const http403Stage = player403 ? "PLAYER" : gvs403 ? "GVS" : hlsManifest403 ? "HLS_MANIFEST"
    : hlsFragment403 ? "HLS_FRAGMENT" : media403 ? "MEDIA" : "UNKNOWN";
  return Object.freeze({
    stderrCaptureComplete: boundedSnapshot.stderrCaptureComplete,
    providerPluginDiscovered: providerPluginDiscovered ? "YES" : "UNKNOWN",
    providerPluginActivated: providerPluginActivated ? "YES" : "UNKNOWN",
    observedPlayerClient,
    ejsActualUse: ejsActualUse ? "YES" : "UNKNOWN",
    jsChallengeObserved: jsChallengeObserved ? "YES" : "UNKNOWN",
    formatEnumerationObserved: formatEnumerationObserved ? "YES" : "UNKNOWN",
    mediaRequestObserved: mediaReached ? "YES" : "UNKNOWN",
    mediaBytesObserved: mediaBytesObserved ? "YES" : "UNKNOWN",
    tokenContext: context ?? "UNKNOWN",
    tokenRetrievedByYtDlp: retrievalIndex >= 0 ? "YES" : "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN",
    botCheckRelativeToTokenRetrieval,
    botCheckRelativeToTokenAttachment: "UNKNOWN",
    gvsRequestReached: gvs403 || mediaReached ? "YES" : "UNKNOWN",
    mediaRequestReached: mediaReached ? "YES" : "UNKNOWN",
    selectedTransport,
    hlsManifestReached: hlsManifestMarker || hlsFragmentMarker || hlsFragment403 ? "YES" : "UNKNOWN",
    hlsFragmentReached: hlsFragmentMarker || hlsFragment403 ? "YES" : "UNKNOWN",
    http403Stage,
    botCheckEvidenceStage,
    botCheckEvidenceKind: botCheckEvidenceStage === "UNKNOWN" ? "UNKNOWN" : "LEXICAL",
    postRetrievalExternalRequestStage: boundedSnapshot.postRetrievalExternalRequestStage,
  });
};

export class YtDlpProcessFailure extends Error {
  readonly diagnostic: YtDlpFailureDiagnostic;

  constructor(
    readonly reason: YtDlpProcessFailureReason,
    diagnostic: YtDlpFailureDiagnostic = EMPTY_FAILURE_DIAGNOSTIC,
  ) {
    super(reason);
    this.name = "YtDlpProcessFailure";
    this.diagnostic = Object.freeze({ ...diagnostic });
  }
}

export const createSafeYtDlpFailureLog = (
  error: YtDlpProcessFailure,
  runtimeVersionMatch: boolean,
): SafeYtDlpFailureLog => {
  const { stderrSignature } = error.diagnostic;
  const { keywords } = stderrSignature;
  return Object.freeze({
    event: "youtube-ingest-yt-dlp-failure",
    errorCode: error.reason,
    runtimeVersionMatch,
    exitCode: error.diagnostic.exitCode,
    signal: error.diagnostic.signal,
    stderrLineCount: stderrSignature.lineCount,
    errorPrefixPresent: stderrSignature.prefix === "error",
    warningPrefixPresent: stderrSignature.prefix === "warning",
    timedOut: error.diagnostic.timedOut,
    aborted: error.diagnostic.aborted,
    stdoutLimitExceeded: error.diagnostic.stdoutLimitExceeded,
    stderrLimitExceeded: error.diagnostic.stderrLimitExceeded,
    hasError: keywords.error,
    hasWarning: keywords.warning,
    hasHttpError: keywords.httpError,
    hasUnable: keywords.unable,
    hasFailed: keywords.failed,
    hasRequestedFormat: keywords.requestedFormat,
    hasExtractor: keywords.extractor,
    hasSignature: keywords.signature,
    hasJavascript: keywords.javascript,
    hasNsig: keywords.nsig,
    hasPlayer: keywords.player,
    hasRemoteComponents: keywords.remoteComponents,
    hasFfmpeg: keywords.ffmpeg,
    hasMerge: keywords.merge,
    hasWrite: keywords.write,
    hasPermission: keywords.permission,
    hasNetwork: keywords.network,
    has403: keywords.http403,
    has429: keywords.http429,
    has5xx: keywords.http5xx,
  });
};

type YtDlpClassifiedExitReason = Exclude<YtDlpProcessFailureReason,
  | "yt-dlp-missing"
  | "yt-dlp-not-executable"
  | "yt-dlp-spawn-failed"
  | "yt-dlp-timeout"
  | "yt-dlp-cancelled"
  | "yt-dlp-output-limit"
  | "yt-dlp-exit-failed"
  | "yt-dlp-version-mismatch"
>;

const STDERR_CLASSIFIERS: readonly Readonly<{
  reason: YtDlpClassifiedExitReason;
  patterns: readonly RegExp[];
}>[] = Object.freeze([
  { reason: "youtube-bot-check", patterns: [/confirm you(?:'|’)re not a bot/i, /sign in to confirm you(?:'|’)re not a bot/i] },
  { reason: "youtube-sign-in-required", patterns: [/sign in to confirm your age/i, /this video may be inappropriate for some users/i, /sign in to view this video/i] },
  { reason: "private-video", patterns: [/private video/i, /members-only content/i] },
  { reason: "age-restricted", patterns: [/age[- ]restricted/i, /inappropriate for some users/i] },
  { reason: "region-restricted", patterns: [/not available in your country/i, /not available in your region/i, /geo(?:graphical)? restriction/i] },
  { reason: "live-stream-unsupported", patterns: [/premieres in/i, /live event will begin/i, /upcoming live/i] },
  { reason: "playlist-unsupported", patterns: [/playlist .* is not available/i, /unable to download playlist/i] },
  { reason: "format-unavailable", patterns: [/requested format is not available/i, /no video formats found/i] },
  { reason: "ffmpeg-unavailable", patterns: [/ffmpeg (?:is )?not found/i, /ffprobe (?:is )?not found/i, /ffmpeg-location.*does not exist/i] },
  { reason: "permission-failure", patterns: [/permission denied/i, /operation not permitted/i] },
  { reason: "output-path-failure", patterns: [/unable to open .* for writing/i, /no such file or directory.*youtube-source/i, /file name too long/i] },
  { reason: "network-failure", patterns: [/unable to download webpage/i, /network is unreachable/i, /temporary failure in name resolution/i, /connection (?:reset|refused|timed out)/i, /read timed out/i] },
  { reason: "extractor-failure", patterns: [/unable to extract/i, /extractor error/i, /nsig extraction failed/i, /signature extraction failed/i] },
  { reason: "video-unavailable", patterns: [/video unavailable/i, /this video has been removed/i, /video is no longer available/i] },
]);

export const classifyYtDlpStderr = (stderr: string): YtDlpClassifiedExitReason => {
  for (const classifier of STDERR_CLASSIFIERS) {
    if (classifier.patterns.some((pattern) => pattern.test(stderr))) return classifier.reason;
  }
  return "unknown-yt-dlp-failure";
};

export const extractSafeYtDlpStderrSignature = (stderr: string): YtDlpStderrSignature => {
  const normalized = stderr.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, "").trim();
  if (!normalized) return EMPTY_STDERR_SIGNATURE;
  const lines = normalized.split(/\r?\n/);
  const first = lines[0] ?? "";
  const errorLineIndexes = lines.flatMap((line, index) => /^\s*(?:yt-dlp\s+)?error\s*:/i.test(line) ? [index] : []);
  const warningLineIndexes = lines.flatMap((line, index) => /^\s*(?:yt-dlp\s+)?warning\s*:/i.test(line) ? [index] : []);
  const has = (pattern: RegExp) => pattern.test(normalized);
  const keywords: YtDlpStderrKeywordFlags = Object.freeze({
    error: has(/\berror\b/i),
    warning: has(/\bwarning\b/i),
    httpError: has(/http error/i),
    unable: has(/\bunable\b/i),
    failed: has(/\bfailed\b/i),
    requestedFormat: has(/requested format/i),
    extractor: has(/\bextractor\b/i),
    signature: has(/\bsignature\b/i),
    javascript: has(/\bjavascript\b/i),
    nsig: has(/\bnsig\b/i),
    player: has(/\bplayer\b/i),
    remoteComponents: has(/remote components?/i),
    ffmpeg: has(/\bffmpeg\b/i),
    merge: has(/\bmerg(?:e|ing)\b/i),
    write: has(/\bwrit(?:e|ing)\b/i),
    permission: has(/\bpermission\b/i),
    network: has(/\bnetwork\b/i),
    http403: has(/\b403\b/),
    http429: has(/\b429\b/),
    http5xx: has(/\b5\d{2}\b/),
  });
  const prefix = /^\s*(?:yt-dlp\s+)?error\s*:/i.test(first)
    ? "error"
    : /^\s*(?:yt-dlp\s+)?warning\s*:/i.test(first)
      ? "warning"
      : "other";
  return Object.freeze({
    lineCount: lines.length,
    prefix,
    beginsWithYtDlpError: /^\s*(?:yt-dlp\s+)?error\s*:/i.test(first),
    multipleErrorLines: errorLineIndexes.length > 1,
    warningBeforeError: warningLineIndexes.some((warningIndex) =>
      errorLineIndexes.some((errorIndex) => warningIndex < errorIndex)),
    keywords,
  });
};

export const packagedYtDlpTarget = (projectRoot = process.cwd()): string => path.join(
  projectRoot, "node_modules", ".nexcut-runtime", "yt-dlp", "yt-dlp",
);

export const resolvePackagedYtDlp = async (projectRoot = process.cwd()): Promise<string> => {
  const target = packagedYtDlpTarget(projectRoot);
  const targetStat = await stat(target).catch(() => undefined);
  if (!targetStat?.isFile() || targetStat.size === 0) throw new YtDlpProcessFailure("yt-dlp-missing");
  try {
    await access(target, constants.F_OK | constants.X_OK);
  } catch {
    throw new YtDlpProcessFailure("yt-dlp-not-executable");
  }
  return target;
};

export type YtDlpProcessResult = Readonly<{ stdout: string; stderr: string }>;
type YtDlpChildProcess = Readonly<{
  stdout: Readable;
  stderr: Readable;
  kill(signal: "SIGKILL"): boolean;
  once(event: "spawn", listener: () => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}>;
export type YtDlpSpawn = (
  executable: string,
  args: readonly string[],
  options: Readonly<{ shell: false; windowsHide: true; stdio: readonly ["ignore", "pipe", "pipe"] }>,
) => YtDlpChildProcess;

const spawnYtDlp: YtDlpSpawn = (executable, args, options) => spawn(
  executable,
  [...args],
  { ...options, stdio: ["ignore", "pipe", "pipe"] },
);

export const runPackagedYtDlp = async (
  args: readonly string[],
  options: Readonly<{
    timeoutMs: number;
    signal?: AbortSignal;
    projectRoot?: string;
    spawnImpl?: YtDlpSpawn;
    outputLimitBytes?: number;
    onSpawnStarted?: () => void;
    onProcessTerminated?: () => void;
  }>,
): Promise<YtDlpProcessResult> => {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new TypeError("invalid-yt-dlp-timeout");
  const outputLimit = options.outputLimitBytes ?? OUTPUT_LIMIT_BYTES;
  if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0) throw new TypeError("invalid-yt-dlp-output-limit");
  const executable = await resolvePackagedYtDlp(options.projectRoot);
  const ffmpeg = resolvePackagedFfmpeg(options.projectRoot);
  const child = (options.spawnImpl ?? spawnYtDlp)(executable, [
    "--ffmpeg-location", ffmpeg, ...args,
  ], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let terminationReason: YtDlpProcessFailureReason | undefined;
    let stdoutLimitExceeded = false;
    let stderrLimitExceeded = false;
    const boundedEvents = createYtDlpBoundedEventProjector();
    let projectedStderrCharacterOffset = 0;
    const observeRetainedStderr = (complete: boolean) => {
      const text = stderr.toString("utf8");
      const end = complete ? text.length : text.lastIndexOf("\n") + 1;
      if (end <= projectedStderrCharacterOffset) return;
      const lines = text.slice(projectedStderrCharacterOffset, end).split(/\r?\n/);
      if (!complete && lines.at(-1) === "") lines.pop();
      for (const line of lines) boundedEvents.observeLine(line);
      projectedStderrCharacterOffset = end;
    };
    const terminate = (reason: YtDlpProcessFailureReason) => {
      if (terminationReason) return;
      terminationReason = reason;
      child.kill("SIGKILL");
    };
    const diagnostic = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ): YtDlpFailureDiagnostic => Object.freeze({
      exitCode,
      signal,
      timedOut: terminationReason === "yt-dlp-timeout",
      aborted: terminationReason === "yt-dlp-cancelled",
      stdoutLimitExceeded,
      stderrLimitExceeded,
      stderrSignature: extractSafeYtDlpStderrSignature(stderr.toString("utf8")),
      closedStageTelemetry: Object.freeze({
        ...extractClosedYtDlpStageTelemetry(stderr.toString("utf8"), { outputComplete: !stderrLimitExceeded }),
        ...boundedEvents.snapshot(!stderrLimitExceeded),
      }),
    });
    const append = (current: Buffer, chunk: Buffer, stream: "stdout" | "stderr") => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > outputLimit) {
        if (stream === "stdout") stdoutLimitExceeded = true;
        else stderrLimitExceeded = true;
        terminate("yt-dlp-output-limit");
      }
      return next.subarray(0, outputLimit);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk, "stdout"); });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk, "stderr");
      observeRetainedStderr(false);
    });
    child.once("spawn", () => options.onSpawnStarted?.());
    child.once("error", () => {
      if (!settled) { settled = true; cleanup(); reject(new YtDlpProcessFailure("yt-dlp-spawn-failed")); }
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      observeRetainedStderr(true);
      cleanup();
      options.onProcessTerminated?.();
      const safeDiagnostic = diagnostic(code, signal);
      if (terminationReason) return reject(new YtDlpProcessFailure(terminationReason, safeDiagnostic));
      if (code !== 0) return reject(new YtDlpProcessFailure(classifyYtDlpStderr(stderr.toString("utf8")), safeDiagnostic));
      resolve(Object.freeze({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") }));
    });
    const onAbort = () => terminate("yt-dlp-cancelled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => terminate("yt-dlp-timeout"), options.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    if (options.signal?.aborted) onAbort();
  });
};

export const probePackagedYtDlpVersion = async (
  projectRoot?: string,
  spawnImpl?: YtDlpSpawn,
): Promise<typeof PACKAGED_YT_DLP_VERSION> => {
  const result = await runPackagedYtDlp(["--version"], { timeoutMs: 10_000, projectRoot, spawnImpl });
  if (result.stdout.trim() !== PACKAGED_YT_DLP_VERSION) throw new YtDlpProcessFailure("yt-dlp-version-mismatch");
  return PACKAGED_YT_DLP_VERSION;
};
