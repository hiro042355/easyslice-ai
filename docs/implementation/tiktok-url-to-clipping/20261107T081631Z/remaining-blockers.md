# Remaining Blockers

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. External Requirements Blockers

| Blocker | Category | Resolution Requirement |
|---|---|---|
| **Absence of Official TikTok Raw MP4 Download API** | External Platform Policy | TikTok does not provide an official API to download video binaries from URLs. |
| **TikTok Terms of Service (Sec. 5)** | Legal & Compliance | Prohibits automated scraping or downloading of content without express written authorization. |
| **Product Owner Policy on Automated Extraction** | PO Governance | Automated binary extraction using scraping tools is prohibited until explicit Product Owner and Legal approval is granted. |
| **Production Database Migration** | Infrastructure | Migration `V000009__expand_asset_import_platform.sql` requires authorized execution during a scheduled maintenance window. |

---

## 2. Unblocked & Fully Functional Paths
- Recognition, validation, and normalization of TikTok URLs.
- Extraction of video IDs and usernames.
- User-provided video file admission and durable storage.
- Audio energy analysis and AI highlight clipping.
- Vertical 9:16 crop rendering and ZIP export.
