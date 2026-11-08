# Google Cloud Storage (GCS) Validation & Authority Design Plan

**Purpose:** Specify the environment-specific bucket authority model, IAM least-privilege permissions, and operational validation procedures for Google Cloud Storage.

---

## 1. GCS Environment-Specific Bucket Authority Design

### Architectural Defect in Current Baseline
In `lib/server/productionMediaRuntime/gcsAdapter.ts` (lines 26–33):
```typescript
export const createProductionMediaBucket = (
  authClient: IdentityPoolClient,
  bucketName: string,
): ReturnType<Storage["bucket"]> => {
  if (bucketName !== "nexcut-prod-jp-2026-media") throw new Error("Invalid Production media bucket authority");
  ...
};
```
The baseline implementation hardcodes `"nexcut-prod-jp-2026-media"`, which prevents staging deployment against `easyslice-staging-media-artifacts`.

### Proposed Fail-Closed Authority Design
To maintain strict production isolation without weakening existing safeguards, the authority model must enforce:
1. **Explicit Environment Discriminator:** Defined via `APP_ENVIRONMENT` (`"production"` | `"staging"`).
2. **Strict Whitelist Authority Map:**
   ```typescript
   const AUTHORIZED_BUCKETS_BY_ENVIRONMENT = Object.freeze({
     production: "nexcut-prod-jp-2026-media",
     staging: "easyslice-staging-media-artifacts",
   } as const);
   ```
3. **Fail-Closed Validation:**
   - If `APP_ENVIRONMENT === "production"`, `bucketName` must strictly equal `"nexcut-prod-jp-2026-media"`.
   - If `APP_ENVIRONMENT === "staging"`, `bucketName` must strictly equal `"easyslice-staging-media-artifacts"`.
   - Any other value, unknown environment, or cross-environment pairing (e.g. staging runtime attempting to touch production bucket or vice-versa) must throw an explicit error and terminate the process.
4. **Target Modification Files:**
   - `lib/server/productionMediaRuntime/gcsAdapter.ts` (`createProductionMediaBucket` / `resolveAuthorizedMediaBucket`)
   - `lib/server/productionMediaRuntime/composition.ts` (pass `APP_ENVIRONMENT` and bucket config)
5. **Required Automated Test Cases:**
   - Production environment rejects staging bucket.
   - Staging environment rejects production bucket.
   - Missing or unknown environment fails closed.
   - Mismatched `MEDIA_BUCKET_NAME` environment variable throws error.

---

## 2. IAM Permission Analysis & Least Privilege

The actual implementation in `app/api/media/admit/route.ts` invokes:
1. `bucket.file(storageKey).createResumableUpload({ origin, metadata })`
2. `bucket.file(storageKey).getMetadata()`
3. `bucket.file(storageKey).delete({ ignoreNotFound: true })`

### Permissions Distinctions
- **Server Identity (`easyslice-staging-app-sa`):**
  - Requires:
    - `storage.objects.create` (resumable upload session creation)
    - `storage.objects.get` (inspect metadata size and MIME on admission finalization)
    - `storage.objects.delete` (compensatory cleanup on transaction failure)
  - Pre-defined Role: `roles/storage.objectAdmin` (or a custom role combining create/get/delete).
  - Scope: Must be bound strictly to the staging bucket resource `projects/_/buckets/easyslice-staging-media-artifacts`.
  - Signing Permission: `iam.serviceAccounts.signBlob` is **NOT** required. The server calls `createResumableUpload` via standard OAuth 2.0 / WIF REST calls to the Cloud Storage API, which returns a Google-issued session URI directly.
- **Client Browser Identity:**
  - Performs direct HTTP `PUT` streaming of binary chunks to the Google-issued resumable session URI.
  - Requires zero GCP IAM permissions or service account tokens.

---

## 3. Staging Bucket Configuration Prerequisites

- **Bucket Name:** `easyslice-staging-media-artifacts`
- **Location:** `asia-northeast1`
- **Uniform Bucket-Level Access:** Enabled (`true`)
- **Public Access Prevention:** Enforced (`enforced`)
- **Lifecycle Rule:**
  - Action: `Delete`
  - Condition: `Age >= 3 days`
  - Action: `AbortIncompleteMultipartUpload`
  - Condition: `Age >= 1 day`
- **Versioning:** Disabled (prevents hidden costs from soft-deleted test objects).

---

## 4. Test Media Specifications & Validation

Synthetic test media must be generated locally prior to testing without real copyrighted media:
1. **Standard Test MP4:** 10 MB, vertical 1080x1920, H.264 / AAC.
2. **Boundary Test MP4:** Exact `2,147,483,648` bytes (`2 GiB`).
3. **Over-Limit Test File:** `2,147,483,649` bytes (must fast-fail on client).
4. **Invalid MIME File:** 5 MB `.webm` (must reject at client and server route guard).

---

## 5. Resumable Upload Admission Verification Procedure

1. Client calls `POST /api/media/admit` (`action: "initiate"`). Server returns `jobId`, `mediaId`, and `uploadUrl`.
2. Client streams binary chunks to `uploadUrl` via HTTP `PUT`.
3. Client calls `POST /api/media/admit` (`action: "finalize"`).
4. Server queries GCS object metadata directly:
   - Validates `metadata.size == custom.nexcutExpectedSize`.
   - Validates `metadata.contentType == "video/mp4"`.
   - Validates `custom.nexcutOwnerUid == ownerUid`.
5. Server writes row to `workflow.jobs` and `workflow.media` in atomic transaction.
6. Verify failure compensation: on simulated database failure, verify server immediately dispatches compensatory GCS delete.
