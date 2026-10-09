# Three options — 2026-10-09
B RECOMMENDED conditionally, A fallback, C NOT_READY under current registered callback. Separate approval required; REAL_SANDBOX_OAUTH_READY=NO. UNKNOWN is not absence/free capacity.

| Dimension | A staging | B dedicated isolated Sandbox | C local + controlled HTTPS |
|---|---|---|---|
| Initial cost | Setup labor/new approved resources; no spend executed | Reuse eligible accounts first; separate app/DB/key/trust setup | Existing laptop; hostname/security/custody/operator effort |
| Monthly recurring | Hosting/DB/storage/backup/KMS, Tokyo quote unknown | Conditional base subtotal $0.063 or $20.063; incomplete total | Electricity/tunnel/backup/operator costs unknown |
| Hidden cost | Always-on SQL, NAT/connectors/logs/backup | Cross-provider egress, cold start, quotas, seats, retention | Sleep/restarts, hostname churn, incident/recovery time |
| Cloud resources | Hosting/DB/encryption not qualified | Separate deployment/DB/symmetric key; reusable accounts preferred | Controlled tunnel + whole local app; no router ports |
| Credentials | Sandbox secret, DB auth, nonprod runtime | Project-scoped bindings, no Production secrets | Same plus tunnel/local custody; synthetic fixtures insufficient |
| IAM | Key metadata + encrypt/decrypt, DB DML, nonprod Firebase | Exact isolated deployment trust; separate migrator/rotator | Reviewed nonprod credentials/federation; avoid exported cloud keys |
| Database | SQL API disabled, resources UNKNOWN | Persistent TLS PostgreSQL, isolated roles/data | Durable local volume required; tmpfs unsuitable |
| Encryption | HMAC observed, unsuitable | Separate symmetric envelope KMS, availability unverified | Synthetic only proven; real wrapping custody unverified |
| HTTPS | Hosting/domain unverified | Stable separate origin, plan/hostname owner-approved | Static host/TLS; temporary hostname unsuitable |
| Redirect | Canonical-only code requires approved change | Same code/schema/Firebase/Portal release | Canonical cannot silently point to laptop |
| Portal | Saved alternate URI + target evidence needed | Same, NEXCUT AI Review Sandbox | No localhost/unregistered substitution |
| Security | Shared staging identities, least privilege needed | Smaller deployment/data/key scope | Laptop + exposed routes increase attack surface |
| Token custody | Accepted envelope, actual permissions unknown | Server-only encrypted DB/key, no browser tokens | Disk theft/backups/process/restart risks |
| Network exposure | Authenticated/private DB path TBD | TLS DB + strict egress; session/CSRF still required | Loopback upstream, route/method limits, no DB port |
| Operations | More provisioning/native hosting integration | Existing Next model where eligible; provider coordination | Human availability, machine, tunnel, TLS, DB |
| Rollback | Disable flags, revert dedicated deployment, retain keys | Same, never canonical alias changes | Close tunnel first, disable flags, stop/drain processes |
| Cleanup | Scoped resources, token/backup/key retirement approval | Dedicated resources only; shared accounts retained | Scoped secrets/logs/backup and tunnel shutdown |
| Developer Review | Real demo + supplied domain alignment | Stable/reproducible UI, separate domain acceptance unresolved | Intermittent tunnel; mock footage insufficient |
| Scalability | Managed hosting/SQL feasible, expenses rise | Managed scaling; free tier not Production capacity | Weak unattended reliability, later managed move |
| Time to first authorized test | UNKNOWN; relatively more provisioning | UNKNOWN; lowest repeated ops if reuse eligible | UNKNOWN; apparently fast but same origin/trust/custody blockers |

Evidence: current OBSERVED_METADATA.json, inspected source pinning, official matrices/pricing. Ranking/relative effort are engineering inference, not measured completion dates. No environment externally ready.
