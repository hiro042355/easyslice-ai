"use strict";
/**
 * B3-5 — Injectable upload executor port for media transfer.
 *
 * This interface is SEPARATE from HttpExecutor (B3-2). Media transfer
 * uses a provider-issued upload_url that must NOT receive the TikTok
 * API Bearer Authorization header. A distinct executor boundary
 * enforces this isolation architecturally.
 *
 * No real network calls are made in B3-5. No dependencies are added.
 * A future production upload executor (NOT in this slice) would
 * implement this interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
