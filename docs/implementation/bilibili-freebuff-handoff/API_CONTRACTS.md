# API Contracts: NEXCUT Core Orchestration and Bilibili Open Platform

This document specifies the exact JSON schemas, HTTP status codes, headers, and cryptographic validation requirements across both the internal NEXCUT Core-to-Microservice bus and the external Bilibili Open Platform.

---

## 1. Internal Outbox Dispatch Contract (Core -> Publisher Microservice)

### Endpoint: `POST /api/v1/publish/bilibili/dispatch`

#### Headers
```http
Content-Type: application/json; charset=utf-8
X-Nexcut-Delivery-Id: <uuid>
X-Nexcut-Timestamp: <iso8601-utc>
X-Nexcut-Fencing-Token: <monotonic-integer>
X-Nexcut-Signature: <hmac-sha256-hex-of-canonical-json>
```

#### Request Payload Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": [
    "publicationId",
    "ownerUid",
    "tenantId",
    "fencingToken",
    "mediaSignedUrl",
    "mediaSignedUrlExpiresAt",
    "metadata"
  ],
  "properties": {
    "publicationId": { "type": "string", "format": "uuid" },
    "ownerUid": { "type": "string", "minLength": 1 },
    "tenantId": { "type": "string", "minLength": 1 },
    "fencingToken": { "type": "integer", "minimum": 0 },
    "mediaSignedUrl": { "type": "string", "format": "uri" },
    "mediaSignedUrlExpiresAt": { "type": "string", "format": "date-time" },
    "metadata": {
      "type": "object",
      "required": ["title", "tid", "copyright"],
      "properties": {
        "title": { "type": "string", "minLength": 1, "maxLength": 80 },
        "description": { "type": "string", "maxLength": 2000 },
        "tid": { "type": "integer", "description": "Bilibili Category Partition ID" },
        "tag": { "type": "string", "description": "Comma-separated tags, max 10 tags" },
        "copyright": { "type": "integer", "enum": [1, 2], "description": "1: Original, 2: Reprint" },
        "source": { "type": "string", "description": "Required if copyright == 2" },
        "coverUrl": { "type": "string", "format": "uri" },
        "dynamic": { "type": "string", "maxLength": 233, "description": "Bilibili dynamic feed copy" }
      }
    }
  }
}
```

#### Response Codes
- `200 OK`: Dispatch received and successfully enqueued / processed.
- `400 Bad Request`: Payload validation error or invalid JSON.
- `401 Unauthorized`: Invalid HMAC signature or expired timestamp (>300s clock skew).
- `409 Conflict`: Stale fencing token (lower than highest known token) or conflicting idempotency key.
- `500 Internal Error`: Internal microservice crash; triggers Core outbox exponential backoff.

---

## 2. Internal Webhook Ingress Contract (Publisher Microservice -> Core)

### Endpoint: `POST /api/v1/publish/callback`

#### Headers
```http
Content-Type: application/json; charset=utf-8
X-Nexcut-Delivery-Id: <uuid>
X-Nexcut-Timestamp: <iso8601-utc>
X-Nexcut-Signature: <hmac-sha256-hex>
```

#### Callback Payload Schema
```json
{
  "deliveryId": "c3e8035b-c292-411a-82ee-0eb837941ca7",
  "publicationId": "e5c6a120-2a8d-4f10-9c29-87a419c82c31",
  "platform": "bilibili",
  "eventType": "PUBLISHED",
  "sequenceNumber": 3,
  "timestamp": "2026-11-10T16:30:00Z",
  "externalPublicationId": "BV1xx411c7mD",
  "externalUrl": "https://www.bilibili.com/video/BV1xx411c7mD",
  "error": null
}
```

---

## 3. Official Bilibili Open Platform API Contracts (Creator Authorized)

### 3.1 OAuth2 Authorization Code Exchange & Refresh
- **Token Endpoint**: `https://api.bilibili.com/x/account-oauth2/v1/token`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Authorization Code Exchange Parameters**:
  - `client_id`: string (Partner AppKey)
  - `client_secret`: string (Partner AppSecret)
  - `grant_type`: `"authorization_code"`
  - `code`: string (User authorization code returned via creator redirect)
  - `redirect_uri`: string (Registered redirect URI)
- **Token Refresh Parameters**:
  - `client_id`: string
  - `client_secret`: string
  - `grant_type`: `"refresh_token"`
  - `refresh_token`: string
- **Success Response**:
  ```json
  {
    "code": 0,
    "message": "0",
    "ttl": 1,
    "data": {
      "access_token": "bili_at_...",
      "refresh_token": "bili_rt_...",
      "expires_in": 2592000,
      "mid": 12345678,
      "scope": "archive"
    }
  }
  ```

### 3.2 Video Upload Initialization
- **Endpoint**: `https://member.bilibili.com/arcopen/fn/archive/video/init`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "title": "NEXCUT AI Highlight Video",
    "filename": "clip_export_1080p.mp4",
    "total_bytes": 45281920
  }
  ```
- **Success Response**:
  ```json
  {
    "code": 0,
    "message": "0",
    "data": {
      "upload_token": "up_token_...",
      "upload_endpoint": "https://openupos.bilivideo.com/video/v2/part/upload",
      "chunk_size": 10485760,
      "auth": "..."
    }
  }
  ```

### 3.3 Chunk Upload & Configurable Streaming
- **Endpoint**: `https://openupos.bilivideo.com/video/v2/part/upload`
- **Method**: `PUT` (or `POST` per allocated upload node specification)
- **Chunk Sizing Flexibility**: The uploader must implement configurable chunk sizing (e.g. 5MB to 20MB, default 10MB or sample 8,364,032 bytes) within platform bounds, byte-aligned to the allocated chunk size.
- **Query / Form Parameters**:
  - `upload_token`: string
  - `part_number`: integer (1-indexed chunk number)
  - `chunks`: integer (total chunk count)
  - `size`: integer (byte length of this chunk)
- **Body**: Raw binary chunk stream.
- **Success Response**: HTTP 200 with `{ "code": 0, "message": "OK", "part_number": 1 }`.

### 3.4 Upload Completion
- **Endpoint**: `https://member.bilibili.com/arcopen/fn/archive/video/complete`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "upload_token": "up_token_...",
    "parts": [
      { "part_number": 1, "etag": "hash_1" },
      { "part_number": 2, "etag": "hash_2" }
    ]
  }
  ```
- **Success Response**:
  ```json
  {
    "code": 0,
    "message": "0",
    "data": {
      "filename": "video_server_filename.mp4",
      "cid": 987654321
    }
  }
  ```

### 3.5 Cover Upload
- **Endpoint**: `https://member.bilibili.com/arcopen/fn/archive/cover/upload`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <access_token>
  Content-Type: multipart/form-data
  ```
- **Form Data**: `cover`: binary image (JPEG/PNG <= 5MB)
- **Success Response**:
  ```json
  {
    "code": 0,
    "message": "0",
    "data": {
      "url": "https://archive.biliimg.com/bfs/archive/cover_hash.jpg"
    }
  }
  ```

### 3.6 Archive Metadata Submission
- **Endpoint**: `https://member.bilibili.com/arcopen/fn/archive/add-by-utoken`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "upload_token": "up_token_...",
    "title": "AI Highlight Clip - NEXCUT",
    "tid": 17,
    "tag": "gaming,highlight,nexcut",
    "copyright": 1,
    "desc": "Generated using NEXCUT AI Video Engine",
    "cover": "https://archive.biliimg.com/bfs/archive/cover_hash.jpg",
    "dynamic": "New video posted via NEXCUT AI"
  }
  ```
- **Success Response**:
  ```json
  {
    "code": 0,
    "message": "0",
    "data": {
      "bvid": "BV1xx411c7mD",
      "aid": 12345678
    }
  }
  ```

---

## 4. Publication Lifecycle & Review States

A successful response from `/arcopen/fn/archive/add-by-utoken` indicates **submission acceptance**, not public video publication.
The microservice state machine represents distinct post-submission states:
1. `UPLOAD_COMPLETED`: Video bytes transferred and verified by server `cid`.
2. `SUBMISSION_ACCEPTED`: Archive metadata received; initial `bvid` assigned.
3. `UNDER_REVIEW`: Video undergoing Bilibili content moderation review.
4. `PUBLISHED`: Video publicly visible on Bilibili.
5. `REJECTED`: Content review rejected by moderation.
6. `STATUS_UNKNOWN`: State cannot be confirmed; triggers reconciliation without retrying submission.

*(Note: Live review status polling API requires partner sandbox confirmation; unconfirmed polling endpoints remain classified as NOT_VERIFIED).*
