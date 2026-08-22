import { createYouTubeAcquisitionArguments } from "../youtubeIngestion";
import { YtDlpProcessFailure, type YtDlpProcessFailureReason } from "../packagedYtDlp";
import { nodeJsRuntimeArgument } from "./runtime";
import { AcquisitionWorkerFailure, type AcquisitionFailureCode } from "./types";
import type { SourceAdapter, SourceAcquisitionContext } from "./sourceAdapter";
import type { AcquisitionTelemetryCollector } from "./telemetry";

export type AcquisitionProcessRunner = (
  args: readonly string[],
  options: Readonly<{ timeoutMs: number; signal?: AbortSignal; telemetry?: AcquisitionTelemetryCollector }>,
) => Promise<void>;

const PROCESS_FAILURE_MAP: Readonly<Partial<Record<YtDlpProcessFailureReason, AcquisitionFailureCode>>> = Object.freeze({
  "youtube-bot-check": "youtube-bot-check",
  "youtube-sign-in-required": "youtube-sign-in-required",
  "video-unavailable": "video-unavailable",
  "private-video": "private-video",
  "age-restricted": "age-restricted",
  "region-restricted": "region-restricted",
  "live-stream-unsupported": "live-stream-unsupported",
  "playlist-unsupported": "playlist-unsupported",
  "format-unavailable": "format-unavailable",
  "network-failure": "network-failure",
  "yt-dlp-timeout": "acquisition-timeout",
  "yt-dlp-cancelled": "acquisition-cancelled",
});

export const createYouTubeWorkerArguments = (context: SourceAcquisitionContext): readonly string[] => Object.freeze([
  "--no-js-runtimes",
  "--js-runtimes", nodeJsRuntimeArgument(context.runtime.nodeExecutable),
  "--extractor-args", "youtube:player_client=mweb",
  ...(context.provider?.ytDlpArguments() ?? []),
  ...createYouTubeAcquisitionArguments(context.request.sourceUrl, context.workspace.mediaPath),
]);

export class YouTubeSourceAdapter implements SourceAdapter {
  readonly source = "youtube" as const;

  constructor(private readonly run: AcquisitionProcessRunner) {}

  supports(request: SourceAcquisitionContext["request"]): boolean {
    return request.source === this.source;
  }

  async acquire(context: SourceAcquisitionContext): Promise<void> {
    if (context.provider) {
      const providerStatus = await context.provider.status(context.signal);
      context.telemetry?.providerHealth(providerStatus === "available");
      if (providerStatus === "unavailable") throw new AcquisitionWorkerFailure("po-token-provider-unavailable", true);
      if (providerStatus === "failed") throw new AcquisitionWorkerFailure("po-token-provider-failed", true);
    }
    try {
      const execute = () => this.run(createYouTubeWorkerArguments(context), {
        timeoutMs: context.request.timeoutMs, signal: context.signal, telemetry: context.telemetry,
      });
      await (context.provider?.observe && context.telemetry
        ? context.provider.observe(context.telemetry, execute)
        : execute());
    } catch (error) {
      if (error instanceof AcquisitionWorkerFailure) throw error;
      if (error instanceof YtDlpProcessFailure) {
        if (error.diagnostic.closedStageTelemetry) {
          context.telemetry?.processEvidence(error.diagnostic.closedStageTelemetry);
        }
        throw new AcquisitionWorkerFailure(PROCESS_FAILURE_MAP[error.reason] ?? "unknown-acquisition-failure",
          ["network-failure", "yt-dlp-timeout"].includes(error.reason));
      }
      throw new AcquisitionWorkerFailure("unknown-acquisition-failure");
    }
  }
}
