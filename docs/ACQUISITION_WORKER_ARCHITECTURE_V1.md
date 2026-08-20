# Acquisition Worker Architecture V1

Status: contract foundation only. Production deployment and Production route integration are not approved.

## Boundary

Vercel remains the authority for Firebase server sessions, Beta authorization, and orchestration. The worker accepts a server-issued, versioned `AcquisitionRequest`; it never accepts a user UID, cookie, credential, storage key, filesystem path, executable, or command. It acquires and validates media, then hands the acquisition-scoped artifact to an injected consumer before mandatory cleanup.

The intended future flow is:

`Source Adapter → Acquisition Worker → media validation → artifact transfer → canonical GCS → Job/Media → Creator Flow`

PostgreSQL ownership and durable GCS naming remain outside the worker. Production `/api/youtube/ingest` is not connected to this foundation.

## Contracts

- Schema version: `1.0`
- Initial source: `youtube`
- Initial output profile: `canonical-mp4`
- Acquisition identity: caller-generated server UUID v4
- Idempotency: a store coalesces identical work for an acquisition ID and rejects conflicting reuse. The included store is test-only and in-memory; durable production dedupe is deferred.
- Limits: at most 2 GiB and 240 seconds
- Result: fixed success/failure discriminated union containing only safe metadata
- Artifact transport: injected consumer runs before cleanup; no Vercel body proxy is assumed

`SourceAdapter` isolates source-specific normalization and acquisition. A future `TikTokSourceAdapter` can use the same worker result, validation, artifact consumer, idempotency, and cleanup contracts; adding a source requires an explicit request-contract revision and allowlist implementation. There is no generic URL adapter.

## Runtime and media validation

The worker contract resolves pinned `yt-dlp_linux` 2026.03.13, canonical packaged FFmpeg, and an explicit Node executable. Node must be executable and major version 22 or newer. YouTube execution uses `--no-js-runtimes --js-runtimes node:<absolute server-controlled path>`; it does not consult `PATH`. Deno and QuickJS are not required by this foundation. This enables bundled EJS but does not claim to solve YouTube bot enforcement.

The output must exist, be non-empty, not exceed policy, be an MP4 container, contain a video stream, and have a finite positive duration. Audio is optional. Validation does not access PostgreSQL or GCS.

## PO Token provider boundary

The selected candidate authority is `bgutil-ytdlp-pot-provider` tag `1.3.1`, commit `7608dd51ee813b48cf9a6d68c6e42cb197ce10e0`, GPL-3.0. No provider code or image is installed by this foundation. The boundary represents not-configured, available, unavailable, and failed states.

Future production topology should use the provider's reusable HTTP service model rather than spawn-per-request script mode. The service and plugin must be version-pinned and reviewed together. PO Tokens and EJS remain separate concerns, and neither guarantees removal of IP-level enforcement.

## Security policy

Cookies, browser extraction, YouTube accounts, shared credentials, private/age/region/DRM bypasses, shell commands, client-selected paths, and arbitrary URL fetching are prohibited. stdout/stderr remain bounded in the process adapter and raw diagnostics are not part of worker results.

Every workspace is rooted at a server-controlled authority directory and scoped by acquisition ID. Input, output, and provider temporary directories are isolated. The complete acquisition root is removed in `finally` after success or failure; sibling acquisitions are not touched.

## Future Cloud Run topology

Initial planning values, subject to load testing:

- 2 vCPU
- 4 GiB memory
- 4 GiB ephemeral disk minimum (2 GiB input/output policy plus processing headroom)
- 300 second request timeout
- concurrency 1
- minimum instances 0; maximum instances limited initially (for example 2)
- provider HTTP process as a supervised sidecar or co-located service with readiness checks
- authenticated service-to-service invocation only
- dedicated acquisition identity
- direct write to a server-authorized, acquisition-scoped GCS destination; never proxy a 2 GiB artifact through Vercel

A signed object transfer contract or narrowly scoped dedicated identity is preferred. Exact IAM, Terraform, networking, egress, health probes, durable idempotency storage, and process supervision remain future approvals.

## Non-responsibilities

This foundation does not deploy Cloud Run, start a provider, download Production media, mutate GCS/DB, change IAM/Terraform/Auth/DDL, alter Creator Flow or AI MV, or replace the current Production YouTube route.
