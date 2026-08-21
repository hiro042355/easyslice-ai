import type { PoTokenProvider, PoTokenProviderStatus } from "./sourceAdapter";
import type { AcquisitionTelemetryCollector } from "./telemetry";

export const BGUTIL_PROVIDER_AUTHORITY = Object.freeze({
  name: "bgutil-ytdlp-pot-provider",
  version: "1.3.1",
  commit: "7608dd51ee813b48cf9a6d68c6e42cb197ce10e0",
  source: "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/tree/1.3.1",
  license: "GPL-3.0",
  executionModel: "sidecar-http",
} as const);

export class BgutilHttpPoTokenProvider implements PoTokenProvider {
  readonly authority = `${BGUTIL_PROVIDER_AUTHORITY.name}@${BGUTIL_PROVIDER_AUTHORITY.version}`;

  constructor(
    private readonly health: (signal?: AbortSignal) => Promise<boolean>,
    private readonly baseUrl = "http://127.0.0.1:4416",
    private readonly observeOperation?: <T>(collector: AcquisitionTelemetryCollector, operation: () => Promise<T>) => Promise<T>,
  ) {}

  ytDlpArguments(): readonly string[] {
    const url = new URL(this.baseUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password) {
      throw new TypeError("invalid-bgutil-provider-base-url");
    }
    return Object.freeze([
      "--extractor-args",
      `youtubepot-bgutilhttp:base_url=${url.origin}`,
    ]);
  }

  observe<T>(collector: AcquisitionTelemetryCollector, operation: () => Promise<T>): Promise<T> {
    return this.observeOperation ? this.observeOperation(collector, operation) : operation();
  }

  async status(signal?: AbortSignal): Promise<PoTokenProviderStatus> {
    try {
      return await this.health(signal) ? "available" : "unavailable";
    } catch {
      return "failed";
    }
  }
}
