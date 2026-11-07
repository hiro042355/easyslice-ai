# Product Owner Action Checklist

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Product Owner Review & Decisions

- [ ] **Accept Guidance Copy:** Review user guidance copy in `lib/urlAcquisition/tiktokAcquisitionState.ts` to ensure legal and marketing alignment on TikTok ToS compliance messaging.
- [ ] **Confirm File Fallback UI Flow:** Verify that the authorized MP4 file upload workflow on the front-end workspace satisfies end-user experience standards.
- [ ] **Confirm TikTok Clipping Policy:** Review default clipping parameters for TikTok (`durationPolicy`: 15s-55s, `hookStrength`: 0.22) for portfolio alignment.

## 2. Infrastructure & Operations Preparation

- [ ] **Apply Flyway Migration V000009:** Ensure `V000009__expand_asset_import_platform.sql` is applied to production PostgreSQL to update constraint `ck_asset_import_authority`.
- [ ] **Verify Cloud Storage Bucket Quotas:** Confirm GCS bucket quotas accommodate 2GB video uploads per session.
- [ ] **Review Telemetry / Logging:** Ensure client interactions with TikTok URL guidance and MP4 admissions are tracked in PostHog/telemetry without leaking PII.
