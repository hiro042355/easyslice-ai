/**
 * B3-2 — Authenticated TikTok transport boundary.
 *
 * Obtains an access token via TikTokAuthProvider, constructs the
 * Authorization: Bearer header internally, and delegates HTTP execution
 * to an injected HttpExecutor. Never calls global fetch directly.
 *
 * SECURITY GUARANTEES:
 *   - Caller cannot provide an Authorization header; the transport is
 *     authoritative over authentication.
 *   - Empty or whitespace-only tokens cause fail-closed rejection with
 *     zero executor calls.
 *   - Auth provider failures cause fail-closed rejection with zero
 *     executor calls.
 *   - The API host is validated against the official TikTok API base;
 *     unapproved hosts are rejected with zero executor calls.
 *   - Token values are never included in error messages.
 *
 * WAIT_FOR_B3_3: adapter layers that bridge this transport to B2 contracts.
 */
import type { TikTokProviderConfig } from './TikTokProviderConfig';
import type { HttpExecutor, HttpExecutorResponse } from './HttpExecutor';
export interface AuthenticatedTransportRequest {
    readonly method: 'GET' | 'POST' | 'PUT';
    readonly path: string;
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
}
export type TransportErrorCode = 'empty_token' | 'whitespace_token' | 'auth_provider_failure' | 'invalid_host' | 'authorization_header_rejected';
export declare class TransportError extends Error {
    readonly code: TransportErrorCode;
    constructor(code: TransportErrorCode, message: string);
}
export declare class AuthenticatedTikTokTransport {
    private readonly config;
    private readonly executor;
    constructor(config: TikTokProviderConfig, executor: HttpExecutor);
    request(input: AuthenticatedTransportRequest): Promise<HttpExecutorResponse>;
    private resolveRequestUrl;
    private parseApprovedUrl;
    private rejectCallerAuthHeader;
    private acquireToken;
    private validateToken;
}
