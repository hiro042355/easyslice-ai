import { classifyUrl } from "./urlAcquisition/classifyUrl";

export type UrlSource = "youtube" | "tiktok" | "instagram" | "x" | "unknown";

export function detectUrlSource(url: string): UrlSource {
  const value = url.trim();

  if (!value) {
    return "unknown";
  }

  const classification = classifyUrl(value);
  if (classification.kind === "SUPPORTED_YOUTUBE") {
    return "youtube";
  }
  if (classification.kind === "SUPPORTED_TIKTOK" || classification.kind === "UNSUPPORTED_TIKTOK") {
    return "tiktok";
  }

  try {
    const normalizedUrl =
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`;
    const hostname = new URL(normalizedUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
      return "tiktok";
    }

    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
      return "instagram";
    }

    if (hostname === "x.com" || hostname.endsWith(".x.com")) {
      return "x";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}
