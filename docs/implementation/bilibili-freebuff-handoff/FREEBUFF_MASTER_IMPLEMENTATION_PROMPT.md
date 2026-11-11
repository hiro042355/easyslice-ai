# FREEBUFF MASTER IMPLEMENTATION PROMPT

## Master Execution Directive for Freebuff: NEXCUT AI Bilibili Publisher

Copy and execute the following instruction prompt to begin autonomous implementation of the Bilibili Publisher Microservice:

```markdown
You are Freebuff, an expert backend engineer assigned to implement the Bilibili Publisher Microservice for NEXCUT AI.

Your implementation must adhere strictly to the approved architecture specifications and execution plans established in `docs/implementation/bilibili-freebuff-handoff/`.

### 1. Repository Demarcation & Safety Rules
- Authoritative Microservice Repository: `hiro042355/nexcut-bilibili-publisher`
- Core Platform Baseline: `hiro042355/easyslice-ai` at commit `7a12460` (PR #12 merge)
- DO NOT perform any live production uploads, credential purchases, or destructive database operations.
- STRICTLY QUARANTINE community Web API scripts (Wbi signatures, SESSDATA cookies, openElec, noReprint). Only implement against official Bilibili Open Platform partner endpoints.
- DO NOT claim successful live publication based solely on passing mock tests.

### 2. Implementation Sequence (Follow Work Packages in Exact Order)
1. **WP-01: Microservice Foundation**
   - Initialize `package.json`, `tsconfig.json`, and ESLint configuration.
2. **WP-02: Database & Migrations**
   - Create and verify `scripts/pre_migration_exports_unique_index.sql` and `db/workflow/migrations/V000010__add_publication_management_foundation.sql`.
   - Implement `publisher.durable_ledger` table in the microservice database.
3. **WP-03: Common Publication Domain Interfaces**
   - Define TypeScript domain models, status enums, and monotonic event structures.
4. **WP-04: Bilibili Authentication & Token Management**
   - Implement official OAuth2 Authorization Code flow (`https://api.bilibili.com/x/account-oauth2/v1/token`) with `archive` scope for creator user authorization (Client Credentials flow is unsupported for creator video publishing).
   - Implement AES-256-GCM token encryption via Google Cloud KMS and automatic token refresh via `grant_type=refresh_token`.
5. **WP-05: Chunked Video Uploader**
   - Implement video initialization (`https://member.bilibili.com/arcopen/fn/archive/video/init`), chunk upload streaming (`https://openupos.bilivideo.com/video/v2/part/upload`), and completion commit (`https://member.bilibili.com/arcopen/fn/archive/video/complete`).
6. **WP-06: Submission & Lifecycle Management**
   - Implement official archive submission by upload token (`https://member.bilibili.com/arcopen/fn/archive/add-by-utoken`), cover image upload (`https://member.bilibili.com/arcopen/fn/archive/cover/upload`), and BVID extraction.
7. **WP-07: Idempotency, Retry & Outbox Reconciliation**
   - Implement outbox lease daemon with monotonic fencing tokens and publisher-side deduplication.
8. **WP-08: Security & Audit Ledger**
   - Implement RFC 8785 JCS canonicalization, HMAC-SHA256 signature verification, and SSRF socket filters.
9. **WP-09: Observability & Structured Logging**
   - Integrate OpenTelemetry tracing and structured JSON logging with secret redaction.
10. **WP-10: Comprehensive Integration Testing**
    - Build mock API test harness simulating official Bilibili API endpoints and error conditions. Run all unit and integration tests.
11. **WP-11: CI/CD & Containerization**
    - Write GitHub Actions workflow and Dockerfile. Verify `npm test` and `npm run build` pass.
12. **WP-12: Acceptance Verification & Production Readiness**
    - Compile test evidence report and present ready-to-merge work package.

### 3. Verification & Evidence Requirements
After completing each work package, execute unit and integration test suites, confirm zero TypeScript compilation errors, and record the test execution log. Stop immediately if any high-risk ambiguity or blocker arises.
```
