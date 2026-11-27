# Test Matrix and Results

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. Test Suite Summary

| Suite / Test File | Purpose | Tests | Result | Duration |
|---|---|---|---|---|
| `tests/urlAcquisition/classifyTikTokUrl.test.ts` | TikTok URL parsing, normalization, non-video rejection, redirect resolution, guidance | 7 | PASS | 431 ms |
| `tests/urlAcquisition/tiktokPipelineHandoff.test.ts` | Asset import fingerprinting, clip profile alignment, platform contract discriminator | 3 | PASS | 412 ms |
| `tests/urlAcquisition/classifyUrl.test.ts` | Backward compatibility of YouTube URL classification and baseline boundaries | 8 | PASS | 802 ms |
| `tests/clipPlatform/platformAwareOptimization.test.ts` | Optimization targets and profiles including dedicated "tiktok" target | 10 | PASS | 529 ms |
| `tests/productionIdentity/durableMediaAdmissionClient.test.ts` | User-provided video file admission to GCS and PostgreSQL | 4 | PASS | 484 ms |
| `tests/productionIdentity/durableMultiCut.test.ts` | Packaged FFmpeg multi-cut 9:16 vertical crop rendering and ZIP packaging | 8 | PASS | 439 ms |

---

## 2. Next.js Production Build
- Command: `npm run build`
- Prebuild: Materialized packaged FFmpeg binary and yt-dlp binary with verified SHA-256.
- Turbopack Compilation: Compiled successfully in 15.7s.
- TypeScript Verification: Finished TypeScript in 27.2s with zero build errors.
- Page Generation: All 58 pages generated successfully.
