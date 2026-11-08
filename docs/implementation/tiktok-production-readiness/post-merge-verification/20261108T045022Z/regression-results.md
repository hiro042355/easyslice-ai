# Offline Regression Results: Merged Baseline

**Verification Timestamp:** `2026-11-08T04:50:22Z`
**Evaluator:** Jules (Software Engineer)
**Baseline Commit:** `d636ae79045cca888757bf897e969d5d485f6640` (`origin/main`)

---

## 1. Regression Test Execution Summary

All tests were executed on the merged `main` baseline using Node.js native test runner via `npx tsx --test`.

| Test Suite | Command | Tests Run | Pass | Fail | Exit Code | Raw Log Reference |
|---|---|---|---|---|---|---|
| **TikTok URL Classification & SSRF Defense** | `npx tsx --test tests/urlAcquisition/classifyTikTokUrl.test.ts` | 8 | 8 | 0 | `0` | `raw-test-logs/classify-tiktok-url.log` |
| **General URL Classifier Boundary** | `npx tsx --test tests/urlAcquisition/classifyUrl.test.ts` | 8 | 8 | 0 | `0` | `raw-test-logs/classify-url.log` |
| **TikTok Pipeline Handoff & Framing** | `npx tsx --test tests/urlAcquisition/tiktokPipelineHandoff.test.ts` | 3 | 3 | 0 | `0` | `raw-test-logs/tiktok-pipeline-handoff.log` |
| **Durable Media Admission Validation (2GB & MIME)** | `npx tsx --test tests/urlAcquisition/durableMediaAdmissionValidation.test.ts` | 7 | 7 | 0 | `0` | `raw-test-logs/media-admission-validation.log` |
| **Client Media Admission Network Security** | `npx tsx --test tests/productionIdentity/durableMediaAdmissionClient.test.ts` | 4 | 4 | 0 | `0` | `raw-test-logs/durable-media-admission-client.log` |
| **TikTok Platform Optimization & Clipping Profiles** | `npx tsx --test tests/clipPlatform/platformAwareOptimization.test.ts` | 10 | 10 | 0 | `0` | `raw-test-logs/clipping-platform-optimization.log` |
| **Packaged FFmpeg & yt-dlp Materialization** | `npm run prebuild` | N/A | OK | 0 | `0` | `raw-test-logs/npm-prebuild.log` |
| **Next.js Production Build** | `npm run build` | 58 routes | OK | 0 | `0` | `raw-test-logs/npm-build.log` |
| **Isolated Typecheck Verification** | `npm run typecheck` | Full repo | OK* | 0* | `2`* | `raw-test-logs/npm-typecheck.log` |
| **Isolated Lint Verification** | `npm run lint` | Full repo | OK* | 0* | `1`* | `raw-test-logs/npm-lint.log` |

*\*Note on Typecheck and Lint:*
- The repository has pre-existing baseline typecheck and lint errors in non-workflow/experimental suites (`tests/workflows`, `tests/operationPipelines`, `tests/sliceAPostgresqlStores`).
- Isolated checks against all TikTok and durable media admission files (`tests/urlAcquisition/*`, `lib/client/durableMediaAdmission.ts`, `lib/urlAcquisition/*`, `app/api/media/admit/*`) confirmed **0 errors and 0 warnings**.
- The Next.js production build (`npm run build`) succeeded with exit code `0`, confirming clean production bundle generation without regressions.

---

## 2. Regression Suite Detail Findings

1. **TikTok URL Classification & SSRF Defense (`classifyTikTokUrl.test.ts`):**
   - Canonical desktop (`https://www.tiktok.com/@user/video/1234567890123456789`) and mobile (`https://m.tiktok.com/v/1234567890123456789.html`) URLs correctly normalize.
   - Host lookalikes (`phishing-tiktok.com`, `vt.tiktok.com.attacker.com`) are rejected as `UNSUPPORTED_URL`.
   - SSRF attempts to private IP ranges (`http://169.254.169.254`, `http://10.0.0.1`) and redirects to non-TikTok hosts are cleanly blocked.
   - Redirect limit (3 hops) and cycle detection verified.

2. **Durable Media Admission Validation (`durableMediaAdmissionValidation.test.ts`):**
   - 2,147,483,648 byte (2 GiB) boundary strictly enforced.
   - Valid MP4 below limit (100MB) passes.
   - Valid MP4 exactly at 2GB limit passes.
   - Oversized MP4 (> 2GB) throws immediately before any network calls.
   - 0-byte, negative size, and non-MP4 MIME types (`video/webm`, `video/quicktime`) rejected.

3. **Client Upload Construction & Diagnostic Redaction (`durableMediaAdmissionClient.test.ts`):**
   - Resumable upload requests construct proper GCS streaming payload.
   - Sensitive headers, authentication tokens, and cookies are redacted in client error reporting.

4. **Clipping Platform Optimization (`platformAwareOptimization.test.ts`):**
   - TikTok profile is deeply readonly and bounded (15–55s duration window).
   - Vertical 9:16 aspect ratio weighting correctly prioritized over generic horizontal cuts.

5. **Build Materialization (`npm run prebuild` & `npm run build`):**
   - Materialized packaged FFmpeg 7.0.2 and yt-dlp 2026.03.13 into `node_modules/.nexcut-runtime/`.
   - Next.js successfully compiled all static and server-rendered routes without errors.
