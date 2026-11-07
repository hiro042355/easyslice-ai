import { classifyUrl } from "./classifyUrl";
import type { SupportedTikTokUrl } from "./types";

const ALLOWED_REDIRECT_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

export type RedirectResolutionResult =
  | Readonly<{ status: "resolved"; canonicalUrl: string; classification: SupportedTikTokUrl }>
  | Readonly<{ status: "not_tiktok"; reason: string }>
  | Readonly<{ status: "unsupported"; reason: string }>
  | Readonly<{ status: "network_error"; reason: string }>;

export async function resolveSafeTikTokRedirect(
  shortUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<RedirectResolutionResult> {
  let parsed: URL;
  try {
    parsed = new URL(shortUrl);
  } catch {
    return { status: "unsupported", reason: "invalid_url" };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_REDIRECT_HOSTS.has(host) || parsed.protocol !== "https:") {
    return { status: "not_tiktok", reason: "disallowed_host_or_scheme" };
  }

  try {
    // Perform HEAD request without following redirects automatically to avoid SSRF
    const response = await fetchFn(shortUrl, {
      method: "HEAD",
      redirect: "manual",
    });

    const location = response.headers.get("location");
    if (!location) {
      // If no location header, inspect the original url directly
      const currentClassification = classifyUrl(shortUrl);
      if (currentClassification.kind === "SUPPORTED_TIKTOK") {
        return {
          status: "resolved",
          canonicalUrl: currentClassification.normalizedUrl,
          classification: currentClassification,
        };
      }
      return { status: "unsupported", reason: "no_redirect_location" };
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(location, parsed.origin);
    } catch {
      return { status: "unsupported", reason: "invalid_redirect_target" };
    }

    const targetHost = targetUrl.hostname.toLowerCase();
    if (!ALLOWED_REDIRECT_HOSTS.has(targetHost) || targetUrl.protocol !== "https:") {
      return { status: "not_tiktok", reason: "redirect_target_disallowed" };
    }

    const classification = classifyUrl(targetUrl.toString());
    if (classification.kind === "SUPPORTED_TIKTOK") {
      return {
        status: "resolved",
        canonicalUrl: classification.normalizedUrl,
        classification,
      };
    }

    return { status: "unsupported", reason: "target_not_supported_video" };
  } catch (error) {
    return {
      status: "network_error",
      reason: error instanceof Error ? error.message : "network_failure",
    };
  }
}
