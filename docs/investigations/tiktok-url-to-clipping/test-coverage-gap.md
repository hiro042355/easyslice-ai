# Test Coverage Gap Investigation

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Inventory of Existing Tests

| Test Suite / File | Focus Area | Status | Relevance to TikTok |
|---|---|---|---|
| `tests/urlAcquisition/classifyUrl.test.ts` | URL classification & normalization | Passing (8 tests) | Tests YouTube only. Asserts non-YouTube hosts return `UNSUPPORTED_URL`. |
| `tests/urlAcquisition/productionAssetImportCommand.test.ts` | Asset import API security, CSRF, idempotency | 10 passing, 1 preexisting assertion failure | Verifies `/api/v1/assets/import` boundary, rejection of unsupported sources. |
| `tests/acquisitionWorker/acquisitionWorkerFoundation.test.ts` | Worker request validation & runtime contracts | Passing | Explicitly asserts `validateAcquisitionRequest({ source: "tiktok" })` throws `unsupported-source`. |
| `tests/clipPlatform/platformAwareOptimization.test.ts` | Platform profiles & scoring weights | Passing | Evaluates clip optimization for `"tiktok"` target (duration, hook weighting). |
| `tests/productionIdentity/durableMultiCut.test.ts` | Multi-cut batch cutting & ZIP packaging | Passing | Verifies FFmpeg 9:16 vertical crop rendering (`scale=720:1280,crop=720:1280`). |
| `tests/productionIdentity/durableMediaAdmissionClient.test.ts` | Direct file upload & durable media admission | Passing | Verifies `/api/media/admit` for user-provided files. |

---

## 2. Missing TikTok-Specific Tests

Because TikTok URL acquisition is not implemented, corresponding test suites are entirely absent:

| Missing Test Area | Purpose | Can Be Run Offline? | Requirements / Dependencies |
|---|---|---|---|
| **TikTok URL Parsing & Normalization** | Validate desktop (`/@user/video/id`), mobile (`/v/id.html`), query parameter stripping, username format. | **YES** | Offline pure unit test with regex/URL parser. |
| **Short URL & Redirect Resolution** | Test `vm.tiktok.com` / `vt.tiktok.com` resolution using a mock HTTP server. | **YES** | Mock HTTP server returning 301/302 `Location` headers. |
| **Invalid / Deleted URL Handling** | Verify correct error mapping when URL does not point to a valid video ID. | **YES** | Offline synthetic fixture. |
| **Private / Age-Restricted URL Handling** | Verify graceful rejection when content requires authentication. | **YES** | Mocked oEmbed / API response fixture with 403 / error response. |
| **TikTok Source Adapter Contract Test** | Verify `TikTokSourceAdapter` conforms to `SourceAdapter` and handles context/workspace. | **YES** | Mock `SourceAcquisitionContext` with synthetic MP4 artifact. |
| **Acquisition Idempotency Deduplication** | Verify duplicate TikTok URLs generate same framed SHA-256 fingerprint. | **YES** | Unit test on `createAssetImportFingerprint`. |
| **End-to-End Asset Import Simulation** | Verify flow from `POST /api/v1/assets/import` to `workflow.jobs` creation using a synthetic TikTok source. | **YES** (with test DB) | PostgreSQL testcontainer or test database. |
| **Real TikTok Live Video Ingestion** | Test live video acquisition with actual TikTok servers. | **NO** | Real network connection, live TikTok asset, risk of bot block. |

---

## 3. Testing Policy & Boundaries

- **Zero Real TikTok Network Calls During Testing:**
  - Automated tests must **never** send real HTTP requests to `tiktok.com` or TikTok CDN domains.
  - Doing so creates flaky tests, risks IP blacklisting of development and CI environments, and violates repository safety boundaries.
- **Offline Synthetic Fixtures:**
  - All unit and integration tests must rely on local mock servers or synthetic JSON fixtures representing TikTok oEmbed responses and redirect headers.
  - Media processing tests must use small synthetic MP4 files generated locally via FFmpeg.
