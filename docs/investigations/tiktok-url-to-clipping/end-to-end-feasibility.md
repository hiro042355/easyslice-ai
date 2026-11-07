# End-to-End Feasibility Assessment: TikTok URL to Clipped Video

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Step-by-Step Scenario Evaluation

We evaluated the hypothetical end-to-end execution of a user entering a TikTok video URL:

| Step | Pipeline Stage | Current Status | First Failure Point? | Detailed Finding |
|---|---|---|---|---|
| **1** | User enters TikTok video URL into UI | **PARTIALLY WORKING** | No | `app/workspace-flow/page.tsx` accepts the input, and `detectUrlSource()` identifies `"tiktok"`, but UI only shows a label and has no button or handler wired to send TikTok URLs to `/api/v1/assets/import`. |
| **2** | NEXCUT validates and classifies URL | **NOT IMPLEMENTED** | **YES (Primary Gate Failure)** | `classifyUrl(input)` in `lib/urlAcquisition/classifyUrl.ts` immediately returns `{ kind: "UNSUPPORTED_URL" }`. |
| **3** | Determine lawful & technical acquisition method | **EXTERNALLY BLOCKED** | **YES (Hard Blocker)** | Official TikTok APIs do not provide a video binary download endpoint. Scraping violates TikTok Terms of Service (Sec. 5) and NEXCUT security architecture. |
| **4** | Acquire actual video binary | **EXTERNALLY BLOCKED** | **YES (Physical Binary Missing)** | Without an official download API or approved scraping worker, the system cannot obtain the MP4 binary from the URL. |
| **5** | Register asset in Video Source Layer | **VERIFIED WORKING** (conditional on MP4) | No | Given an MP4 binary, `workflow.jobs` and `workflow.media` can register the asset immediately. |
| **6** | Ingestion accepts asset into workspace | **VERIFIED WORKING** (conditional on MP4) | No | Returning `{ status: "succeeded", jobId, mediaId }` loads the video player in `workspace-flow`. |
| **7** | Analysis & transcription execute | **VERIFIED WORKING** | No | `/api/audio-energy` and `/api/transcript/durable` download the MP4 from GCS and execute FFmpeg / Gemini successfully. |
| **8** | Clip candidate generation executes | **VERIFIED WORKING** | No | `lib/clipRanking/` and `lib/clipPlatform/` (with `"tiktok"` profile) score and select optimal clips. |
| **9** | Cutting & subtitle workflows execute | **VERIFIED WORKING** | No | `/api/cut` and `/api/multi-cut` execute packaged FFmpeg to produce cropped MP4s. |
| **10** | Preview, QA, and export execute | **VERIFIED WORKING** | No | In-browser preview and `/api/burn-subtitle` execute reliably. |
| **11** | User receives resulting clips | **VERIFIED WORKING** | No | AdmZip bundles the MP4s into a `.zip` file downloaded via browser. |

---

## 2. Identification of the First Point of Failure

The current implementation fails at **Step 2**:
```typescript
// lib/urlAcquisition/classifyUrl.ts:18
const host = url.hostname.toLowerCase();
if (!AUTHORIZED_HOSTS.has(host)) return Object.freeze({ kind: "UNSUPPORTED_URL" });
```
Because `AUTHORIZED_HOSTS` only includes YouTube domains (`youtube.com`, `youtu.be`), entering a TikTok URL causes `classifyUrl` to return `{ kind: "UNSUPPORTED_URL" }`.

When submitted to the production asset import route:
```typescript
// lib/server/assetImport/requestBoundary.ts:40
const classified = classifyUrl(value.sourceUrl);
if (classified.kind !== "SUPPORTED_YOUTUBE") return reject(422, "unsupported_source");
```
The server rejects the request with HTTP 422 `unsupported_source`.

Even if `classifyUrl` were modified to accept TikTok URLs, the execution would immediately halt at **Step 3 & 4 (Source Acquisition)**: no official API exists to download the video binary, and NEXCUT has no `TikTokSourceAdapter` or acquisition backend.

---

## 3. Separation of Mock / Local Tests vs Real URL Acquisition

It is critical to distinguish between test fixture success and actual TikTok URL acquisition:

1. **Local Test Success:**
   - NEXCUT has tests verifying MP4 processing, FFmpeg cutting, and TikTok target profiles (`tests/clipPlatform/platformAwareOptimization.test.ts`).
   - These tests pass because they use synthetic duration inputs or pre-existing local MP4 fixtures.
2. **Real TikTok URL Reality:**
   - Entering an actual TikTok URL (e.g. `https://www.tiktok.com/@creator/video/7123456789012345678`) **cannot** currently produce a video or a clip in NEXCUT AI.
   - Any claim that TikTok URL acquisition currently functions is false.

---

## 4. Overall Feasibility Conclusion

- **Is the end-to-end scenario currently possible?**
  **NO.** It is broken at Step 2 (Classification) and blocked at Step 3/4 (Acquisition).
- **Can it become possible?**
  - If reliant on **official TikTok APIs alone**, automated binary download is **NOT FEASIBLE** due to lack of API support.
  - If implemented via **User File Upload or User-Authorized Export**, the entire end-to-end pipeline is **100% FEASIBLE TODAY**, requiring only UI flow polish and guidance.
