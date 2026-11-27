# TikTok URL Input Verification Report

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Supported TikTok URL Patterns

| Pattern Category | Sample Input URL | Classification Result | Video ID Extracted | Normalized Canonical URL |
|---|---|---|---|---|
| Desktop Canonical | `https://www.tiktok.com/@creator/video/7123456789012345678` | `SUPPORTED_TIKTOK` | `7123456789012345678` | `https://www.tiktok.com/@creator/video/7123456789012345678` |
| Desktop with Query | `https://www.tiktok.com/@creator/video/7123456789012345678?is_from_webapp=1&sender_device=pc` | `SUPPORTED_TIKTOK` | `7123456789012345678` | `https://www.tiktok.com/@creator/video/7123456789012345678` |
| Mobile Short Path | `https://m.tiktok.com/v/7123456789012345678.html` | `SUPPORTED_TIKTOK` | `7123456789012345678` | `https://www.tiktok.com/v/7123456789012345678.html` |
| Short Host `vm.tiktok.com` | `https://vm.tiktok.com/ZMxxxxxxx/` | `UNSUPPORTED_TIKTOK` (pre-resolution) -> Resolved via `resolveSafeTikTokRedirect` | Post-redirect resolved | Canonical desktop URL |
| Short Host `vt.tiktok.com` | `https://vt.tiktok.com/ZSxxxxxxx/` | `UNSUPPORTED_TIKTOK` (pre-resolution) -> Resolved via `resolveSafeTikTokRedirect` | Post-redirect resolved | Canonical desktop URL |

## 2. Unsupported and Safe Rejection Patterns

| Input Pattern | Sample URL | Output Classification | Reason / Behavior |
|---|---|---|---|
| User Profile | `https://www.tiktok.com/@some_user` | `UNSUPPORTED_TIKTOK` | Missing `/video/:id` segment; non-video target |
| LIVE Stream | `https://www.tiktok.com/@creator/live` | `UNSUPPORTED_TIKTOK` | Live streams are non-finite streams, not clipping targets |
| Sound / Music Track | `https://www.tiktok.com/music/original-sound-7123456789012345678` | `UNSUPPORTED_TIKTOK` | Audio-only asset; requires video context |
| Tag / Hashtag | `https://www.tiktok.com/tag/trending` | `UNSUPPORTED_TIKTOK` | Aggregate feed; non-video target |
| Photo / Image Carousel | `https://www.tiktok.com/@creator/photo/7123456789012345678` | `UNSUPPORTED_TIKTOK` | Non-video slide asset |
| Non-Snowflake Video ID | `https://www.tiktok.com/@creator/video/abc123` | `UNSUPPORTED_TIKTOK` | Fails snowflake pattern `/^\d{18,20}$/` |
| Phishing / Lookalike Host | `https://www.tiktok.com.phishing.example/video/7123456789012345678` | `UNSUPPORTED_URL` | Untrusted host not in allowlist |
| Subdomain Impersonator | `https://evil-tiktok.com/@creator/video/7123456789012345678` | `UNSUPPORTED_URL` | Untrusted host |
| Non-HTTP Protocol | `javascript:alert(1)` / `file:///etc/passwd` | `INVALID_INPUT` | Only HTTP/HTTPS protocols permitted |
| Excessive Input Length | String length > 2048 chars | `INVALID_INPUT` | Input bounded to prevent regex DoS |

## 3. Test Verification Details

- **Test Suite:** `tests/urlAcquisition/classifyTikTokUrl.test.ts`
- **Tests Executed:** 8 tests
- **Tests Passed:** 8 tests
- **Exit Code:** 0
- **Raw Log Reference:** `raw-test-logs/classify-tiktok-url.log`
