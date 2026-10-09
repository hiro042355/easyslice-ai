# Product Owner decision package — Mission10

This package requests no action now and grants no execution permission. Local qualification is complete; real prerequisites remain blocked/unknown.

| Decision | Concrete evidence / options | Needed separate authority |
|---|---|---|
| Persistent Sandbox DB | Staging SQL Admin disabled; instance UNKNOWN. Reuse existing nonprod PostgreSQL/managed target if qualified,otherwise paid dedicated stage or staylocal | Existing-target readonly scope; API enablement only if approved; later resource/network/schema/IAM/budget gates separately. |
| Symmetric token key | Inspected asia1 key MAC/HMAC only,not eligible. Alternative nonprod key outside scope UNKNOWN | Identify approved existing symmetric key/readable version; readonly scope first. Creation/rotation/IAM separate,no HMAC fallback. |
| Identity separation |3 enabled stage accounts,MAC roles,empty stage WIF pool; Production-only Firebase trust | Select web/worker/migrator/rotator/deployer/secret duties and exact nonprod trust/least privilege; no one-account admin grant. |
| Host/origin | Canonical URI hardcoded in source/schema; alternate Preview URI cannot be dropped in | Choose canonical controlled Production release (requires explicit Production deployment/shared auth) OR exact isolated staging URI with approved coordinated code/Portal/Firebase/schema changes. No silent switch. |
| Bootstrap | Factories present but default no live provider installed before instrumentation | Approve exact every-instance private SDK/Pool/authority installation and operator ownership; env-only cannot fix. |
| Portal saved evidence | Owner reported save/import,Production Save not independently proved | Masked saved-state checklist,never secrets; current credential binding/test-user evidence and review/audit separation. |
| Migration authority | Fresh V1–V8 committed/V9–V25 untracked; applied history/owner unknown | Approved existing-target history/checksum/DDL identity receipt; no V26 reservation or untracked import. |
| Logging/rollback/retention | Source redaction and disabled defaults verified; hosting/backup/policy unknown | Exact bounded sink/query suppression/kill+rollback owner; approve retention separately. |
| Live OAuth | Local562 baseline and new tests do not establish live capability | Later immutable deployment approval then one OAuth-only browser gate; separate disconnect/revoke; later CREATOR_INFO_ONLY. |

No single combined approval is inferred. Smallest Mission11 recommendation: Owner chooses target/origin and supplies only masked saved metadata,then separately authorizes narrowly scoped existing nonprod resource/identity qualification. If API/key/resource absent, decide explicit infrastructure budget gate; do not provision automatically. No Mission11 executed.
