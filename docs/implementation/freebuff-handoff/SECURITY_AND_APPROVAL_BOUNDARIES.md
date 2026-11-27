# Security and Approval Boundaries

## 1. Strictly Prohibited Without Explicit Human Approval
- **Production Database Writes & Migrations**: Never execute Flyway migrations against live production Cloud SQL instances without explicit Product Owner sign-off.
- **Real Platform OAuth / Uploads**: Never publish real media or authorize live creator accounts on YouTube, TikTok, or Bilibili. All initial integration must use sandboxed or mocked accounts.
- **Force-Push & Branch Deletion**: Never force-push or delete historical branches (`jules-*`, `codex/*`).
- **Secret & Credential Logging**: Never print HMAC secret keys, OAuth access/refresh tokens, or signed GCS URLs to stdout or application logs.

## 2. Ingress & Reverse Proxy Security Guidelines
- Reverse proxy (e.g. Cloud Armor / NGINX) must strip client-supplied `X-Forwarded-*` identity headers.
- Only trust mTLS client certificate identities verified at the network ingress boundary.
- All request bodies exceeding 65,536 bytes must be rejected with HTTP 400 Bad Request to prevent memory exhaustion attacks.
