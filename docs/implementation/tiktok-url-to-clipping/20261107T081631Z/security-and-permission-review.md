# Security and Permission Review

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. Threat Modeling & Safeguards

### A. Server-Side Request Forgery (SSRF) Prevention
- In `lib/urlAcquisition/tiktokRedirect.ts`:
  - Enforces `ALLOWED_REDIRECT_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"])`.
  - Disallows automatic redirect following (`redirect: "manual"`).
  - Explicitly validates that the `Location` header destination protocol is `https:` and its hostname is strictly within the allowed set.
  - Rejects attempts to redirect to internal loopback, private RFC 1918 subnets, cloud metadata endpoints (`169.254.169.254`), or arbitrary attacker domains.

### B. Input Bounding and ReDoS Prevention
- Enforces 2048-character maximum length on raw input strings prior to URL parsing.
- Uses anchored, non-backtracking regular expressions:
  - Video ID: `/^\d{18,20}$/`
  - Username: `/^@[A-Za-z0-9_.-]+$/`
- Does not execute arbitrary shell commands or untrusted sub-processes.

### C. Authentication and Durable Authorization
- Downstream media admission (`/api/media/admit`) enforces strict authenticated user session (`requireAuthenticatedRequest`).
- Prevents cross-tenant asset pollution by enforcing owner UID matches on PostgreSQL transactions and GCS custom metadata.
