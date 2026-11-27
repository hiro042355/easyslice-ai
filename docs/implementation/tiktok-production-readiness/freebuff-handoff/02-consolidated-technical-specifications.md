# Deliverable 02: Consolidated Technical Specifications

## 1. Resolution of Architectural Contradictions

During Phase 2.16 through Phase 2.72, several design tensions were evaluated and resolved. This section documents the definitive ground truth to prevent regressions.

### Contradiction 1: Direct TikTok Video Scraping vs. Authorized Media Admission
- **Historical Tension:** Initial exploratory scripts attempted using `yt-dlp` to download raw TikTok URLs directly.
- **Resolution:** Direct binary downloading of TikTok URLs is strictly disallowable due to rapid bot-detection mitigations and platform terms of service.
- **Authoritative Standard:** When a TikTok URL is submitted to `/api/v1/assets/import`, the backend classifies the URL, acknowledges the platform, and responds with guidance requesting authorized MP4 upload via `/api/media/admit`. Direct binary scraping is prohibited.

### Contradiction 2: Synchronous Resource Connection vs. Two-Phase Startup Validation
- **Historical Tension:** Earlier adapter implementations initialized Cloud SQL pools and WIF token clients synchronously during module import, causing connection leaks and startup hangs on malformed configuration.
- **Resolution:** WP-02 and Phase 2.22 decoupled synchronous environment validation (Phase A) from active client instantiation (Phase B).
- **Authoritative Standard:** `withProductionMediaRuntime` in `lib/server/productionMediaRuntime/compositionCore.ts` enforces that Phase A validation of environment variables, WIF provider format, Cloud SQL tuple structure, and GCS bucket name must strictly pass before Phase B (WIF handshake, PG pool creation, GCS client) is invoked.

### Contradiction 3: Universal Check Constraint vs. Tenant-Specific Migration
- **Historical Tension:** Proposal to add a separate table for TikTok imports vs. modifying the existing `workflow.asset_import_requests` table.
- **Resolution:** Re-using `workflow.asset_import_requests` maintains unified outbox events, reconciliation logging, and query interfaces.
- **Authoritative Standard:** `V000009` expands `ck_asset_import_authority` to `CHECK (platform IN ('youtube', 'tiktok'))`.

---

## 2. Core Data Contracts and Interfaces

### 2.1 Asset Import Request Schema (`workflow.asset_import_requests`)
```sql
CREATE TABLE workflow.asset_import_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_uid VARCHAR(128) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    source_url TEXT NOT NULL,
    storage_bucket VARCHAR(128),
    storage_path TEXT,
    content_length_bytes BIGINT,
    mime_type VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'admitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT ck_asset_import_authority CHECK (platform IN ('youtube', 'tiktok')),
    CONSTRAINT ck_asset_import_status CHECK (status IN ('admitted', 'processing', 'completed', 'failed', 'cancelled'))
);
```

### 2.2 TypeScript Data Contracts

#### Canonical Platform Type
```typescript
export type CanonicalAssetImportSource = 'youtube' | 'tiktok';

export interface AssetImportAdmitRequest {
  ownerUid: string;
  platform: CanonicalAssetImportSource;
  sourceUrl: string;
  storageBucket: string;
  storagePath: string;
  contentLengthBytes: number;
  mimeType: 'video/mp4';
}

export interface AssetImportAdmitResponse {
  requestId: string;
  status: 'admitted';
  createdAt: string;
}
```

#### Media Admission Limits
```typescript
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const ALLOWED_MIME_TYPES = ['video/mp4'] as const;
export const TIKTOK_OPTIMAL_WINDOW = {
  minDurationSeconds: 15,
  maxDurationSeconds: 55,
  targetAspectRatio: '9:16',
};
```

---

## 3. Storage and GCS Bucket Authority Specification

```typescript
export function resolveAuthorizedBucketName(appEnv: string): string {
  switch (appEnv) {
    case 'production':
      return 'nexcut-prod-jp-2026-media';
    case 'staging':
      return 'easyslice-staging-media-artifacts';
    default:
      throw new Error(`UNAUTHORIZED_BUCKET_ENVIRONMENT: Environment '${appEnv}' has no authorized GCS bucket.`);
  }
}
```
- Bucket paths must follow the tenant isolation format: `assets/${ownerUid}/${requestId}/source.mp4`.
- Signed URLs must enforce `Content-Type: video/mp4` and expire in `<= 900` seconds (15 minutes).

---

## 4. Database Connection Safety Guard Specification

`lib/workflowMigration/localConnectionGuard.ts`:
- Enforces that any test runner attempting database operations connects strictly to `127.0.0.1` or `localhost`.
- If `process.env.PGHOST` or connection client config resolves to any external domain (including `.internal` or IP addresses outside loopback), execution immediately throws:
  `SECURITY_VIOLATION: Non-local database connection rejected in local migration runner.`
