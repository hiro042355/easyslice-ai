"use strict";
/**
 * B3-1 — Provider configuration boundary for future real TikTok integration.
 *
 * Type-only contract. No runtime reads, no default credentials, no HTTP,
 * no provider construction. Subsequent B3 phases use this type to accept
 * configuration for the real transport.
 *
 * WAIT_FOR_B3_2: concrete config loading, environment binding.
 */
Object.defineProperty(exports, "__esModule", { value: true });
