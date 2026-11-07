# TikTok Terms and Acquisition Boundary Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `PASS` (Strictly Compliant with Platform Policies)

---

## 1. Regulatory, Terms of Service, and API Boundary Review

### A. TikTok Developer Terms & API Limitations
1. **Absence of Binary Download Endpoints:**
   - TikTok official APIs (Display API, Content Posting API, Research API) do not offer endpoints for extracting raw source MP4 video streams from arbitrary URLs.
   - oEmbed endpoints provide metadata and HTML embed tags (`<iframe>`), but strictly disallow programmatic scraping of underlying CDN media URLs.
2. **TikTok Terms of Service (Section 5):**
   - Expressly prohibits unauthorized automated access, scraping, reverse engineering, or caching of content without explicit authorization.
3. **Architecture Adherence:**
   - The NEXCUT AI platform does **not** invoke `yt-dlp` or any scraper against TikTok domain endpoints.
   - All TikTok URL recognition is strictly confined to parsing, validation, redirect resolution, and presenting clear user guidance.

---

## 2. User-Facing Clarity Audit

| UI Surface / Component | Rendered Text / Notice | Assessment | Risk Level |
|---|---|---|---|
| `app/workspace-flow/page.tsx:850-890`<br>`lib/urlAcquisition/tiktokAcquisitionState.ts` | **Title:** "TikTok動画URLを認識しました"<br>**Explanation:** "TikTok公式APIは動画MP4バイナリの自動取得を提供していません。また、利用規約（第5条）およびクリエイターの権利保護に基づき、無断スクレイピングや自動ダウンロードは行いません。"<br>**Action Required:** "お持ちの動画ファイル（MP4形式）を直接アップロードしてください。アップロードされた動画は既存のAIハイライト解析・縦型9:16切り出し・字幕生成パイプラインで処理されます。" | Clear, unambiguous, legally accurate. Sets explicit expectation that pasting a URL does not download the video. | NONE (Compliant) |
| `app/workspace-flow/page.tsx:892-901` | **URL Import Safety Notice:**<br>• 現在はURL判定のみです。<br>• YouTube URL取得はβ対応です。<br>• TikTok URLは認識・正規化と動画ファイル連携に対応しています。<br>• 利用権限のある動画のみ使用してください。 | Proactively warns creators about copyright compliance and platform status. | NONE (Compliant) |
| `app/workspace-flow/page.tsx:903-905` | "判定のみのFoundationです。既存のYouTube取得処理とは分離しています。" | Technical boundary note reinforcing that TikTok handling is decoupled from YouTube downloading. | NONE (Compliant) |

---

## 3. Boundary Preservation Verdict

- **Result:** `PASS`.
- The current implementation strictly complies with platform boundaries, prevents unauthorized scraping, protects creator rights, and clearly guides users without false expectations.
