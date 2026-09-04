export type SupportedYouTubeUrl = Readonly<{
  kind: "SUPPORTED_YOUTUBE";
  platform: "youtube";
  videoId: string;
  normalizedUrl: string;
}>;

export type UrlClassification =
  | SupportedYouTubeUrl
  | Readonly<{ kind: "UNSUPPORTED_YOUTUBE" }>
  | Readonly<{ kind: "UNSUPPORTED_URL" }>
  | Readonly<{ kind: "INVALID_INPUT" }>;
