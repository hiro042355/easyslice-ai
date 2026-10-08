/** Future same-origin API contract only; no transport implementation. */
export const CONNECTION_ENDPOINTS = Object.freeze({
  connection: Object.freeze({ method: "GET", path: "/api/tiktok/connection" }),
  start: Object.freeze({ method: "POST", path: "/api/tiktok/oauth/start" }),
  disconnect: Object.freeze({ method: "POST", path: "/api/tiktok/disconnect" }),
} as const);
export const CONNECTION_STATES = Object.freeze(["NOT_CONNECTED", "CONNECTING", "CONNECTED", "REAUTH_REQUIRED", "DISCONNECTING", "ERROR", "UNAVAILABLE"] as const);
export type ConnectionState = typeof CONNECTION_STATES[number];
export type ConnectionError = "SESSION_REQUIRED" | "CONNECTION_CHECK_FAILED" | "CONNECTION_EXPIRED";
export type ConnectionResponse = Readonly<{
  version: "1";
  status: ConnectionState;
  account?: Readonly<{ displayName: string | null }>;
  error?: ConnectionError;
}>;
// The future server performs navigation. No authorization URL/state/credential in JSON.
export type OAuthStartResponse = Readonly<{ status: "UNAVAILABLE" | "SERVER_REDIRECT" }>;
export type DisconnectResponse = Readonly<{ status: "UNAVAILABLE" | "DISCONNECTED" | "REAUTH_REQUIRED" }>;
export interface FutureConnectionApi {
  getConnection(): Promise<ConnectionResponse>;
  startOAuth(): Promise<OAuthStartResponse>;
  disconnect(): Promise<DisconnectResponse>;
}
