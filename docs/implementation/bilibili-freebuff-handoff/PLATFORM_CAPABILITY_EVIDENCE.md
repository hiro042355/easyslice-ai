# Bilibili Platform Capability Evidence & Verification Matrix

This document provides a factual assessment of Bilibili API capabilities, categorizing official Open Platform methods versus unofficial community scripts.

---

## 1. Platform Capability Verification Matrix

| Capability / API Feature | Target Official Endpoint / Mechanism | Status Classification | Authoritative Evidence & Source |
| :--- | :--- | :--- | :--- |
| **OAuth2 Authorization Code Flow** | `POST https://api.bilibili.com/x/account-oauth2/v1/token` | `VERIFIED_OFFICIAL_DOCUMENTATION` | Official Bilibili Open Platform Developer Documentation (`https://open.bilibili.com/doc`). Grants creator user authorization with `archive` scope. |
| **OAuth2 Token Refresh Flow** | `POST https://api.bilibili.com/x/account-oauth2/v1/token` (`grant_type=refresh_token`) | `VERIFIED_OFFICIAL_DOCUMENTATION` | Official Bilibili Open Platform Token Maintenance guide. Refreshes 30-day token window. |
| **OAuth2 Client Credentials Flow** | `POST /x/account-oauth2/v1/token` (`grant_type=client_credentials`) | `UNSUPPORTED` | Confirmed unsupported for creator video publishing; video submission strictly mandates end-user creator delegation. |
| **Video Upload Initialization** | `POST https://member.bilibili.com/arcopen/fn/archive/video/init` | `VERIFIED_OFFICIAL_SAMPLE` | Bilibili Open Platform Official Demo Repository (`https://github.com/bilibili-openplatform/demo`). Returns `upload_token` and chunk upload host. |
| **Chunked Byte Streaming** | `PUT/POST https://openupos.bilivideo.com/video/v2/part/upload` | `VERIFIED_WITH_LIMITATIONS` | Open Platform UPOS video upload specification. Chunks must be fixed size (5MB-20MB) and byte-aligned. |
| **Upload Complete Commit** | `POST https://member.bilibili.com/arcopen/fn/archive/video/complete` | `VERIFIED_OFFICIAL_SAMPLE` | Pipeline completion endpoint; accepts chunk etags and returns video `cid`. |
| **Cover Image Upload** | `POST https://member.bilibili.com/arcopen/fn/archive/cover/upload` | `VERIFIED_OFFICIAL_SAMPLE` | Multipart upload for video thumbnail. Requires JPEG/PNG <= 5MB. Returns image URL. |
| **Archive Metadata Submission** | `POST https://member.bilibili.com/arcopen/fn/archive/add-by-utoken` | `VERIFIED_OFFICIAL_SAMPLE` | Official archive submission by upload token. Returns `bvid` and `aid`. |
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
