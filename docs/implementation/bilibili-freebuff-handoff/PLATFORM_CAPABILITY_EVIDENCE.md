# Bilibili Platform Capability Evidence & Verification Matrix

This document provides a factual assessment of Bilibili API capabilities, categorizing official Open Platform methods versus unofficial community scripts.

---

## 1. Platform Capability Verification Matrix

| Capability / API Feature | Target Official Endpoint / Mechanism | Status Classification | Authoritative Evidence & Source |
| :--- | :--- | :--- | :--- |
| **OAuth2 Authorization Code Flow** | `POST https://api.bilibili.com/x/account-oauth2/v1/token` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official Documentation**: Bilibili Open Platform Developer Documentation (`https://open.bilibili.com/doc`). Grants creator user authorization with `archive` scope.<br>**Live Observation**: 2026-11-10 probe without auth returns HTTP 200 `{"code":-400,"message":"请求错误","ttl":1}`, confirming gateway liveness and parameter parsing.<br>**Limitations**: Unauthenticated probe does NOT prove successful token exchange or scope issuance. |
| **OAuth2 Token Refresh Flow** | `POST https://api.bilibili.com/x/account-oauth2/v1/token` (`grant_type=refresh_token`) | `VERIFIED_OFFICIAL_DOCUMENTATION` | **Official Documentation**: Official Bilibili Open Platform Token Maintenance guide. Refreshes 30-day token window.<br>**Limitations**: Requires valid existing refresh token; live token refresh remains unverified without partner credentials. |
| **OAuth2 Client Credentials Flow** | `POST /x/account-oauth2/v1/token` (`grant_type=client_credentials`) | `UNSUPPORTED` | **Official Documentation**: Confirmed unsupported for creator video publishing; video submission strictly mandates end-user creator delegation. |
| **Video Upload Initialization** | `POST https://member.bilibili.com/arcopen/fn/archive/video/init` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official SDK/Sample**: Bilibili Open Platform Official Demo Repository (`https://github.com/bilibili-openplatform/demo`). Returns `upload_token` and chunk upload host.<br>**Live Observation**: 2026-11-10 probe responds with HTTP 200 `{"code":127308,"message":"签名版本过老，请使用新版本签名"}`, confirming endpoint existence and active partner signature enforcement.<br>**Limitations**: Does NOT prove upload token issuance or quota availability without valid partner credentials. |
| **Chunked Byte Streaming** | `PUT/POST https://openupos.bilivideo.com/video/v2/part/upload` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official Specification**: Open Platform UPOS video upload specification. Chunks must be fixed size (5MB-20MB) and byte-aligned.<br>**Live Observation**: 2026-11-10 probe confirms host accessibility, returning HTTP 400 Bad Request on empty parameter set.<br>**Limitations**: Does NOT prove chunk persistence or etag calculation without an active upload session. |
| **Upload Complete Commit** | `POST https://member.bilibili.com/arcopen/fn/archive/video/complete` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official SDK/Sample**: Pipeline completion endpoint; accepts chunk etags and returns video `cid`.<br>**Live Observation**: 2026-11-10 probe responds with HTTP 200 `{"code":127000,"message":"缺少鉴权参数"}`, confirming endpoint availability and auth parameter enforcement.<br>**Limitations**: Does NOT prove CID generation or multi-part assembly without verified uploaded chunks. |
| **Cover Image Upload** | `POST https://member.bilibili.com/arcopen/fn/archive/cover/upload` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official SDK/Sample**: Multipart upload for video thumbnail. Requires JPEG/PNG <= 5MB. Returns image URL.<br>**Live Observation**: 2026-11-10 probe responds with HTTP 200 `{"code":127308,"message":"签名版本过老，请使用新版本签名"}`, confirming endpoint existence.<br>**Limitations**: Does NOT prove image transcoding or CDN URL generation without partner authorization. |
| **Archive Metadata Submission** | `POST https://member.bilibili.com/arcopen/fn/archive/add-by-utoken` | `API_ENDPOINT_OBSERVATION_VERIFIED` | **Official SDK/Sample**: Official archive submission by upload token. Returns `bvid` and `aid`.<br>**Live Observation**: 2026-11-10 probe responds with HTTP 200 `{"code":127308,"message":"签名版本过老，请使用新版本签名"}`, confirming endpoint availability and partner signature verification.<br>**Limitations**: Does NOT prove BVID allocation or review acceptance without end-to-end partner workflow. |
| **Dynamic Feed Text (`dynamic`)** | Field in `add-by-utoken` payload | `VERIFIED_WITH_LIMITATIONS` | String length limited to 233 Chinese characters. |
| **Enterprise Sandbox Account** | Developer Portal Sandbox | `PARTNER_ACCESS_REQUIRED` | Live API access and testing require an approved Bilibili Enterprise Partner AppKey & AppSecret. |
| **Wbi Signatures** | Client-side MD5 Web Mixin Script | `NOT_VERIFIED` | Unofficial Web API artifact used for browser scraping; strictly quarantined from microservice. |
| **SESSDATA Cookies** | Browser Session Cookie Auth | `NOT_VERIFIED` | Fragile browser scraping method violating Terms of Service; strictly prohibited in production. |
| **`openElec` / `noReprint` Flags** | Unofficial Archive Flags | `NOT_VERIFIED` | Undocumented in Open Platform specifications; excluded from production schema. |

---

## 2. Quarantined Community API Artifacts
To maintain high security and avoid platform bans:
1. **Wbi Parameter Signing**: The Wbi algorithm involves calculating rotating MD5 hashes using public web keys (`img_key`, `sub_key`). This is only required for unauthorized browser scraping. The official Open Platform partner API uses standard OAuth2 `Bearer` tokens and HMAC request signing.
2. **SESSDATA Cookie Emulation**: Emulating logged-in browser cookies violates Bilibili's Terms of Service and triggers anti-bot CAPTCHA challenges. All microservice implementations MUST use enterprise partner credentials.
