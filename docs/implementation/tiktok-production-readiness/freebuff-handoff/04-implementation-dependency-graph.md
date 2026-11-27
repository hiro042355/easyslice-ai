# Deliverable 04: Implementation Dependency Graph

## 1. Global Directed Acyclic Graph (DAG)

The execution graph coordinates the work packages and staging gates. Operations are divided into non-blocking parallel tracks and strict sequential checkpoints.

```text
===================================================================================================
TRACK 1: CODE & CI FIXES (Autonomous / Freebuff)
===================================================================================================
[ PO Approval PO-01 ] ──► [ Fix reconciliationMigration.test.ts ] ──► [ CI Workflow Green ]
                                                                             │
                                                                             ▼
                                                                  [ Tag Stable Baseline ]
                                                                             │
=============================================================================│=====================
TRACK 2: STAGING INFRASTRUCTURE (GCP / Staging Ops)                          │
=============================================================================│=====================
[ PO Approval PO-03 ] ──► [ Provision GCS Staging Bucket ] ──────────┐       │
[ PO Approval PO-04 ] ──► [ Configure Staging IAM & WIF ] ───────────┼───────┤
[ PO Approval PO-02 ] ──► [ Apply Migration V000009 on Staging DB ] ─┘       │
                                                                             │
                                                                             ▼
===================================================================================================
TRACK 3: STAGING DEPLOYMENT & SMOKE VERIFICATION (Synchronous Gate)
===================================================================================================
                                                           [ Deploy Vercel Staging Preview ]
                                                                             │
                                                                             ▼
                                                           [ PO Approval PO-05 (Smoke Test Window) ]
                                                                             │
                                                                             ▼
                                                           [ Execute Staging E2E Smoke Test ]
                                                           (10MB MP4 Upload -> Vertical Cut)
                                                                             │
                                                                             ▼
                                                           [ Gatekeeper Audit & Sign-off ]
                                                                             │
===================================================================================================
TRACK 4: PRODUCTION READINESS (FUTURE PHASE - CURRENTLY STRICTLY LOCKED)
===================================================================================================
                                                           [ Production DDL & Rollout Gate ]
```

---

## 2. Work Stream Parallelization Matrix

| Work Stream | Dependencies | Can Run in Parallel With | Blocker For |
| :--- | :--- | :--- | :--- |
| **Stream 1: CI Assertion Fix (PO-01)** | PO-01 Sign-off | Streams 2 & 3 | Remote merge to `main` without CI failure |
| **Stream 2: Staging GCS Provisioning (PO-03)** | PO-03 Sign-off | Streams 1, 3, 4 | Staging E2E Upload Test |
| **Stream 3: Staging IAM / WIF Setup (PO-04)** | PO-04 Sign-off | Streams 1, 2, 4 | Staging Vercel Deployment Auth |
| **Stream 4: Staging DDL V000009 (PO-02)** | PO-02 Sign-off | Streams 1, 2, 3 | Staging Asset Import Mutations |
| **Stream 5: Staging E2E Smoke Test (PO-05)** | Streams 1, 2, 3, 4 | None (Sequential) | Production Readiness Review |

---

## 3. Critical Path Analysis
- **Minimum Path Duration to Staging Verification:**
  1. PO approves PO-01 through PO-05 (Estimated: 1-2 hours review).
  2. Apply PO-01 test assertion update & push to CI (Estimated: 15 minutes).
  3. Run staging DDL & provision bucket/IAM in GCP (Estimated: 30 minutes).
  4. Trigger Vercel staging deployment (Estimated: 10 minutes).
  5. Run staging smoke test script (Estimated: 20 minutes).
  - **Total Estimated Effort to Green Staging Verification:** ~2.5 - 3 hours.
