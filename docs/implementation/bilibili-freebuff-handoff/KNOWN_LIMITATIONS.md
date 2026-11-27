# Known Limitations and Operational Boundaries

This document enumerates technical, API, and environmental constraints that Freebuff must respect during implementation.

---

## 1. Bilibili Open Platform API Limitations
- **Rate Limits**:
  - OAuth token acquisition: Maximum 60 requests per minute per IP.
  - Video submission (`video/submit`): Default limit is 20 archive submissions per minute per registered AppID.
  - Exceeding rate limits results in HTTP 429 Too Many Requests with response code `-412` (Request Throttled).
- **Video Format & Encoding Restrictions**:
  - Maximum upload size: 8 GB per video file (NEXCUT currently restricts client exports to 2 GB).
  - Supported containers: MP4, FLV. Preferred container: MP4 (MPEG-4 Part 14).
  - Supported codecs: H.264 / AVC, H.265 / HEVC. Audio: AAC (stereo, 44.1kHz or 48kHz).
- **Metadata Restrictions**:
  - Title: Maximum 80 characters (UTF-8).
  - Description: Maximum 2,000 characters.
  - Tags: Comma-separated; minimum 1 tag, maximum 10 tags; each tag <= 20 characters.
  - Category Partition (`tid`): Must match an existing, valid Bilibili numeric category partition ID (e.g. 17 for Game Highlights, 138 for Funny Clips). Invalid IDs return error `-400`.

---

## 2. Infrastructure and Cloud Boundaries
- **Ephemeral Sandbox Limitations**:
  - In the devbox environment, nested Docker containers cannot extract overlayfs whiteout files. Container-based PostgreSQL integration tests must be executed on GitHub-hosted Actions runners (`ubuntu-latest`).
- **External Partner Credential Dependency**:
  - Live testing against `api.bilibili.com` requires an active Bilibili Enterprise Partner AppID and Secret. Without these, development must strictly use the mock integration harness (`tests/integration/publisherPipeline.test.ts`).
