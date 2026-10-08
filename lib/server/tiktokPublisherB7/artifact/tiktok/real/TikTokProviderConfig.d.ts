/**
 * B3-1 — Provider configuration boundary for future real TikTok integration.
 *
 * Type-only contract. No runtime reads, no default credentials, no HTTP,
 * no provider construction. Subsequent B3 phases use this type to accept
 * configuration for the real transport.
 *
 * WAIT_FOR_B3_2: concrete config loading, environment binding.
 */
import type { TikTokAuthProvider } from './TikTokAuthProvider';
/**
 * Retry policy for transient failures (rate limits, server errors).
 * Implementations in B3-2+ will use this to configure backoff.
 */
export interface TikTokRetryPolicy {
    /** Maximum number of retry attempts for a retryable error. */
    readonly maxRetries: number;
    /** Initial delay in milliseconds before the first retry. */
    readonly initialDelayMs: number;
    /** Multiplier applied to delay after each retry (exponential backoff). */
    readonly backoffMultiplier: number;
    /** Maximum delay in milliseconds between retries. */
    readonly maxDelayMs: number;
}
/**
 * Configuration for constructing a real TikTok provider transport.
 *
 * No default values are provided — all fields are required to prevent
 * accidental use of empty/production-unsafe configurations. The caller
 * (B3-2+ factory) is responsible for sourcing these values from a secure
 * configuration store.
 *
 * The apiBase reuses the existing B2 constant TIKTOK_API_BASE from
 * TikTokEndpoints.ts rather than duplicating it. Callers should pass
 * TIKTOK_API_BASE explicitly.
 */
export interface TikTokProviderConfig {
    /** API base URL. Callers should pass TIKTOK_API_BASE from TikTokEndpoints. */
    readonly apiBase: string;
    /** Auth provider for access-token injection. */
    readonly authProvider: TikTokAuthProvider;
    /** Request timeout in milliseconds. */
    readonly timeoutMs: number;
    /** Retry policy for transient failures. */
    readonly retryPolicy: TikTokRetryPolicy;
}
