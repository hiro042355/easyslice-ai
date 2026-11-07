# Implementation Roadmap: TikTok Video URL Integration

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Governance and Responsibility Separation

| Scope | Jules Autonomy (Code-Level Implementation) | Requires Product Owner / External Authorization |
|---|---|---|
| **URL Recognition & Normalization** | Write URL parser, regex, and unit tests | Policy decision on supported URL formats |
| **Contract & Schema Extension** | TypeScript types (`lib/assetImport/types.ts`), DB migration file (`V000009`) | Approval to run migration on production DB |
| **Creator Flow UI Guidance** | Add TikTok URL metadata preview, guidance to upload MP4 | Design / UX copy approval |
| **Automated Binary Acquisition** | **STRICTLY BLOCKED** without explicit PO mandate | **Mandatory Legal & Platform Policy Decision**: whether to allow scraping via isolated worker or require user file upload |
| **External Credentials / APIs** | Do not configure real credentials | TikTok Developer Portal application review, client credentials |

---

## 2. Phased Implementation Plan

### Phase 1: Canonical TikTok URL Recognition & Normalization (Offline, Safe)
- **Goal:** Enable the application to recognize, validate, and normalize TikTok video URLs without performing external network requests.
- **Tasks:**
  1. Add `SupportedTikTokUrl` to `lib/urlAcquisition/types.ts`.
  2. Implement TikTok URL parsing in `lib/urlAcquisition/classifyUrl.ts`:
     - Recognize hosts: `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`.
     - Extract 18–19 digit snowflake ID for standard URLs (`/@username/video/<id>`).
     - Strip tracking query parameters (`?_r=1`, `&is_from_webapp=1`, `utm_*`).
     - Produce canonical URL: `https://www.tiktok.com/@{username}/video/{videoId}`.
  3. Author comprehensive unit test suite in `tests/urlAcquisition/classifyTikTokUrl.test.ts`.
- **Acceptance Criteria:**
  - Standard and mobile URLs parse into structured canonical objects.
  - Non-video URLs (profiles, live streams, sounds) return `UNSUPPORTED_TIKTOK`.
  - Zero external network requests made during tests.
  - All unit tests pass via `npx tsx --test`.

---

### Phase 2: Metadata Integration & User Upload Bridge (Recommended Default Path)
- **Goal:** Allow users to input a TikTok URL to fetch public metadata (via TikTok oEmbed API) and immediately pair it with a user-uploaded MP4 asset.
- **Tasks:**
  1. Create a server-side oEmbed client (`lib/server/tiktokMetadata.ts`) querying `https://www.tiktok.com/oembed?url={canonicalUrl}` with timeout and origin validation.
  2. Display video title, author, and thumbnail in Step 1 of `workspace-flow`.
  3. Provide a clear dropzone: *"TikTok video detected: Please drop the video MP4 file to begin AI clipping"*.
  4. Pass metadata into `sourceContext` (`lib/sourceContext/sourceContextEngine.ts`) to enrich clip candidates.
- **Acceptance Criteria:**
  - oEmbed fetches public title and thumbnail safely.
  - Dropping the MP4 registers the asset in `workflow.jobs` and `workflow.media`.
  - Step 2 (Analyze), Step 3 (Clips), and Step 4 (Export) execute identically to YouTube/Upload workflows.

---

### Phase 3: Contract Expansion & Source Adapter Boundary (Additive)
- **Goal:** Prepare the common Video Source Layer and Production Asset Import command to formally recognize TikTok as a first-class source platform.
- **Tasks:**
  1. Update `CanonicalAssetImportSource` in `lib/assetImport/types.ts` to include `platform: "tiktok"`.
  2. Create migration script `db/workflow/migrations/V000009__expand_asset_import_platform.sql` updating `ck_asset_import_authority`.
  3. Update `createAssetImportFingerprint()` (`lib/server/assetImport/fingerprint.ts`) to deterministically frame TikTok source identities.
  4. Create `TikTokSourceAdapter` interface stub in `lib/server/acquisitionWorker/tiktokAdapter.ts` conforming to `SourceAdapter`.
- **Acceptance Criteria:**
  - Idempotency and database constraints accommodate `platform = 'tiktok'`.
  - No regressions in existing YouTube import tests.

---

### Phase 4: Isolated Acquisition Worker (Contingent on PO Approval)
- **Prerequisite:** Explicit written authorization from Product Owner and Legal Counsel regarding TikTok scraping terms and rate-limit risks.
- **Tasks:**
  1. Update `lib/server/acquisitionWorker/contracts.ts` allowlist to include `"tiktok"`.
  2. Implement acquisition worker execution in isolated Cloud Run environment using pinned yt-dlp binary with TikTok-specific network timeouts and headers.
  3. Implement strict fallback: if TikTok blocks requests with HTTP 403 / anti-bot captcha, immediately return structured error code `acquisition_blocked` and prompt user for manual file upload.
- **Acceptance Criteria:**
  - Cloud Run worker runs in isolated network namespace without access to production DB credentials.
  - Fails closed safely when blocked by TikTok edge defenses.

---

## 3. Verification Strategy

1. **Unit Testing:**
   - Execute `npx tsx --test tests/urlAcquisition/classifyUrl.test.ts`
   - Test offline with synthetic fixtures for every URL variation.
2. **Type Checking:**
   - Run `npm run typecheck` to ensure all discriminated unions are exhaustive.
3. **Linting & Hygiene:**
   - Run `npm run lint` and verify no lingering debug logs or unhandled promises.
4. **Safety Verification:**
   - Confirm zero external network calls occur in automated test runs.
