# Source Contract Integration: Video Source Layer & TikTok Adapter

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Existing Contracts in the Repository

### A. Core Video Source Layer Contracts
The repository defines two primary representations for video assets:

1. **Durable Media Ownership Entity** (`lib/server/durableMediaOwnership/`):
   ```typescript
   export type OwnedJob = Readonly<{
     id: string; // UUID v4
     ownerUid: string;
     createdAt: string;
     updatedAt: string;
   }>;

   export type OwnedMedia = Readonly<{
     id: string; // UUID v4
     jobId: string; // UUID v4
     ownerUid: string;
     purpose: "input" | "export";
     mimeType: string; // "video/mp4"
     storageKey: string; // "media/${jobId}/${mediaId}/input.mp4"
     createdAt: string;
   }>;
   ```
   - **PostgreSQL Schema:** Tables `workflow.jobs` and `workflow.media`.
   - **Object Storage:** Google Cloud Storage bucket object at `storageKey`.

2. **Source Artifact Identity Contract** (`docs/SOURCE_ARTIFACT_IDENTITY_ADR_V1.md`):
   - `SourceArtifactIdentityV1` is represented by `SourceArtifactReference` (`version: "1.0"`, `opaqueSourceArtifactReference: string`).
   - Represents an immutable logical source-media registration.
   - Section 13: *"Source type is exactly upload or youtube in V1. Additional providers require an additive provider value and authoritative provider object ID."*

3. **Production Asset Import Source Contract** (`lib/assetImport/types.ts`):
   ```typescript
   export type CanonicalAssetImportSource = Readonly<{
     platform: "youtube";
     videoId: string;
     normalizedUrl: string;
   }>;

   export type AssetImportSuccess = Readonly<{
     responseVersion: "1.0";
     status: "succeeded";
     jobId: string;
     mediaId: string;
     durationSeconds: number;
     source: CanonicalAssetImportSource;
   }>;
   ```

4. **Database Check Constraint** (`db/workflow/migrations/V000008__add_asset_import_idempotency.sql:21`):
   ```sql
   CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube'),
   ```

---

## 2. Can the Existing Video Source Layer Accept TikTok Assets?

### YES, at the Durable Media Layer (`workflow.jobs` / `workflow.media`):
Once a video binary is acquired (via upload or any future adapter), it registers in `workflow.jobs` and `workflow.media` without requiring schema changes. The `mime_type` is `"video/mp4"`, and the storage key follows standard conventions.
All downstream clipping functions (`/api/cut`, `/api/multi-cut`, `/api/audio-energy`, `/api/transcript/durable`) only require `{ jobId, mediaId }`. They have zero awareness of whether the video originated from YouTube, TikTok, or local file upload.

### NO, at the Asset Import Boundary (`/api/v1/assets/import`):
The asset import boundary is currently hardcoded and constrained to YouTube:
1. `CanonicalAssetImportSource.platform` is typed as `"youtube"`.
2. `lib/server/assetImport/requestBoundary.ts:40` rejects non-YouTube classifications.
3. Database table `workflow.asset_import_requests` has check constraint `ck_asset_import_authority` allowing only `platform = 'youtube'`.

---

## 3. Minimal Backward-Compatible Adapter Contract

To support TikTok video assets in the future without breaking existing contracts or duplicating pipelines, the smallest additive modifications required are:

### A. Extend `UrlClassification` (`lib/urlAcquisition/types.ts`)
```typescript
export type SupportedTikTokUrl = Readonly<{
  kind: "SUPPORTED_TIKTOK";
  platform: "tiktok";
  videoId: string; // 18-19 digit snowflake ID
  authorUsername?: string;
  normalizedUrl: string; // "https://www.tiktok.com/@{user}/video/{id}"
}>;

export type UrlClassification =
  | SupportedYouTubeUrl
  | SupportedTikTokUrl
  | Readonly<{ kind: "UNSUPPORTED_TIKTOK" }>
  | Readonly<{ kind: "UNSUPPORTED_YOUTUBE" }>
  | Readonly<{ kind: "UNSUPPORTED_URL" }>
  | Readonly<{ kind: "INVALID_INPUT" }>;
```

### B. Extend `CanonicalAssetImportSource` (`lib/assetImport/types.ts`)
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

### C. Database Migration (`V000009__expand_asset_import_platform.sql`)
```sql
ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;
ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
```

### D. Source Adapter Interface Implementation
Conforming to the existing `SourceAdapter` interface in `lib/server/acquisitionWorker/sourceAdapter.ts`:
```typescript
export class TikTokSourceAdapter implements SourceAdapter {
  readonly source = "tiktok" as const;

  supports(request: ValidatedAcquisitionRequest): boolean {
    return request.source === "tiktok";
  }

  async acquire(context: SourceAcquisitionContext): Promise<void> {
    // Isolated acquisition logic writing to context.workspace.outputPath
  }
}
```

---

## 4. Contract Handoff Comparison

| Field | YouTube Direct Importer | Proposed TikTok Adapter | Notes |
|---|---|---|---|
| `platform` | `"youtube"` | `"tiktok"` | Discriminated union |
| `videoId` | 11 chars `[A-Za-z0-9_-]{11}` | 18–19 digits `\d{18,20}` | Snowflake ID format |
| `normalizedUrl` | `https://www.youtube.com/watch?v={id}` | `https://www.tiktok.com/@{user}/video/{id}` | Canonical stripped of query tracking |
| `jobId` | UUID v4 | UUID v4 | Identical |
| `mediaId` | UUID v4 | UUID v4 | Identical |
| `mimeType` | `"video/mp4"` | `"video/mp4"` | Standardized |
| `durationSeconds` | Extracted via FFmpeg | Extracted via FFmpeg | Identical validator (`inspectIngestedVideo`) |
| Storage Key | `media/${jobId}/${mediaId}/input.mp4` | `media/${jobId}/${mediaId}/input.mp4` | Stored in common GCS bucket |

---

## 5. Summary Conclusion
The downstream Video Source Layer and clipping engine require **no structural changes** to accept TikTok videos. Only the upstream import boundary (`classifyUrl`, `CanonicalAssetImportSource`, and the DB check constraint) needs an additive extension.
