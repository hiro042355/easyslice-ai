import type { UrlClassification } from "./types";

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const AUTHORIZED_YOUTUBE_HOSTS = new Set([...YOUTUBE_HOSTS, "youtu.be"]);

const TIKTOK_STANDARD_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const AUTHORIZED_TIKTOK_HOSTS = new Set([...TIKTOK_STANDARD_HOSTS, ...TIKTOK_SHORT_HOSTS]);

const TIKTOK_SNOWFLAKE_ID = /^\d{18,20}$/;
const TIKTOK_USERNAME = /^@[A-Za-z0-9_.-]+$/;

export const classifyUrl = (input: unknown): UrlClassification => {
  if (typeof input !== "string") return Object.freeze({ kind: "INVALID_INPUT" });
  if (input.length > 2048) return Object.freeze({ kind: "INVALID_INPUT" });
  if (!input) return Object.freeze({ kind: "INVALID_INPUT" });

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return Object.freeze({ kind: "INVALID_INPUT" });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Object.freeze({ kind: "INVALID_INPUT" });
  }

  const host = url.hostname.toLowerCase();

  // YouTube flow
  if (AUTHORIZED_YOUTUBE_HOSTS.has(host)) {
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      return Object.freeze({ kind: "UNSUPPORTED_YOUTUBE" });
    }

    let videoId = "";
    if (host === "youtu.be") {
      if (url.pathname.split("/").filter(Boolean).length === 1) videoId = url.pathname.slice(1);
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") ?? "";
    } else if (url.pathname.startsWith("/shorts/")) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length === 2 && segments[0] === "shorts") videoId = segments[1] ?? "";
    }

    if (!YOUTUBE_VIDEO_ID.test(videoId) || url.searchParams.has("list")) {
      return Object.freeze({ kind: "UNSUPPORTED_YOUTUBE" });
    }

    return Object.freeze({
      kind: "SUPPORTED_YOUTUBE",
      platform: "youtube",
      videoId,
      normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  // TikTok flow
  if (AUTHORIZED_TIKTOK_HOSTS.has(host)) {
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      return Object.freeze({ kind: "UNSUPPORTED_TIKTOK" });
    }

    // Short links (vm.tiktok.com, vt.tiktok.com, or www.tiktok.com/t/...)
    if (TIKTOK_SHORT_HOSTS.has(host)) {
      const segments = url.pathname.split("/").filter(Boolean);
      // Valid short code pattern e.g. /ZMxxxxxxx/ or /ZSxxxxxxx/ (typically 6-12 alphanumeric chars)
      if (segments.length === 1 && /^[A-Za-z0-9_-]{6,16}$/.test(segments[0]!)) {
        return Object.freeze({
          kind: "UNSUPPORTED_TIKTOK",
        });
      }
      return Object.freeze({ kind: "UNSUPPORTED_TIKTOK" });
    }

    // Standard desktop/mobile URLs
    // Pattern 1: /@username/video/:id
    // Pattern 2: /v/:id.html
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments.length === 3 && segments[1] === "video" && TIKTOK_USERNAME.test(segments[0]!)) {
      const authorUsername = segments[0]!.slice(1);
      const videoId = segments[2]!;
      if (TIKTOK_SNOWFLAKE_ID.test(videoId)) {
        return Object.freeze({
          kind: "SUPPORTED_TIKTOK",
          platform: "tiktok",
          videoId,
          authorUsername,
          normalizedUrl: `https://www.tiktok.com/@${authorUsername}/video/${videoId}`,
        });
      }
    } else if (segments.length === 2 && segments[0] === "v") {
      const rawId = segments[1]!.replace(/\.html$/i, "");
      if (TIKTOK_SNOWFLAKE_ID.test(rawId)) {
        return Object.freeze({
          kind: "SUPPORTED_TIKTOK",
          platform: "tiktok",
          videoId: rawId,
          normalizedUrl: `https://www.tiktok.com/v/${rawId}.html`,
        });
      }
    }

    // Non-video TikTok paths e.g. profiles, live, tag, music, photo
    return Object.freeze({ kind: "UNSUPPORTED_TIKTOK" });
  }

  return Object.freeze({ kind: "UNSUPPORTED_URL" });
};
