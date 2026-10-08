"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticatedTikTokTransport = exports.TransportError = void 0;
const TikTokEndpoints_1 = require("../client/TikTokEndpoints");
class TransportError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'TransportError';
        this.code = code;
    }
}
exports.TransportError = TransportError;
const APPROVED_API_URL = new URL(TikTokEndpoints_1.TIKTOK_API_BASE);
class AuthenticatedTikTokTransport {
    constructor(config, executor) {
        this.config = config;
        this.executor = executor;
    }
    async request(input) {
        var _a;
        const url = this.resolveRequestUrl(input.path);
        this.rejectCallerAuthHeader(input.headers);
        const token = await this.acquireToken();
        this.validateToken(token);
        const headers = Object.assign(Object.assign({}, ((_a = input.headers) !== null && _a !== void 0 ? _a : {})), { Authorization: `Bearer ${token.token}` });
        const executorRequest = {
            method: input.method,
            url,
            headers,
            body: input.body,
        };
        return this.executor.execute(executorRequest);
    }
    resolveRequestUrl(path) {
        const base = this.parseApprovedUrl(this.config.apiBase);
        // Accept endpoint paths, never absolute or network-path references.
        // Reject characters that URL parsing would silently normalize.
        if (typeof path !== 'string' ||
            !path.startsWith('/') ||
            path.startsWith('//') ||
            Array.from(path).some((character) => character === '\\' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
            throw new TransportError('invalid_host', 'Request path must be an absolute endpoint path');
        }
        let resolved;
        try {
            resolved = new URL(path, base);
        }
        catch (_a) {
            throw new TransportError('invalid_host', 'Request URL is not a valid URL');
        }
        // Validate the exact serialized URL sent to the executor, before auth.
        return this.parseApprovedUrl(resolved.href).href;
    }
    parseApprovedUrl(value) {
        let parsed;
        try {
            parsed = new URL(value);
        }
        catch (_a) {
            throw new TransportError('invalid_host', 'API URL is not a valid URL');
        }
        if (parsed.protocol !== 'https:' ||
            parsed.hostname !== APPROVED_API_URL.hostname ||
            parsed.origin !== APPROVED_API_URL.origin ||
            parsed.username !== '' ||
            parsed.password !== '') {
            throw new TransportError('invalid_host', 'API URL must use the approved HTTPS TikTok origin without embedded credentials');
        }
        return parsed;
    }
    rejectCallerAuthHeader(headers) {
        if (!headers)
            return;
        const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
        if (hasAuth) {
            throw new TransportError('authorization_header_rejected', 'Caller must not provide an Authorization header; the transport manages authentication');
        }
    }
    async acquireToken() {
        try {
            return await this.config.authProvider.getAccessToken();
        }
        catch (_a) {
            throw new TransportError('auth_provider_failure', 'Auth provider failed to supply an access token');
        }
    }
    validateToken(token) {
        if (token.token.length === 0) {
            throw new TransportError('empty_token', 'Access token is empty');
        }
        if (token.token.trim().length === 0) {
            throw new TransportError('whitespace_token', 'Access token is whitespace-only');
        }
    }
}
exports.AuthenticatedTikTokTransport = AuthenticatedTikTokTransport;
