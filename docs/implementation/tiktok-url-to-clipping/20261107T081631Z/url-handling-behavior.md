# TikTok URL Handling Behavior

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. Supported URL Patterns

| URL Pattern | Classification | Extracted Fields | Canonical Normalized URL |
|---|---|---|---|
| `https://www.tiktok.com/@user/video/7123456789012345678` | `SUPPORTED_TIKTOK` | `videoId`, `authorUsername` | `https://www.tiktok.com/@user/video/7123456789012345678` |
| `https://tiktok.com/@user/video/7123456789012345678` | `SUPPORTED_TIKTOK` | `videoId`, `authorUsername` | `https://www.tiktok.com/@user/video/7123456789012345678` |
| `https://m.tiktok.com/v/7123456789012345678.html` | `SUPPORTED_TIKTOK` | `videoId` | `https://www.tiktok.com/v/7123456789012345678.html` |
| `https://vm.tiktok.com/ZM8rD3abc/` | `UNSUPPORTED_TIKTOK` (Prior to redirect) / `SUPPORTED_TIKTOK` (Post `resolveSafeTikTokRedirect()`) | `videoId`, `authorUsername` | `https://www.tiktok.com/@user/video/7123456789012345678` |

---

## 2. Tracking Parameter Stripping
All tracking queries are stripped during canonical normalization:
- Input: `https://www.tiktok.com/@creator/video/7123456789012345678?is_from_webapp=1&sender_device=pc&_r=1&utm_source=share`
- Normalized: `https://www.tiktok.com/@creator/video/7123456789012345678`

---

## 3. Unsupported / Rejected Patterns

| Input | Classification Result | Reason |
|---|---|---|
| `https://www.tiktok.com/@creator` | `UNSUPPORTED_TIKTOK` | Profile page; not a video |
| `https://www.tiktok.com/@creator/live` | `UNSUPPORTED_TIKTOK` | Live stream; not a recorded video asset |
| `https://www.tiktok.com/tag/challenge` | `UNSUPPORTED_TIKTOK` | Hashtag page |
| `https://www.tiktok.com/music/sound-1234` | `UNSUPPORTED_TIKTOK` | Audio sound asset |
| `https://www.tiktok.com/@creator/photo/7123456789012345678` | `UNSUPPORTED_TIKTOK` | Photo carousel |
| `http://www.tiktok.com/@user/video/7123456789012345678` | `UNSUPPORTED_TIKTOK` | Insecure HTTP scheme |
| `https://user:pass@www.tiktok.com/@user/video/7123...` | `UNSUPPORTED_TIKTOK` | Embedded authentication credentials |
| `https://tiktok.com.evil.com/@user/video/7123...` | `UNSUPPORTED_URL` | Lookalike / phishing hostname |
