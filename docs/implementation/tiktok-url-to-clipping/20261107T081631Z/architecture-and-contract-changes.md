# Architecture and Contract Changes

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. Type Contract Extensions

### A. `lib/urlAcquisition/types.ts`
Added `SupportedTikTokUrl` and extended `UrlClassification` union:
```typescript
export type SupportedTikTokUrl = Readonly<{
  kind: "SUPPORTED_TIKTOK";
  platform: "tiktok";
  videoId: string;
  authorUsername?: string;
  normalizedUrl: string;
}>;

export type UrlClassification =
  | SupportedYouTubeUrl
  | SupportedTikTokUrl
  | Readonly<{ kind: "UNSUPPORTED_TIKTOK" }>
  | Readonly<{ kind: "UNSUPPORTED_YOUTUBE" }>
  | Readonly<{ kind: "UNSUPPORTED_URL" }>
  | Readonly<{ kind: "INVALID_INPUT" }>;
```

### B. `lib/assetImport/types.ts`
Expanded `CanonicalAssetImportSource` discriminated union:
```typescript
export type CanonicalAssetImportSource =
  | Readonly<{
      platform: "youtube";
      videoId: string;
      normalizedUrl: string;
    }>
  | Readonly<{
      platform: "tiktok";
      videoId: string;
      normalizedUrl: string;
      authorUsername?: string;
    }>;
```

---

## 2. Database Schema Extension

### `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
```sql
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
```

---

## 3. Modular Architecture

```
User enters TikTok URL
         │
         ▼
[ classifyUrl() (lib/urlAcquisition/classifyUrl.ts) ]
         │
         ├──> "SUPPORTED_TIKTOK" (Canonical URL, 18-19 digit Video ID)
         │
         ▼
[ evaluateTikTokAcquisitionGuidance() (lib/urlAcquisition/tiktokAcquisitionState.ts) ]
         │
         ▼
[ UI Guidance & Video Upload Dropzone (app/workspace-flow/page.tsx) ]
         │
         ▼ (User provides authorized MP4 file)
[ Media Admission (/api/media/admit) ]
         │
         ▼
[ PostgreSQL: workflow.jobs & workflow.media ]
         │
         ▼
[ Existing Downstream Clipping Pipeline ]
- /api/audio-energy & /api/transcript/durable
- CLIP_PLATFORM_PROFILES_V1.tiktok (15-55s duration, 0.22 hook)
- /api/cut & /api/multi-cut (9:16 vertical crop)
- Multi-cut ZIP packaging
```
