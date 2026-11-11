# NEXCUT AI Bilibili Publisher: Freebuff Implementation Execution Guide

## 1. Executive Summary & Mission Handoff
Welcome, Freebuff. This package provides the authoritative architecture closure, cryptographic and transactional specifications, database DDL, API contracts, security models, and work breakdown for the **NEXCUT AI Bilibili Publisher**.

### Repository Identity & Portability Clarification
- **Authoritative Microservice Repository**: `hiro042355/nexcut-bilibili-publisher` (Standalone GitHub repository for the Bilibili publisher microservice).
- **Core Platform Repository**: `hiro042355/easyslice-ai` (Local working tree: `/app`, commit baseline: `7a12460684f8c4aeae99234bfbacd74b8857efb3` / PR #12 merge).
- **YouTube Publisher Microservice**: `hiro042355/nexcut-youtube-publisher` (Standalone repository).

**Portability Directive**: This documentation package is completely self-contained. When initializing the standalone repository `hiro042355/nexcut-bilibili-publisher`, copy this entire directory (`docs/implementation/bilibili-freebuff-handoff/`) into the root of `nexcut-bilibili-publisher` under `docs/freebuff-handoff/`. No implementation step in the microservice depends on inspecting internal source code in `easyslice-ai`.

---

## 2. Directory Contents of This Handoff Package

| # | File | Purpose & Scope |
| :- | :--- | :--- |
| 1 | `EXECUTION_README.md` | Orientation, repository boundaries, execution lifecycle, and portability guide. |
| 2 | `REPOSITORY_BASELINE.md` | Authoritative Git baseline, commit provenance, branch structure, and file audit. |
| 3 | `ARCHITECTURE_SPECIFICATION.md` | Comprehensive architectural closure resolving WP-01 through WP-05. |
| 4 | `DATABASE_IMPLEMENTATION_SPEC.md` | Full relational DDL, column-level types, constraints, indexes, and transaction requirements. |
| 5 | `API_CONTRACTS.md` | Official Bilibili Open Platform API vs NEXCUT Core Ingress/Outbox API specifications. |
| 6 | `SECURITY_SPECIFICATION.md` | Token KMS encryption, SSRF mitigation, HMAC authentication, and tenant isolation. |
| 7 | `IMPLEMENTATION_WORK_PACKAGES.md` | Exhaustive 12-package work breakdown (WP-01 to WP-12) with dependencies and acceptance criteria. |
| 8 | `TEST_AND_ACCEPTANCE_MATRIX.md` | Concurrency, idempotency, failure injection, and mock test specifications. |
| 9 | `MIGRATION_AND_ROLLBACK_PLAN.md` | Ordered database migration scripts, non-destructive rollbacks, and data safety. |
| 10 | `PLATFORM_CAPABILITY_EVIDENCE.md` | Classification matrix of Bilibili Open Platform APIs vs quarantined Web APIs. |
| 11 | `KNOWN_LIMITATIONS.md` | Quotas, chunking limits, enterprise partner restrictions, and environmental boundaries. |
| 12 | `FREEBUFF_MASTER_IMPLEMENTATION_PROMPT.md` | Single executable instruction prompt for autonomous agent implementation. |

---

## 3. Strict Pre-Implementation Rules for Freebuff
1. **Preserve Repository Integrity**: Verify working tree status before any operation. Do not mutate core tables without migration approval.
2. **Quarantine Web APIs**: Community Web API parameters (`Wbi` signatures, `SESSDATA` cookies, `openElec`, `noReprint`) are strictly prohibited and quarantined. Only official Bilibili Partner Open Platform endpoints are supported.
3. **No Unverified Claims**: A passing test against in-memory mock endpoints must never be reported as evidence of live external Bilibili submission. Live publication requires external partner credentials.
4. **YouTube Priority**: YouTube workstream must be completed and frozen before beginning Bilibili deployment.
