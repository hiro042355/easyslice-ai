"use strict";
/**
 * B3-2 — Injectable HTTP executor port for authenticated TikTok transport.
 *
 * This interface abstracts actual HTTP execution so tests can inject a
 * deterministic fake. The authenticated transport depends on this port,
 * NOT on global fetch. A future production executor (NOT in this slice)
 * would implement this interface using fetch or a typed HTTP client.
 *
 * No real network calls are made in B3-2. No dependencies are added.
 */
Object.defineProperty(exports, "__esModule", { value: true });
