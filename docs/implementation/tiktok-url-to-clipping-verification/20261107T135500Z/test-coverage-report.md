# Test Coverage Report

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Test Suite Summary Table

| Test Suite File | Subsystem Verified | Tests Run | Passed | Failed | Exit Code | Log Location |
|---|---|---|---|---|---|---|
| `tests/urlAcquisition/classifyTikTokUrl.test.ts` | TikTok URL classification, redirect security, SSRF defenses | 8 | 8 | 0 | 0 | `raw-test-logs/classify-tiktok-url.log` |
| `tests/urlAcquisition/classifyUrl.test.ts` | Canonical URL classification baseline & YouTube V1 | 8 | 8 | 0 | 0 | `raw-test-logs/classify-url.log` |
| `tests/urlAcquisition/tiktokPipelineHandoff.test.ts` | Fingerprinting, clipping profile, and asset contract | 3 | 3 | 0 | 0 | `raw-test-logs/tiktok-pipeline-handoff.log` |
| `tests/clipPlatform/platformAwareOptimization.test.ts` & `tests/clipCandidates/unifiedClipCandidateFoundation.test.ts` | TikTok clipping platform profile & candidate foundation | 23 | 23 | 0 | 0 | `raw-test-logs/clipping-platform-optimization.log` |
| `tests/clipBoundary/*.test.ts`, `tests/clipRanking/*.test.ts`, `tests/clipEditing/*.test.ts` | Story boundaries, quality scoring, portfolio selection | 51 | 51 | 0 | 0 | `raw-test-logs/clipping-pipeline-stages.log` |
| Synthetic FFmpeg Export Test | Packaged FFmpeg 9:16 vertical MP4 export execution | 1 | 1 | 0 | 0 | `raw-test-logs/ffmpeg-export-execution.log` |
| `npm run prebuild` | Materialization of packaged FFmpeg and yt-dlp binaries | N/A | SUCCESS | 0 | 0 | `raw-test-logs/npm-prebuild.log` |
| `npm run build` | Next.js production build and TypeScript compilation | 58 routes | SUCCESS | 0 | 0 | `raw-test-logs/npm-build.log` |

## 2. Test Execution Details

- **Total Unit & Pipeline Verification Tests Run:** 94
- **Total Tests Passed:** 94
- **Total Tests Failed:** 0
- **Overall Success Rate for TikTok URL-to-Clipping Pipeline:** 100%
