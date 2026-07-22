import type { ContentInspectionResult, ContentInspector, OutputContentHandle, ProviderOutputMetadata } from "./types";
import { deepCopy, deepFreeze } from "./outputIngestionUtils";

const metadata = deepFreeze<Record<string, ProviderOutputMetadata>>({
  "content-vocal": { mimeType: "audio/wav", sizeBytes: 48_000, durationSeconds: 10, codec: "pcm", container: "wav" },
  "content-music": { mimeType: "audio/mpeg", sizeBytes: 96_000, durationSeconds: 20, codec: "mp3", container: "mp3" },
  "content-video": { mimeType: "video/mp4", sizeBytes: 192_000, durationSeconds: 30, width: 1920, height: 1080, codec: "h264", container: "mp4" },
  "content-image": { mimeType: "image/png", sizeBytes: 24_000, width: 1024, height: 1024, codec: "png", container: "png" },
});
const checksums = deepFreeze<Record<string, string>>({ "content-vocal": "1".repeat(64), "content-music": "2".repeat(64), "content-video": "3".repeat(64), "content-image": "4".repeat(64) });

export class ReferenceContentInspector implements ContentInspector {
  async inspect(content: OutputContentHandle): Promise<ContentInspectionResult> {
    const value = metadata[content.contentRef];
    if (!value || value.sizeBytes === undefined || value.mimeType === undefined) return { status: "failed", error: { category: "content-corrupted", retryable: false } };
    return deepCopy({ status: "inspected", actualSizeBytes: value.sizeBytes, computedChecksum: checksums[content.contentRef], detectedMimeType: value.mimeType, corrupted: false, partial: false, metadata: value });
  }
}
