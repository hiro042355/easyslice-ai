# Production Test Plan: TikTok URL-to-Clipping Pipeline

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Test Levels & Strategy

The production verification strategy is split into two tiers:
1. **Offline Automated Verification (Continuous Integration):**
   - Unit tests covering URL normalization, SSRF redirect defense, guidance evaluation, and clipping profiles.
   - Client boundary validation for durable media admission.
   - TypeScript compilation and Next.js production build (`next build`).
2. **Staging & Pre-Release Verification (Deployment Verification):**
   - Cloud SQL migration verification.
   - Workload Identity Federation (WIF) credential verification between Vercel and GCP.
   - End-to-end media upload and clipping execution with real Google Cloud Storage and private worker services.

---

## 2. Test Execution Matrix

| Test Suite / Target | Command | Expected Output | Environment |
|---|---|---|---|
| **TikTok URL Parsing & SSRF Defense** | `npx tsx --test tests/urlAcquisition/classifyTikTokUrl.test.ts` | 8/8 tests pass; SSRF redirects blocked. | Local / CI |
| **Pipeline Handoff & Framing** | `npx tsx --test tests/urlAcquisition/tiktokPipelineHandoff.test.ts` | 3/3 tests pass; deterministic SHA-256 fingerprinting. | Local / CI |
| **General URL Classifier** | `npx tsx --test tests/urlAcquisition/classifyUrl.test.ts` | 8/8 tests pass; non-matching hosts rejected. | Local / CI |
| **Client Media Admission Validation** | `npx tsx --test tests/urlAcquisition/durableMediaAdmissionValidation.test.ts` | 7/7 tests pass; 2GB boundary and MIME validation verified. | Local / CI |
| **Client Admission Network Contract** | `npx tsx --test tests/productionIdentity/durableMediaAdmissionClient.test.ts` | 4/4 tests pass; GCS diagnostic sanitization verified. | Local / CI |
| **TikTok Clipping Profile** | `npx tsx --test tests/clipPlatform/platformAwareOptimization.test.ts` | 10/10 tests pass; vertical 9:16 priority verified. | Local / CI |
| **Packaged FFmpeg Materialization** | `npm run prebuild` | FFmpeg 7.0.2 materialized with verified SHA-256. | Local / CI / Vercel Build |
| **Next.js Production Build** | `npm run build` | 58 static/dynamic routes compiled cleanly without errors. | Local / CI / Vercel Build |
| **Flyway Database Migration** | `flyway migrate -url=... -user=...` | Migration `V000009` applied; check constraint updated. | Staging / Production DB |
| **Live Staging User Journey Smoke Test** | Manual / Playwright on Staging | Input TikTok URL -> View Guidance -> Upload 10MB MP4 -> Observe clips generated -> Download ZIP. | Staging Web App |
