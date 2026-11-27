# Implementation Work Packages: Complete Breakdown (WP-01 to WP-12)

This plan structures Freebuff's engineering tasks into 12 discrete, dependency-aware work packages.

---

```
                       [WP-01: Foundation & Baseline]
                                      │
                       [WP-02: Database & Migrations]
                                      │
                       [WP-03: Common Publication Domain]
                                 ┌────┴────┐
                                 ▼         ▼
     [WP-04: Bilibili Auth & Tokens]     [WP-05: Bilibili Upload Engine]
                                 └────┬────┘
                                      │
                   [WP-06: Submission & Status Lifecycle]
                                      │
                   [WP-07: Idempotency, Retry & Reconcile]
                                      │
                        [WP-08: Security & Audit Ledger]
                                      │
                        [WP-09: Observability & Metrics]
                                      │
                         [WP-10: Integration Test Suite]
                                      │
                         [WP-11: CI/CD Pipeline & Build]
                                      │
                        [WP-12: Acceptance & Readiness]
```

---

### WP-01: Repository & Microservice Foundation
- **Scope**: Initialize `nexcut-bilibili-publisher` project scaffold, TypeScript config, linting rules, and directory tree.
- **Dependencies**: None.
- **Files**: `package.json`, `tsconfig.json`, `src/index.ts`, `src/config.ts`.
- **Acceptance Criteria**: `npm run build` succeeds cleanly; zero TypeScript errors.

### WP-02: Database Schema & Migration Foundation
- **Scope**: Implement and verify Flyway migration `V000010__add_publication_management_foundation.sql` in Core, and PostgreSQL schema in publisher microservice.
- **Dependencies**: WP-01.
- **Files**: `db/workflow/migrations/V000010__add_publication_management_foundation.sql`, `scripts/pre_migration_exports_unique_index.sql`.
- **Acceptance Criteria**: Migrations apply cleanly on PostgreSQL 18.4 testcontainers; all constraints and foreign keys verified.

### WP-03: Common Publication Domain Interfaces
- **Scope**: Define standard TypeScript domain models, interfaces, and state machines for publication jobs, targets, attempts, and receipts.
- **Dependencies**: WP-02.
- **Files**: `lib/publication/types.ts`, `lib/publication/stateMachine.ts`.
- **Acceptance Criteria**: Pure state machine unit tests pass 100%.

### WP-04: Bilibili Partner Authentication & Token Management
- **Scope**: Implement official OAuth2 Authorization Code flow (`https://api.bilibili.com/x/account-oauth2/v1/token`) with `archive` scope for creator user authorization, AES-256-GCM token encryption via Google Cloud KMS, and automatic token refresh via `grant_type=refresh_token`. (Note: Client Credentials flow is unsupported for creator video publishing).
- **Dependencies**: WP-03.
- **Files**: `src/auth/tokenManager.ts`, `src/auth/cryptoVault.ts`.
- **Acceptance Criteria**: Tokens exchange and refresh successfully against mock Open Platform responses; zero raw secrets logged.

### WP-05: Bilibili Chunked Video Uploader
- **Scope**: Implement video initialization (`https://member.bilibili.com/arcopen/fn/archive/video/init`), chunk upload streaming (`https://openupos.bilivideo.com/video/v2/part/upload`) with fixed 10MB chunk alignment, and completion commit (`https://member.bilibili.com/arcopen/fn/archive/video/complete`).
- **Dependencies**: WP-04.
- **Files**: `src/upload/chunkUploader.ts`, `src/upload/streamPipeline.ts`.
- **Acceptance Criteria**: Chunks stream with MD5 verification; upload completion returns video `cid`.

### WP-06: Video Submission & Lifecycle Management
- **Scope**: Implement official archive submission by upload token (`https://member.bilibili.com/arcopen/fn/archive/add-by-utoken`), cover image upload (`https://member.bilibili.com/arcopen/fn/archive/cover/upload`), and BVID extraction.
- **Dependencies**: WP-05.
- **Files**: `src/lifecycle/submissionHandler.ts`, `src/lifecycle/statusPoller.ts`.
- **Acceptance Criteria**: Valid archive submissions return BV identifier (`bvid`) and `aid`; lifecycle states persist correctly.

### WP-07: Idempotency, Retry Policy & Outbox Reconciliation
- **Scope**: Implement publisher-side durable deduplication ledger, exponential jitter backoff, and outbox lease fencing.
- **Dependencies**: WP-06.
- **Files**: `src/resilience/deduplicationLedger.ts`, `src/resilience/retryPolicy.ts`.
- **Acceptance Criteria**: Duplicate delivery attempts result in idempotent HTTP 200 without duplicate Bilibili submissions.

### WP-08: Security Hardening & Audit Ledger
- **Scope**: Implement HMAC-SHA256 signature verification over RFC 8785 JCS payloads, SSRF socket filters, and immutable audit triggers.
- **Dependencies**: WP-07.
- **Files**: `src/security/hmacValidator.ts`, `src/security/ssrfFilter.ts`.
- **Acceptance Criteria**: Tampered payloads and internal IP ranges are rejected.

### WP-09: Observability, Structured Logging & Metrics
- **Scope**: OpenTelemetry tracing, Prometheus metrics (upload duration, retry counts), and secret-redacted structured JSON logging.
- **Dependencies**: WP-08.
- **Files**: `src/observability/logger.ts`, `src/observability/metrics.ts`.
- **Acceptance Criteria**: Traces propagate across HTTP headers; all sensitive tokens redacted.

### WP-10: Comprehensive Integration Testing
- **Scope**: End-to-end integration test suite using WireMock or mock HTTP servers simulating Bilibili official API behaviors and error conditions.
- **Dependencies**: WP-09.
- **Files**: `tests/integration/publisherPipeline.test.ts`, `tests/fixtures/bilibiliResponses.ts`.
- **Acceptance Criteria**: All mock integration suites pass offline without external network dependencies.

### WP-11: CI/CD Pipeline & Containerization
- **Scope**: GitHub Actions CI workflow for linting, testing, Docker image packaging, and deployment manifest generation.
- **Dependencies**: WP-10.
- **Files**: `.github/workflows/ci.yml`, `Dockerfile`.
- **Acceptance Criteria**: GitHub Actions runner successfully builds and passes all tests.

### WP-12: Acceptance Verification & Production Readiness Sign-off
- **Scope**: Final staging validation run, security audit sign-off, and operational runbook handover.
- **Dependencies**: WP-11.
- **Files**: `docs/runbooks/OPERATIONAL_RUNBOOK.md`.
- **Acceptance Criteria**: Gatekeeper criteria met; sign-off recorded.
