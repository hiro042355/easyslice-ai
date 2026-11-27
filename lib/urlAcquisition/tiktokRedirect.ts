import { classifyUrl } from "./classifyUrl";
import type { SupportedTikTokUrl } from "./types";

const ALLOWED_REDIRECT_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const MAX_REDIRECT_DEPTH = 3;
const DEFAULT_TIMEOUT_MS = 5000;

export type RedirectResolutionResult =
  | Readonly<{ status: "resolved"; canonicalUrl: string; classification: SupportedTikTokUrl }>
  | Readonly<{ status: "not_tiktok"; reason: string }>
  | Readonly<{ status: "unsupported"; reason: string }>
  | Readonly<{ status: "network_error"; reason: string }>;

export type RedirectResolutionOptions = Readonly<{
  fetchFn?: typeof fetch;
  maxRedirects?: number;
  timeoutMs?: number;
}>;

export async function resolveSafeTikTokRedirect(
  shortUrl: string,
  options: RedirectResolutionOptions = {}
): Promise<RedirectResolutionResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECT_DEPTH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = shortUrl;
  let redirectsFollowed = 0;

  while (redirectsFollowed <= maxRedirects) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { status: "unsupported", reason: "invalid_url" };
    }

    const host = parsed.hostname.toLowerCase();
    // Enforce HTTPS and strict allowlist on every hop (preventing localhost, RFC 1918, or non-TikTok hosts)
    if (!ALLOWED_REDIRECT_HOSTS.has(host) || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
      return { status: "not_tiktok", reason: "disallowed_host_or_scheme" };
    }

    // If current URL is already a supported video URL, resolve immediately without unnecessary network calls
    const immediateClassification = classifyUrl(currentUrl);
    if (immediateClassification.kind === "SUPPORTED_TIKTOK") {
      return {
        status: "resolved",
        canonicalUrl: immediateClassification.normalizedUrl,
        classification: immediateClassification,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      // Perform bounded HEAD request with manual redirect handling to prevent arbitrary SSRF or body downloading
      response = await fetchFn(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        status: "network_error",
        reason: error instanceof Error ? error.message : "network_failure",
      };
    } finally {
      clearTimeout(timeoutId);
    }

    const location = response.headers.get("location");
    if (!location) {
      return { status: "unsupported", reason: "no_redirect_location" };
    }

    let nextTargetUrl: URL;
    try {
      nextTargetUrl = new URL(location, parsed.origin);
    } catch {
      return { status: "unsupported", reason: "invalid_redirect_target" };
    }

    redirectsFollowed += 1;
    if (redirectsFollowed > maxRedirects) {
      return { status: "unsupported", reason: "too_many_redirects" };
    }

    currentUrl = nextTargetUrl.toString();
  }

  return { status: "unsupported", reason: "too_many_redirects" };
}
