import type { Sensitive } from "@/lib/assets/types";
import type { OutputContentHandle, ProviderOutputAccess, ProviderOutputFetcher, ProviderOutputFetchInput, ProviderOutputFetchResult, ProviderOutputMetadata } from "./types";
import { deepCopy, deepFreeze } from "./outputIngestionUtils";

type Fixture = { contentRef: string; metadata: ProviderOutputMetadata } | { error: "expired" | "timeout" | "failed" };
const hashes = { vocal: "1".repeat(64), music: "2".repeat(64), video: "3".repeat(64), image: "4".repeat(64) } as const;
const fixtures = deepFreeze<Record<string, Fixture>>({
  "ref-vocal": { contentRef: "content-vocal", metadata: { mimeType: "audio/wav", fetchContentType: "audio/wav", sizeBytes: 48_000, contentLength: 48_000, providerChecksum: hashes.vocal, durationSeconds: 10, codec: "pcm", container: "wav", contentEncoding: "identity" } },
  "ref-music": { contentRef: "content-music", metadata: { mimeType: "audio/mpeg", fetchContentType: "audio/mpeg", sizeBytes: 96_000, contentLength: 96_000, providerChecksum: hashes.music, durationSeconds: 20, codec: "mp3", container: "mp3", contentEncoding: "identity" } },
  "ref-video": { contentRef: "content-video", metadata: { mimeType: "video/mp4", fetchContentType: "video/mp4", sizeBytes: 192_000, contentLength: 192_000, providerChecksum: hashes.video, durationSeconds: 30, width: 1920, height: 1080, codec: "h264", container: "mp4", contentEncoding: "identity" } },
  "ref-image": { contentRef: "content-image", metadata: { mimeType: "image/png", fetchContentType: "image/png", sizeBytes: 24_000, contentLength: 24_000, providerChecksum: hashes.image, width: 1024, height: 1024, codec: "png", container: "png", contentEncoding: "identity" } },
  "ref-expired": { error: "expired" }, "ref-timeout": { error: "timeout" }, "ref-unavailable": { error: "failed" },
});

export class ReferenceOutputFetcher implements ProviderOutputFetcher {
  async fetch(input: ProviderOutputFetchInput): Promise<ProviderOutputFetchResult> {
    const reference = (input.access as ProviderOutputAccess & { reference: string }).reference;
    const fixture = fixtures[reference];
    if (!fixture || "error" in fixture) {
      const error = fixture && "error" in fixture ? fixture.error : "failed";
      return { status: "failed", error: { category: error === "expired" ? "reference-expired" : error === "timeout" ? "fetch-timeout" : "fetch-failed", retryable: error !== "expired" } };
    }
    if ((fixture.metadata.sizeBytes ?? 0) > input.maximumBytes) return { status: "failed", error: { category: "payload-too-large", retryable: false } };
    const content = { handleVersion: "1.0", contentRef: fixture.contentRef } as Sensitive<{ handleVersion: "1.0"; contentRef: string }> as OutputContentHandle;
    return deepCopy({ status: "fetched", content, metadata: fixture.metadata });
  }
}
