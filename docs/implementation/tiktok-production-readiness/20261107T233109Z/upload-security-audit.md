# Upload and File Security Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z` (Updated: `2026-11-08T00:35:00Z`)
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `PASS` (Client & Server Validation Architecture) / `NOT_VERIFIED` (Real Production GCS Network Execution)

---

## 1. Durable Upload Implementation Architecture & Separation of Concerns

To avoid conflating client logic, server signed URLs, mock tests, and real cloud storage, the durable upload pipeline is broken down into four distinct layers:

### A. Client Request Construction & Fast-Fail Validation (Status: PASS)
- **Implementation:** `lib/client/durableMediaAdmission.ts`
- **Validation:** Proactively validates `file.type === "video/mp4"`, `Number.isSafeInteger(file.size)`, `file.size > 0`, and `file.size <= MAX_MEDIA_BYTES` (2 GiB = 2,147,483,648 bytes).
- **Exact Boundary Behavior:**
  - Files <= 2,147,483,648 bytes pass.
  - Files == 2,147,483,648 bytes pass.
  - Files > 2,147,483,648 bytes throw immediately with `Media file exceeds maximum allowed size of 2GB: ...`.
  - Non-MP4 files (e.g. `video/webm`, `video/quicktime`) throw immediately.
  - On validation error, execution halts immediately: zero HTTP requests are dispatched to `/api/media/admit` or storage endpoints.
- **Verification Evidence:** 11 passing tests in `tests/urlAcquisition/durableMediaAdmissionValidation.test.ts` and `tests/productionIdentity/durableMediaAdmissionClient.test.ts`.

### B. Server Admission & Signed/Resumable Upload URL Generation (Status: PASS)
- **Implementation:** `app/api/media/admit/route.ts`
- **Authoritative Security Boundary:** The server never trusts client-side checks:
  1. Authenticates session (`requireAuthenticatedRequest`).
  2. Enforces same-origin policy (`sameOrigin`).
  3. Validates MIME (`body.mime === "video/mp4"`).
  4. Validates size (`Number.isSafeInteger(body.size) && body.size > 0 && body.size <= 2 * 1024 * 1024 * 1024`).
  5. Generates UUID v4 `jobId` and `mediaId`.
  6. Creates resumable upload session on GCS bucket object `media/${jobId}/${mediaId}/input.mp4` with custom metadata (`nexcutOwnerUid`, `nexcutJobId`, `nexcutMediaId`, `nexcutExpectedSize`).

### C. Mocked Upload & Protocol Security Tests (Status: PASS)
- **Implementation:** `tests/productionIdentity/durableMediaAdmissionClient.test.ts`
- **Tested Properties:**
  - Media bytes stream strictly to the server-issued resumable URL (never through Vercel edges).
  - GCS error payloads (XML/JSON) redact authority tokens, cookies, URLs, and session IDs to prevent secret leakage in client logs.
  - Non-JSON errors (e.g. Vercel 413) handled safely without unhandled exceptions.

### D. Actual Production GCS Upload Verification (Status: NOT_VERIFIED)
- In accordance with safety rules, no live GCP production storage bucket (`production_media`) or Google Cloud credentials were used during sandbox execution.
- Actual upload streaming across real WAN endpoints to Google Cloud Storage is **NOT_VERIFIED** offline.
- Real GCS verification must take place in staging with live service account credentials.

---

## 2. Security Control Evaluation Matrix

| Control Area | Implementation Reference | Status | Evidence |
|---|---|---|---|
| **MIME Validation** | Client: `validateMediaAdmissionFile`<br>Server: `app/api/media/admit/route.ts:36, 61` | PASS | Client & server reject anything other than `"video/mp4"`. Server remains authoritative. |
| **2GB Size Boundary** | Client: `validateMediaAdmissionFile`<br>Server: `app/api/media/admit/route.ts:11, 36` | PASS | Hard boundary at 2,147,483,648 bytes. Tested below, at, and above limit. |
| **Content Size Verification** | `app/api/media/admit/route.ts:65` | PASS | Finalize step verifies `metadata.size === custom.nexcutExpectedSize`. Truncated uploads rejected. |
| **Direct-to-GCS Resumable Flow** | `lib/client/durableMediaAdmission.ts:82` | PASS | Bypasses Vercel 4.5 MB request payload limit by streaming directly to GCS. |
| **Authentication & Origin** | `app/api/media/admit/route.ts:20, 22` | PASS | Session cookie verified; origin header matched. Cross-origin requests blocked with 403. |
| **Owner Isolation** | `app/api/media/admit/route.ts:62` | PASS | `custom.nexcutOwnerUid !== ownerUid` returns 404, preventing cross-tenant media hijacking. |
| **Storage Key Format** | `storageKey.ts:8-16` | PASS | UUID v4 only. Path traversal mathematically impossible. |
| **Failure Rollback & Cleanup** | `app/api/media/admit/route.ts:82-87` | PASS | Transaction rolled back; uploaded GCS object deleted on DB failure. |
| **Live GCS Production Network Test** | Real Cloud Storage API | NOT_VERIFIED | Cannot be tested without live GCP credentials in sandbox. |
