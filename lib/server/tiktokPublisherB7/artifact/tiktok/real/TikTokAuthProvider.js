"use strict";
/**
 * B3-1 — Auth provider boundary for future real TikTok integration.
 *
 * Type-only contract. No OAuth implementation, no token storage, no HTTP,
 * no environment reads, no credentials. Subsequent B3 phases implement
 * concrete providers against this interface.
 *
 * WAIT_FOR_B3_2: concrete auth provider implementation, token refresh logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
