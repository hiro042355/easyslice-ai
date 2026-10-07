# Isolated migration operator tooling foundation

Status: local contracts and in-memory simulation only. No Production execution capability.

## IMPLEMENTED NOW

- `lib/productionMigrationOperator/contracts.ts`: pure preflight, fixed proposed artifact identities, explicit target/history/privilege/transport contracts, filename/version/hash checks, bounded migration sets and safe failure classifications.
- `authorization.ts`: opaque, immutable, single-use LOCAL_REHEARSAL approval. Issuance is an explicit local test/operator event, separate from preflight and validation. It binds session, source, fixed artifact digests, target/history hashes and exact pending versions, with expiry. There is no Production issuer.
- `session.ts`: executable in-memory session, terminal failure/cancellation/timeout behavior, private state, allowlisted operations, supervised cleanup and allowlisted receipts. Arbitrary adapters and mutable method substitution are rejected.
- `rehearsal.ts`: synthetic fixture input and a controllable fake ledger/transport operation model. Fixture YES/VERIFIED classifications are simulation inputs, never cloud or PostgreSQL evidence. A shared in-memory lease supports competing-runner simulation; it is not proof of real Flyway/PostgreSQL locking.
- `scripts/productionMigrationOperator.mjs`: inert entry point. No arguments produces target NONE and status INERT. Every supplied argument rejects with exit 2. It never discovers files, ADC or environment configuration.
- Focused tests: fail-closed admission, human-stop state, approval bindings/replay/mutation/expiry, error redaction, cleanup races and prohibited operations.

## NOT IMPLEMENTED

No Production authority or credential acquisition; no ADC discovery; no gcloud call or impersonation; no real proxy/transport; no Flyway subprocess; no PostgreSQL connection or query; no Production privilege/history inspection; no real migration. NON_PRODUCTION_CLOUD_SQL also lacks an executable adapter and fails before resource acquisition.

Artifact image strings are validated proposed identities only. Nothing pulls, installs, upgrades or runs either image. Package versions, package scripts, application routes, Terraform and migration SQL are unchanged.

## Admission and source rules

DEFAULT_TARGET is NONE. Only LOCAL_REHEARSAL is executable. PRODUCTION is permanently rejected in this implementation, including when an untyped caller supplies an apparent authority object. A later adapter and Production authorization issuer require separate review and implementation; changing a flag is insufficient.

Inputs must supply exact matching 40-character Git SHAs, a clean worktree and index, the complete approved migration manifest and matching file SHA-256 values. The library validates supplied observations; it does not inspect Git or establish their external authority. Future source/identity adapters must populate them from independently verified evidence.

No untracked migration, unresolved collision, duplicate version, malformed filename, missing/extra file, gap, invalid hash, wrong artifact/platform/digest, unknown history or unknown required privilege is admitted. The supported manifest bound is 64 migrations. Validation reports versions; it does not allocate a next version. The test fixture uses synthetic filenames solely in a separate in-memory domain. No file is created under db/workflow/migrations.

Known repository context: committed V000001–V000008, unrelated untracked V000009–V000025. None of these facts establishes Production's applied head. No V000026 reservation is made.

History requires exactly one verified location and matching target/database binding. No public-schema default, history creation, relocation, baseline or repair is available. Every required privilege classification must be YES, including identity/database/schema, CONNECT/USAGE/CREATE, relevant ownership/ALTER, history readability and authority. These inputs are not queried by this foundation.

## Local-only operation model

Allowed conceptual operations: INFO, VALIDATE, MIGRATE. REPAIR, CLEAN, BASELINE, UNDO and arbitrary commands are unavailable. The only implementation records fake operation counts; MIGRATE does not execute SQL or Flyway.

State sequence:

CREATED -> PREFLIGHT_PASSED -> TRANSPORT_READY -> HISTORY_PRIVILEGE_VERIFIED
-> VALIDATED -> AWAITING_MIGRATE_AUTHORIZATION
-> explicit local authorization event -> MIGRATION_AUTHORIZED
-> MIGRATING -> POST_VALIDATING -> cleanup -> COMPLETED.

FAILED, CANCELLED and TIMED_OUT are terminal. INFO and VALIDATE never issue approval or call MIGRATE. The local approval issuer is clearly named `issueLocalRehearsalAuthorization`; it is not a Production authority. Lookalike objects are rejected through private registry lookup. Approval is consumed before migration, rechecked for expiry at migration, and cannot be replayed. Pending-set substitution fails before migration.

A session permits one operation at a time and a bounded operation count. A monotonic controllable fixture clock tests approval expiry; an actual local timer enforces session timeout. Caller metadata is copied into immutable known-field snapshots. Session internals use ECMAScript private fields; fake methods/prototypes cannot be replaced after construction.

## Cleanup and reporting

Resource ownership is registered before fake startup. Success, startup/operation failure, wrapper exceptions, cancellation and timeout invoke cleanup once for the acquired fake resource. No retry/restart is performed. Fake transactional outcomes are explicitly classified as ROLLED_BACK, COMMIT_UNKNOWN or UNKNOWN on failure; successful conceptual operations are SIMULATED_COMMITTED. Cancellation during a conceptual migration stays UNKNOWN. None is real DB evidence. Cancellation wakes a paused fake operation; late completion cannot overwrite a terminal state. Cleanup failure is reported, never silently accepted or retried. Preflight rejection acquires no resource and reports cleanup NOT_NEEDED.

These guarantees apply to the shipped in-memory resource. A future real adapter must independently prove bounded process termination and watchdog behavior, including OS/crash failure. This foundation does not claim to supervise a real proxy or cryptographically revoke issued tokens.

Receipts include only generated session ID, LOCAL_REHEARSAL/NONE classification, reviewed source SHA, safe states/classifications, bounded versions/counts, cleanup and enumerated failure code. They never spread arbitrary input or output. Error properties are treated as untrusted; unknown/mutated/accessor codes become a safe classification. No raw SQL, stdout/stderr, stack, connection string, credential, ADC, cookie, token or environment dump is retained. With the 64-version bound, tested receipts remain below 4096 bytes.

## Verification without installation

Use existing installed clean baseline tooling; do not install dependencies or copy dirty source. Run from the isolated worktree:

- Node's test runner via the existing `tsx` binary, targeting `tests/productionMigrationOperator/operator.test.ts` only.
- Existing TypeScript compiler with strict/noEmit, the four library files, test file and inert script as explicit roots; existing clean Node type definitions. No incremental output.
- Existing ESLint binary/config with cache disabled, targeting those same executable files.
- `git diff --check`; include newly created files through staged-diff checking after ownership review.

`node scripts/productionMigrationOperator.mjs` is safe and inert. There are intentionally no instructions here to start a Production transport or run a Production migration.

## FUTURE GATES — not authorized here

1. Non-Production Migration Rehearsal: implement/qualify isolated PostgreSQL runtime/migrator roles, real history/checksum/order/locking/transaction behavior and real cleanup. Separately qualify automatic IAM/JDBC/transport against non-Production Cloud SQL; pure fakes cannot prove it.
2. Bounded Production Migrator Privilege / History Verification: only after separately authorized adapters, use bounded read-only inspection. Cloud IAM bindings alone do not prove PostgreSQL DDL privileges.
3. LOGIN-2 Migration Design: reconcile history and version reservations first; do not reuse the CSRF table.
4. LOGIN-2 Implementation: requires a new explicit authorization.

Bootstrap is never the normal migrator or automatic fallback. Runtime identity is rejected as a migration identity. No deployment, push, GCP/IAM/Terraform/Vercel action, TikTok action or LOGIN-2 work is implied by this document.
