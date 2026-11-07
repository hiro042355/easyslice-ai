# TikTok URL Handling Audit

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Inventory of URL Handling Code in Repository

| Location | Purpose | Current Behavior | TikTok Support |
|---|---|---|---|
| `lib/urlAcquisition/classifyUrl.ts` | Authoritative server & client URL classification | Inspects host against `AUTHORIZED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}`. Parses 11-char video ID. | **Returns `{ kind: "UNSUPPORTED_URL" }`** for any TikTok URL. |
| `lib/urlAcquisition/types.ts` | Type definitions for classification | Defines `UrlClassification` union (`SUPPORTED_YOUTUBE`, `UNSUPPORTED_YOUTUBE`, `UNSUPPORTED_URL`, `INVALID_INPUT`). | **No TikTok type exists** in union. |
| `lib/urlImport.ts` | Lightweight frontend URL source detector | Calls `classifyUrl(value)`. If not YouTube, parses hostname and checks `hostname === "tiktok.com" \|\| hostname.endsWith(".tiktok.com")`. Returns `"tiktok"`. | **String detection only**; no validation, no video ID extraction. |
| `app/workspace-flow/page.tsx:808` | "Universal URL Import" UI | Displays `Detected Source: TikTok` when `detectUrlSource` returns `"tiktok"`. | **Passive UI label only**. Safety warning explicitly states video fetching is not performed. |
| `app/api/v1/assets/import/route.ts` | Production import mutation endpoint | Delegates to `readAssetImportRequest()` (`lib/server/assetImport/requestBoundary.ts:40`). | **Rejects with HTTP 422 `unsupported_source`**. |
| `lib/server/acquisitionWorker/contracts.ts` | Worker request validation contract | Validates `AcquisitionRequest.source === "youtube"`. | **Rejects with `unsupported-source` error**. |

---

## 2. TikTok URL Patterns Analysis

TikTok uses diverse URL structures across web, mobile apps, and regional marketing:

### A. Standard Desktop / Web Video URLs
```
https://www.tiktok.com/@username/video/7123456789012345678
https://tiktok.com/@username/video/7123456789012345678
https://m.tiktok.com/v/7123456789012345678.html
```
- **Structure:** `@<username>/video/<video_id>`
- **Video ID:** Typically an 18 to 19 digit numerical snowflake integer (`/^\d{18,20}$/`).
- **User identifier:** Can contain letters, numbers, underscores, and dots (`@[\w.-]+`).
- **Query parameters:** Frequently carries tracking tokens (`?is_from_webapp=1&sender_device=pc&_r=1`). Must be stripped to obtain canonical form.

### B. Shortened Mobile Share URLs
```
https://vm.tiktok.com/ZMxxxxxxx/
https://vt.tiktok.com/ZSxxxxxxx/
https://www.tiktok.com/t/ZTxxxxxxx/
```
- **Characteristics:** Highly dynamic alphanumeric tokens (e.g. 9–10 chars).
- **Behavior:** These short URLs do **not** contain the video ID directly in their pathname. They return HTTP 301/302/307 redirects to the canonical `https://www.tiktok.com/@user/video/<video_id>` URL.
- **Handling requirement:** Redirect resolution (HTTP HEAD or safe GET without following into arbitrary SSRF destinations) is mandatory to extract the canonical video ID.

### C. Non-Video & Edge Case URLs
- **User Profiles:** `https://www.tiktok.com/@username` (Not a video; must be classified as unsupported).
- **TikTok LIVE:** `https://www.tiktok.com/@username/live` (Streaming endpoint; not an MP4 video asset).
- **Audio / Sounds:** `https://www.tiktok.com/music/original-sound-12345678` (Audio asset, not video).
- **Tags / Challenges:** `https://www.tiktok.com/tag/challenge_name` (Hashtag feed).
- **TikTok Photo / Slideshow:** `https://www.tiktok.com/@username/photo/7123456789012345678` (Multiple images + audio track; not an MP4 container).

---

## 3. Availability, Privacy, and Regional Restrictions

When handling TikTok video URLs, the system must anticipate the following statuses:

1. **Deleted or Invalid Video ID:**
   - TikTok web returns HTTP 404 or a redirect to the home page `/`.
   - The system must detect this and return a structured `video_not_found` error rather than a generic timeout.
2. **Private Video:**
   - Accessible only to the creator or approved friends.
   - External requests without user authentication fail with access denied.
3. **Region / Geo-Blocked Content:**
   - Videos restricted by geography or copyright agreements return regional blocks depending on server egress IP.
4. **Age-Gated / Sensitive Content:**
   - Content flagged for mature audiences requires account login with age verification.
5. **Rate-Limiting & Bot Mitigation:**
   - TikTok uses ByteDance edge defenses and Akamai Bot Manager. Requests from cloud datacenter IP ranges (AWS, GCP, Azure) are routinely served HTTP 403 or JavaScript/CAPTCHA challenges (`Verify you are human`).

---

## 4. Current Repository Capability Assessment

| Capability | Current State | Evidence |
|---|---|---|
| TikTok URL Recognition | Basic Hostname Match | `lib/urlImport.ts:18-20` checks `hostname === "tiktok.com" \|\| hostname.endsWith(".tiktok.com")`. |
| Video ID Extraction | Not Implemented | `lib/urlAcquisition/classifyUrl.ts` contains only YouTube regex `/^[A-Za-z0-9_-]{11}$/`. |
| URL Normalization | Not Implemented | No query parameter strip, no standard path format builder. |
| Short URL / Redirect Resolution | Not Implemented | No HTTP HEAD/GET redirect-following routine exists for incoming URLs. |
| Metadata Extraction (Web/API) | Not Implemented | No oEmbed or TikTok API client exists in the repository. |
| Binary Download Adapter | Not Implemented | `lib/server/acquisitionWorker/` only implements `YouTubeSourceAdapter`. |
| Error Message Mapping | Not Implemented | `app/workspace-flow/page.tsx:325` has YouTube bot error checks, but zero TikTok error handling. |

---

## 5. Summary Conclusion
While the UI displays a placeholder recognition badge for TikTok URLs, the application has **zero backend capability** to normalize, resolve, inspect, or acquire TikTok video assets from URLs.
