import type { ContentSanitizationResult, ContentScanner, ContentScanResult, MediaSanitizer, OutputContentHandle } from "./types";
import { deepCopy } from "./outputIngestionUtils";

export class ReferenceScanner implements ContentScanner {
  async scan(content: OutputContentHandle): Promise<ContentScanResult> {
    if (content.contentRef.includes("pending")) return { status: "pending" };
    if (content.contentRef.includes("blocked")) return { status: "blocked" };
    if (content.contentRef.includes("quarantine")) return { status: "quarantined" };
    if (content.contentRef.includes("scan-failure")) return { status: "failed" };
    return { status: "passed" };
  }
}

export class ReferenceSanitizer implements MediaSanitizer {
  async sanitize(content: OutputContentHandle): Promise<ContentSanitizationResult> {
    return { status: "unchanged", content: deepCopy(content) };
  }
}
