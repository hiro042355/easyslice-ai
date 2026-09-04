import type { UrlClassification } from "./types";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const AUTHORIZED_HOSTS = new Set([...YOUTUBE_HOSTS, "youtu.be"]);

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
  if (!AUTHORIZED_HOSTS.has(host)) return Object.freeze({ kind: "UNSUPPORTED_URL" });
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

  if (!VIDEO_ID.test(videoId) || url.searchParams.has("list")) {
    return Object.freeze({ kind: "UNSUPPORTED_YOUTUBE" });
  }

  return Object.freeze({
    kind: "SUPPORTED_YOUTUBE",
    platform: "youtube",
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  });
};
