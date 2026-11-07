# Acquisition Limitations

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. Technical Limitations of TikTok Official APIs
- **Content Posting API:** Designed strictly for uploading/publishing videos to TikTok. It does not provide endpoints to download video binaries from public URLs.
- **Display API (Video Kit / Embed):** Provides oEmbed metadata (title, author, thumbnail) and `<blockquote>` iframe HTML code. No downloadable MP4 binary or raw video stream is provided.
- **Research API & Commercial Content API:** Restricted to approved academic researchers and advertisers. Bulk MP4 downloading is not supported.

---

## 2. Legal and Terms of Service Boundaries
- **TikTok Terms of Service (Section 5):**
  - Prohibits automated harvesting, scraping, crawling, or downloading without prior written consent from TikTok.
- **NEXCUT Security Architecture (`docs/ACQUISITION_WORKER_ARCHITECTURE_V1.md`):**
  - Strictly prohibits cookies, browser session extraction, shared accounts, and access-control bypasses.
  - Automated downloading of public TikTok URLs without explicit creator authorization creates copyright and trademark infringement liabilities.

---

## 3. Strategy: User-Provided Video File Fallback
Because official APIs do not supply the MP4 binary and scraping is disallowed, NEXCUT adopts the lawful, creator-authorized fallback:
- The system recognizes the TikTok URL and extracts its metadata.
- The user provides their authorized MP4 video export (e.g. from TikTok Studio or creator camera roll).
- The file is admitted into the common pipeline via `/api/media/admit`.
