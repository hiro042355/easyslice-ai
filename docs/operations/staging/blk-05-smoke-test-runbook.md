# BLK-05: staging smoke test

Status: **runner implemented and tested offline; not executed against staging.**
No request has been sent to `https://staging.nexcut.app` from this branch.

## What the smoke test proves

`scripts/staging/verifyTikTokStagingFlow.ts` performs unauthenticated, read-only
requests against the approved staging origin:

| Check | Request | Expected |
| :--- | :--- | :--- |
| `health-live` | `GET /api/health/live` | `200 {"status":"live"}` |
| `health-ready` | `GET /api/health/ready` | `200 {"status":"ready"}`; `503` reports the readiness reason |
| `import-cross-origin-rejected` | `POST /api/v1/assets/import` with `Origin: https://smoke.invalid` | `403 {"error":"forbidden"}` |
| `import-auth-boundary` | `POST /api/v1/assets/import` with the staging origin, no session | `401` |
| `media-admit-auth-boundary` | `POST /api/media/admit` with the staging origin, no session | `401` |
| `no-secret-leakage` | all response bodies | no JWT, bearer token, `access_token`, or signed `uploadUrl` |

`/api/health/ready` exercises the production KMS readiness gate; a `503` is a
real failure with its reason code (`provider-unavailable`, `kms-…`). The import
route checks same-origin before authentication, which is why the cross-origin
probe expects `403` and the same-origin probe expects `401`.

## What it does not prove

- OAuth sign-in, session creation, token exchange, or token refresh.
- Authenticated import, upload admission, TikTok upload, or publication.
- Database writes (no import request is created; the migration is verified by
  the BLK-02 preflight instead).
- WIF credential acquisition (readiness covers KMS initialization, not a real
  upload path).

These require an authenticated staging session and are explicit acceptance items
for the approved staging window.

## Offline execution (no approval needed)

```bash
npx tsx --test --test-concurrency=1 tests/staging/stagingSmoke.test.ts
npx tsx scripts/staging/verifyTikTokStagingFlow.ts
```

The script prints `DRY_RUN: no request was sent …` and exits 0. The 9 offline
tests cover pass/fail transitions, the approval gate, origin pinning, and token
redaction.

## Approved execution (approval required)

Preconditions: BLK-02 migration applied (or V000009 absent makes readiness
irrelevant only if `ready` is still green), BLK-03 bucket and BLK-04 WIF applied,
staging deployment rolled out at `https://staging.nexcut.app`, and PO approval
for PO-05 recorded.

```bash
STAGING_SMOKE_APPROVED=YES \
  npx tsx scripts/staging/verifyTikTokStagingFlow.ts --execute
```

Exit codes: `0` all checks PASS, `1` at least one FAIL, `2` BLOCKED (approval
missing). Origins other than `https://staging.nexcut.app` are rejected unless
`--allow-loopback` is given together with a loopback URL; preview hostnames
(`*.vercel.app`) and the production origin are always rejected.

For CI-style capture:

```bash
STAGING_SMOKE_APPROVED=YES npx tsx scripts/staging/verifyTikTokStagingFlow.ts \
  --execute --json > staging-evidence/smoke-report.json
```

The JSON report contains only status codes, error labels, and redacted details.

## Interpretation

| Result | Meaning | Next step |
| :--- | :--- | :--- |
| `health-live` FAIL | Deployment is not serving | Check Vercel deployment and build logs |
| `health-ready` FAIL `provider-unavailable` | KMS/WIF path not usable from the deployment | Re-check BLK-04 bindings and `GCLOUD_…`/KMS env values; do not weaken readiness |
| cross-origin PASS but auth boundary FAIL | Route accepts unauthenticated writes | Stop; this is a security defect, not a smoke flake |
| 5xx on protected routes | Runtime crash before auth | Inspect staging function logs; no secrets in logs |
| leak check FAIL | Response exposes tokens | Stop; treat as incident and rotate the affected staging credentials |

## Limitations

The staging instance has not been reachable from this development host and no
approved maintenance window exists yet. The runner is therefore **NOT_TESTED
against staging** and must not be reported as a staging verification.
