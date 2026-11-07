# Acquisition Method Assessment: Legal, Platform Terms, and Technical Viability

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Evaluation Matrix of Candidate Acquisition Methods

| Method | Can Provide Raw MP4 Binary? | Official / Documented? | Terms & Legal Permissibility | Authentication / Pre-requisites | Overall Viability |
|---|---|---|---|---|---|
| **A. Official TikTok Developer APIs** | **NO** (Metadata & embed only) | **YES** | **Permitted** (within scope) | TikTok Developer App, OAuth 2.0, App Review | **INSUFFICIENT** (Cannot supply video binary for clipping) |
| **B. User-Provided Video File Upload** | **YES** (Direct MP4 binary) | **YES** (Standard browser upload) | **Permitted** (Creator owns/controls asset) | User authenticated session (`/api/media/admit`) | **VERIFIED WORKING** (Existing core architecture) |
| **C. User-Authorized Creator Export** | **YES** (Authorized file or link) | **YES** (Platform data portability) | **Permitted** (Creator rights) | Creator credentials / manual export | **FEASIBLE** (Supported via workflow) |
| **D. Automated Scraping / yt-dlp / Third-Party** | **Technically YES** (Ephemeral stream URL) | **NO** (Unofficial reverse-engineering) | **VIOLATES** TikTok Terms of Service (Sec. 5); high IP blocking risk | Cloud egress IP, anti-bot circumvention | **DISALLOWED** (Violates TOS and NEXCUT security policy) |

---

## 2. In-Depth Analysis by Acquisition Method

### Method A: Official TikTok Developer APIs

TikTok provides developer access through the TikTok for Developers portal (`developers.tiktok.com`). We investigated all public API products:

1. **Content Posting API (formerly Direct Post):**
   - **Purpose:** Allows third-party applications to publish video and photo content directly to a user's TikTok account.
   - **Data Provided:** Accepts video uploads via chunked upload URLs. Does **not** provide endpoints to download videos from existing URLs.
   - **Scopes:** `video.upload`, `video.publish`.
   - **Compatibility with Ingestion:** Ingestion requires video *intake*, not publication.

2. **Display API (Video Kit / Embed):**
   - **Purpose:** Embeds TikTok videos on third-party websites and fetches video metadata.
   - **Data Provided:** oEmbed endpoint (`https://www.tiktok.com/oembed?url={url}`) returns JSON: `title`, `author_name`, `author_url`, `html` (`<blockquote>` embed code), `thumbnail_url`, `width`, `height`.
   - **Binary Availability:** **No video download URL or binary stream is returned.** The `html` snippet loads an `<iframe>` player that streams directly inside the user's browser, protected by DRM and CORS.

3. **Research API:**
   - **Purpose:** Provides academic and non-profit researchers access to public TikTok data.
   - **Data Provided:** Post statistics, view counts, comments, user metadata. Video binaries are not provided.
   - **Eligibility:** Strict vetting; commercial applications are prohibited.

4. **Commercial Content API:**
   - **Purpose:** Advertisers and marketing partners. Provides ad campaign metrics, not video downloads.

**Conclusion for Method A:**
Official TikTok APIs **cannot** be used to download the video binary required for clipping.

---

### Method B: User-Provided Video Files (Local File Upload)

- **Data Provided:** Raw binary file directly from the user (`video/mp4`, `video/webm`, `video/quicktime`).
- **Permissions:** The user explicitly selects their own video file. No third-party API keys or OAuth permissions required.
- **Contract Compatibility:** 100% compatible. The existing `/api/media/admit` and `/api/upload-video` endpoints already handle this:
  - Generates client-side or server-side signed storage references.
  - Registers the file in `workflow.jobs` and `workflow.media`.
  - FFmpeg inspects duration, width, height, and codec.
- **Operational Status:** Already implemented and operational in production.

---

### Method C: User-Authorized Creator Studio Exports

- **Concept:** TikTok allows creators to download their own published videos without watermarks via TikTok Creator Studio or TikTok App ("Save video" / Data Export under GDPR/CCPA).
- **Workflow:** The creator downloads their master or high-resolution TikTok asset to their device, then supplies it to NEXCUT via the Upload flow.
- **Legality & Rights:** Completely lawful. The content creator owns copyright or possesses licensing rights to their own work.
- **Technical Requirement in NEXCUT:** Provide clear onboarding guidance and drag-and-drop support for TikTok-formatted vertical videos (1080x1920 MP4).

---

### Method D: Automated Video Scraping & Downloader Libraries (yt-dlp)

We evaluated whether NEXCUT's existing packaged `yt-dlp` (`lib/server/packagedYtDlp.ts`) could be invoked for TikTok URLs:

1. **Technical Capabilities:**
   - yt-dlp has a built-in extractor for TikTok (`yt_dlp/extractor/tiktok.py`).
   - Given a public URL, it attempts to parse the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON or mobile API response to locate the CDN video stream URL (`v16-webapp-prime.tiktokcdn.com`).
2. **TikTok Terms of Service (Terms of Service, Section 5 "Access and Use of Our Services"):**
   - Explicitly states: *"You will not ... use any robot, spider, crawler, scraper, or other automated means or interface to access the Services or extract data, or attempt to circumvent any content-filtering techniques we employ"*.
   - Automated downloading of third-party videos without rights holder permission creates copyright and trademark infringement liabilities.
3. **Anti-Bot & Bot Detection Countermeasures:**
   - TikTok routinely blocks requests from cloud datacenter IP addresses (AWS, GCP, Vercel).
   - Incurring Akamai Bot Manager challenges results in empty or corrupted video streams.
4. **NEXCUT Security Architecture Compliance:**
   - `docs/ACQUISITION_WORKER_ARCHITECTURE_V1.md` explicitly codifies:
     *"Cookies, browser extraction, YouTube accounts, shared credentials, private/age/region/DRM bypasses, shell commands, client-selected paths, and arbitrary URL fetching are prohibited."*
   - Circumventing TikTok's access controls would violate NEXCUT's architecture principles.

---

## 3. Summary of Categories

| Category | Assessment |
|---|---|
| **Technically Possible** | Scraping via yt-dlp / direct stream extraction (unstable, high failure rate). User upload of exported file (reliable, 100% success). |
| **Officially Supported** | TikTok Display API (metadata only, no binary). Direct upload (standard web standard). |
| **Permitted under Terms & Rights** | User file upload; creator-authorized exports. Scraping without written consent is expressly prohibited. |
| **Verified in this Repository** | File upload to GCS + PostgreSQL job admission (`/api/media/admit`). Packaged FFmpeg clipping (`/api/cut`, `/api/multi-cut`). |
