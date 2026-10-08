/**
 * B3-1 — Auth provider boundary for future real TikTok integration.
 *
 * Type-only contract. No OAuth implementation, no token storage, no HTTP,
 * no environment reads, no credentials. Subsequent B3 phases implement
 * concrete providers against this interface.
 *
 * WAIT_FOR_B3_2: concrete auth provider implementation, token refresh logic.
 */
/**
 * Represents the result of a token acquisition attempt.
 * The provider must surface failures rather than returning an empty token.
 */
export interface TikTokAccessToken {
    readonly token: string;
    readonly expiresAtMs: number;
}
/**
 * Boundary for access-token lifecycle management.
 *
 * The real HTTP transport (B3-2) will call getAccessToken() before each
 * request and inject the token into the Authorization header. If isExpired()
 * returns true, the transport calls refreshToken() first.
 *
 * Implementations must fail-closed: if no valid token can be obtained,
 * throw an error — never return an empty or placeholder token.
 */
export interface TikTokAuthProvider {
    /**
     * Return a valid access token. May trigger a refresh if the current
     * token is expired. Must throw if no token can be obtained.
     */
    getAccessToken(): Promise<TikTokAccessToken>;
    /**
     * Refresh the access token using the refresh token or re-authorization
     * flow. Must throw if refresh fails.
     */
    refreshToken(): Promise<TikTokAccessToken>;
    /**
     * Check whether the current token is expired or about to expire.
     * Used by the transport to decide whether to refresh before a request.
     */
    isExpired(): boolean;
}
