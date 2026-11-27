export type SupportedYouTubeUrl = Readonly<{
  kind: "SUPPORTED_YOUTUBE";
  platform: "youtube";
  videoId: string;
  normalizedUrl: string;
}>;

export type SupportedTikTokUrl = Readonly<{
  kind: "SUPPORTED_TIKTOK";
  platform: "tiktok";
  videoId: string;
  authorUsername?: string;
  normalizedUrl: string;
}>;

export type UrlClassification =
  | SupportedYouTubeUrl
  | SupportedTikTokUrl
  | Readonly<{ kind: "UNSUPPORTED_TIKTOK" }>
  | Readonly<{ kind: "UNSUPPORTED_YOUTUBE" }>
  | Readonly<{ kind: "UNSUPPORTED_URL" }>
  | Readonly<{ kind: "INVALID_INPUT" }>;
