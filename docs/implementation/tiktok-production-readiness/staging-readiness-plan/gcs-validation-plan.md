# Google Cloud Storage (GCS) Validation Plan

**Purpose:** Specify the exact operational procedure for validating the GCS media admission pipeline on staging without touching production infrastructure or incurring runaway storage costs.

---

## 1. Staging Bucket Configuration Prerequisites

- **Bucket Name:** `easyslice-staging-media-artifacts`
- **Location:** `asia-northeast1`
- **Uniform Bucket-Level Access:** Enabled
- **Lifecycle Rule:**
  - Action: `Delete`
  - Condition: `Age >= 3 days`
  - Action: `AbortIncompleteMultipartUpload`
  - Condition: `Age >= 1 day`

---

## 2. Test Media Requirements

Synthetic test media files must be generated locally prior to testing. Real copyrighted TikTok videos should not be used.

1. **Test Media A (Small Standard MP4):**
   - Size: 10 MB
   - MIME: `video/mp4`
   - Generated via: `ffmpeg -f lavfi -i testsrc=duration=10:size=1080x1920:rate=30 -c:v libx264 -pix_fmt yuv420p test_10mb.mp4`
   - Purpose: Standard happy-path upload and admission.

2. **Test Media B (Exact 2 GiB Boundary MP4):**
   - Size: Exact `2,147,483,648` bytes (`2 * 1024 * 1024 * 1024`)
   - MIME: `video/mp4`
   - Purpose: Verify edge boundary acceptance on both client and GCS metadata check.

3. **Test Media C (Slightly Exceeding Boundary):**
   - Size: `2,147,483,649` bytes (`2 GiB + 1 byte`)
   - MIME: `video/mp4`
   - Purpose: Verify fast-fail rejection on client (`durableMediaAdmission.ts`) without issuing upload session.

4. **Test Media D (Invalid MIME Type):**
   - Size: 5 MB
   - MIME: `video/webm` or `image/jpeg`
   - Purpose: Verify rejection at client validation gate and server route boundary.

---

## 3. Resumable Upload & Admission Verification Procedure

### Step 1: Session Initiation (Server Authoritative)
- Client calls `POST /api/media/admit/session` (or admission endpoint).
- Server generates a signed resumable upload URL for object path:
  `uploads/{ownerUid}/{uploadSessionId}.mp4`
- Server records expected file size and MIME constraints in session state.

### Step 2: Binary Upload to Staging GCS
- Client streams binary chunks to the signed resumable URL via `PUT`.
- Verify upload progress events report accurately in UI.
- Verify upload completes with HTTP 200/201 from GCS.

### Step 3: Server Admission Confirmation
- Client sends admission payload to `POST /api/media/admit`:
  ```json
  {
    "storageKey": "uploads/{ownerUid}/{uploadSessionId}.mp4",
    "declaredSizeBytes": 10485760,
    "declaredMimeType": "video/mp4",
    "platform": "tiktok",
    "canonicalSourceId": "7123456789012345678"
  }
  ```
- Server fetches object metadata directly from GCS staging API:
  - Validates `metadata.size == declaredSizeBytes`.
  - Validates `metadata.size <= 2147483648`.
  - Validates `metadata.contentType == "video/mp4"`.
  - Validates `metadata.name` starts with authorized `uploads/{ownerUid}/`.
- Server records row in `workflow.media` and `workflow.jobs` within PostgreSQL transaction.

---

## 4. Failure Compensation & Orphan Recovery Verification

### Test Case: Transaction Abort Compensation
1. Client completes upload of test file to GCS staging bucket.
2. Trigger an intentional database conflict or simulate server panic during PostgreSQL commit.
3. Observe server compensation handler:
   - Does server immediately call GCS `deleteObject` on the uploaded key?
   - Verify object is removed from `easyslice-staging-media-artifacts`.
   - Verify no orphaned unreferenced bytes linger in storage.

---

## 5. Security & Isolation Checks

- **Access Denial Check:** Attempt to upload to signed URL with manipulated query parameters or expired timestamp. Must return HTTP 403.
- **Cross-User Isolation Check:** Authenticate as User A and attempt to finalize admission of a GCS storage key issued to User B. Must return HTTP 403 Forbidden.
- **Public Access Check:** Confirm direct unauthenticated HTTPS GET on `https://storage.googleapis.com/easyslice-staging-media-artifacts/...` returns HTTP 403 Access Denied.
