import type { UserId, SessionId } from "../productionIdentity/types";

export const TIKTOK_CALLBACK_PATH = "/api/tiktok/oauth/callback" as const;
export const TIKTOK_REDIRECT_URI = "https://www.nexcutai.com/api/tiktok/oauth/callback" as const;
export type TikTokOAuthMode = "production" | "sandbox";
export type TikTokScope = "user.info.basic" | "video.publish" | "video.upload";
export type TikTokCapability = "basic-identity" | "direct-post" | "inbox-upload";
export const CAPABILITY_SCOPES: Readonly<Record<TikTokCapability, readonly TikTokScope[]>> = Object.freeze({
  "basic-identity": Object.freeze(["user.info.basic"] as const),
  "direct-post": Object.freeze(["video.publish"] as const),
  "inbox-upload": Object.freeze(["video.upload"] as const),
});
// FILE_UPLOAD is transport, not a capability or an additional OAuth scope.
export type TikTokMediaTransfer = "FILE_UPLOAD" | "PULL_FROM_URL";
export type TikTokAppAuthority = Readonly<{ mode: TikTokOAuthMode; clientKey: string }>;
export type TikTokSafeConfig = Readonly<{
  authority: TikTokAppAuthority;
  redirectUri: typeof TIKTOK_REDIRECT_URI;
  callbackPath: typeof TIKTOK_CALLBACK_PATH;
  requestedScopes: readonly TikTokScope[];
}>;
export type TikTokServerConfig = TikTokSafeConfig & Readonly<{ clientSecret: string }>;
// Metadata only. LOGIN-2 owns issuance, atomic consumption and durable storage.
export type TikTokOAuthTransaction = Readonly<{
  transactionId: string;
  stateDigest: string;
  ownerUserId: UserId;
  ownerSessionId: SessionId;
  authority: TikTokAppAuthority;
  redirectUri: typeof TIKTOK_REDIRECT_URI;
  requestedScopes: readonly TikTokScope[];
  issuedAtMs: number;
  expiresAtMs: number;
  status: "pending" | "claimed" | "consumed" | "failed";
}>;
export type TikTokAccountBinding = Readonly<{
  ownerUserId: UserId;
  authority: TikTokAppAuthority;
  openId: string;
  grantedScopes: readonly TikTokScope[];
}>;
