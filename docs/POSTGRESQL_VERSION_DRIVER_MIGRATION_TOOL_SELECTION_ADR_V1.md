# PostgreSQL Version / Driver / Migration Tool Selection ADR V1

> Status: Accepted selections / Exact artifact versions pending
> Research date: 2026-07-16
> Scope: design and official-source research only

## Decision Summary

- PostgreSQL V1 major: **18**; local/CI/production use the same major and current approved supported minor.
- Node.js driver: **`pg` / node-postgres**, behind project-owned server-only adapters.
- SQL style: explicit parameterized SQL; no ORM or query builder for Slice A.
- Migration tool: **Flyway Community command-line**, versioned SQL; Atlas is fallback.
- Local/CI: **Testcontainers for Node** with a digest-pinned Docker Official PostgreSQL 18 image.
- Pooling: bounded application Pool; each transaction uses one dedicated checked-out Client.
- Parsing: preserve exactness and Runtime UTC-string contract; never unsafe JS number/Date coercion.
- Next task may install dependencies and create PostgreSQL Test Environment Foundation; production remains blocked.

## 1. Purpose
- This ADR selects the PostgreSQL major, Node.js driver, migration tool, pooling direction, parsing rules, and real-database test direction required before Slice A implementation.
- Research date: **2026-07-16**.
- The outcome authorizes the next dependency-installation and PostgreSQL Test Environment Foundation tasks, not production connection.
- It preserves the dedicated `workflow` schema and the three-row atomic Slice A contract.
- This is research/design only; no package, SQL, migration, Docker, or adapter changes occur.
## 2. Current Foundation
- PostgreSQL is selected; the managed provider remains deferred.
- Schema Foundation selected `workflow.workflow_final_results`, `workflow.workflow_result_references`, and `workflow.workflow_outbox_events`.
- Final Result, protected Result Reference, and Outbox commit in one PostgreSQL transaction.
- The Runtime interface and durable contract suite already define transaction, CAS, claim/fence, commit unknown, and safe failure semantics.
- Concrete adapter, migrations, production connection, and launch have not started.
## 3. Selection Scope
- Select one supported PostgreSQL major, one Node SQL driver, one migration tool, and local/CI database strategy.
- Define pool/dedicated-client, prepared-statement, parameter, type parsing, timeout/cancel, error, and commit-unknown directions.
- Define versioned SQL file, checksum/history/lock, transaction/non-transaction, online-index, drift, and readiness policy.
- Define dependency categories and first implementation sequence.
- Managed provider selection remains outside scope, but production must use the selected major or an approved compatibility exception.
## 4. Non-goals
- Do not add dependencies or update package/lock files.
- Do not create SQL, migrations, schema objects, Docker/Compose files, database connections, credentials, or Store adapters.
- Do not select managed provider, KMS, queue, production proxy, or production pool size.
- Do not introduce ORM or make an ORM model schema truth.
- Do not run build, tests, or npm audit for this Markdown-only task.
## 5. Decision Drivers
- Correct dedicated-connection transactions and observable SQLSTATE classification outrank ergonomic query syntax.
- Support runway, managed availability, official image availability, and ecosystem maturity drive the major choice.
- SQL-first immutable migrations require checksums, history, concurrent-runner locking, and non-transactional online-index handling.
- Real PostgreSQL tests must support multi-connection visibility and failure injection on Windows and generic CI.
- Driver/tool types remain behind server-only adapters and never leak into Runtime interfaces.
## 6. Current Project Environment
- The project is Next.js 16.2.7, React 19.2.4, TypeScript 5.9.3 from the lockfile, and `tsx` 4.23.1.
- Observed runtime is Node.js **v24.16.0**; `package.json` does not currently declare `engines`.
- No PostgreSQL driver, ORM, migration tool, Testcontainers package, or DB SDK is installed.
- Tests use Node's test runner through `tsx --test --test-concurrency=1`.
- The working tree already contains unrelated changes; this ADR changes only its own Markdown file.
## 7. Node.js Version
- Selected runtime line: Node.js 24 LTS for the PostgreSQL foundation.
- Official Node documentation lists v24 Krypton as LTS through April 2028.
- The observed local v24.16.0 is slightly behind the official June 2026 v24.18.0; exact patch alignment is a next-task action.
- Add a project `engines.node`/toolchain policy only in the authorized dependency foundation.
- Driver compatibility must be proven on the pinned Node 24 patch in local and CI.
## 8. TypeScript Configuration
- `strict`, `noEmit`, `isolatedModules`, `esModuleInterop`, `module: esnext`, and `moduleResolution: bundler` are active.
- Database modules must type-check without exposing `pg` types across the server adapter boundary.
- Runtime `bigint` and Buffer/Uint8Array boundaries require explicit types; `skipLibCheck` is not a substitute for adapter tests.
- `@types/node` is currently major 20 while runtime is Node 24; alignment is a dependency-foundation review item.
- No tsconfig change is made here.
## 9. Module System
- Application source uses ESNext/bundler semantics; package type is not declared.
- Selected libraries must work through the project's transpilation/bundling path and Node server runtime.
- `pg` CommonJS heritage is contained behind an import-normalizing server-only module and `esModuleInterop`.
- Migration is an external CLI and does not participate in application module resolution.
- A smoke test must validate the exact import form before adapter implementation.
## 10. Test Runner
- Current runner is Node test via `tsx`, serialized with `--test-concurrency=1`.
- Initial concrete PostgreSQL tests remain serialized to minimize database namespace races and diagnose failures deterministically.
- The durable suite needs multiple DB connections within a test even when test files run serially.
- Later parallelism requires database-per-worker isolation and measured startup capacity.
- No test script is changed in this ADR.
## 11. Build Environment
- Decision: Build Environment follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 12. PostgreSQL Version Policy
- Select one major across local, CI, staging, and production; do not deliberately skew majors.
- Run the newest supported minor patch within that major after release-note review and a green compatibility suite.
- Major upgrades use an explicit upgrade ADR, rehearsed backup/restore or provider upgrade path, and rolling compatibility window.
- Unsupported/EOL majors are prohibited.
- Patch pinning may differ briefly only for a controlled provider lag with documented security review.
## 13. PostgreSQL Supported Versions
- Official policy on 2026-07-16 lists supported majors 14, 15, 16, 17, and 18.
- Current official minors are 14.23, 15.18, 16.14, 17.10, and 18.4.
- PostgreSQL 19 is beta and is excluded from production selection.
- Major 14 reaches final release in November 2026 and is unsuitable.
- All required Slice A semantics exist before 18; support runway and current ecosystem decide among 16–18.

| Major | Current minor on research date | Official final release | V1 assessment |
|---|---:|---|---|
| 14 | 14.23 | 2026-11-12 | Reject: imminent EOL |
| 15 | 15.18 | 2027-11-11 | Reject: short runway |
| 16 | 16.14 | 2028-11-09 | Supported fallback only |
| 17 | 17.10 | 2029-11-08 | Strong alternative |
| 18 | 18.4 | 2030-11-14 | Selected |
| 19 beta | beta | Not GA | Reject |
## 14. PostgreSQL EOL Policy
- PostgreSQL supports a major for five years after initial release and recommends the current minor.
- EOL dates: 15 in November 2027, 16 in November 2028, 17 in November 2029, and 18 in November 2030.
- Minor updates contain fixes/security fixes and normally do not require dump/restore.
- Major updates can require dump/reload, `pg_upgrade`, or logical replication and release-note review.
- Production patch adoption requires staged contract/migration/restore validation, not indefinite pinning.
## 15. PostgreSQL Feature Requirements
- Required: multi-row ACID, Read Committed/Serializable, UNIQUE/FK/CHECK, `ON CONFLICT`, conditional UPDATE, row locks, and `SKIP LOCKED`.
- Required: JSONB, native UUID, `bytea`, `timestamptz`, `CREATE INDEX CONCURRENTLY`, SQLSTATE, and system catalogs for readiness.
- Generated columns are not required for Slice A and cannot justify a major alone.
- Monitoring/backup/provider features remain deployment concerns.
- No PostgreSQL 18-only feature is made a Store Contract dependency without a separate decision.
## 16. Candidate Major Versions
- PostgreSQL 16 offers maturity but loses two years of runway relative to 18.
- PostgreSQL 17 offers substantial runway and broad maturity.
- PostgreSQL 18 has been GA since 2025-09-25, reached 18.4 by 2026-05-14, and is supported through 2030.
- PostgreSQL 19 beta is ineligible.
- Managed provider availability must still be confirmed before production, but it does not block local/test foundation.
## 17. Selected Major Version
- **Selected PostgreSQL V1 major: 18.**
- It has roughly four-plus years of official runway at the research date and multiple post-GA minor releases.
- The official Docker image and selected Flyway documentation support PostgreSQL 18.
- Selection does not depend on new 18-only semantics, preserving provider portability and easier downgrade review if production availability forces reconsideration.
- Production provider inability to supply supported PostgreSQL 18 is a stop/revisit trigger, not silent major skew.
## 18. Development Version Policy
- Local development uses PostgreSQL 18 and the current approved 18.x minor image digest.
- Pin by immutable image digest plus human-readable 18.x tag in foundation metadata.
- Update minor after release-note/security review and green full suite.
- Developers do not use untracked host PostgreSQL as acceptance evidence.
- The image's PostgreSQL 18 `PGDATA` path change must be respected by future test configuration.
## 19. CI Version Policy
- CI uses the exact same PostgreSQL 18 image digest as local foundation.
- A scheduled compatibility lane may test the newest 18.x digest before promotion.
- PostgreSQL 19 beta/current is informational only and cannot gate production.
- Fresh database migration, contract suite, failure tests, and cleanup run on every concrete-store change.
- CI credentials are ephemeral and never production-derived.
## 20. Production Version Policy
- Production targets PostgreSQL 18 current approved minor, subject to managed-provider confirmation.
- Provider patch lag must be documented with security/support impact and a deadline.
- Production cannot use 17 merely because local uses 18 without a compatibility exception and dual-major suite.
- Exact minor, provider, region, proxy, and upgrade mechanism remain production-blocking TBDs.
- No automatic major upgrade is allowed.
## 21. Upgrade Policy
- Decision: Upgrade Policy follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 22. Driver Requirements
- Driver must provide bounded Pool, checked-out dedicated Client, parameterized queries, explicit BEGIN/COMMIT/ROLLBACK, and safe release/discard.
- It must support UUID, `bytea`, `timestamptz`, JSONB, bigint/numeric parsing policy, SQLSTATE/error fields, cancellation/timeouts, and connection events.
- One transaction always remains on one Client; `pool.query` is forbidden inside a transaction.
- It must permit raw SQL without an ORM and work on Node 24 with TypeScript boundary tests.
- Commit acknowledgement loss must remain unknown when phase cannot be proved.
## 23. Driver Candidate Set
- Candidates: `pg`/node-postgres, Postgres.js, `@neondatabase/serverless`, ORM-owned Prisma runtime, and dialect stacks through Kysely/Drizzle.
- Serverless/provider drivers are evaluated as deployment-specific alternatives, not defaults.
- Query builders are not drivers by themselves and carry dialect dependencies.
- Only direct PostgreSQL protocol drivers that meet transaction/failure needs qualify for V1.
- Exact package versions are selected in the dependency-installation task after registry/source verification.
## 24. node-postgres
- node-postgres provides `Pool`, checked-out `Client`, parameterized queries, named prepared statements, configurable type parsing, and PostgreSQL error fields.
- Official docs explicitly require using the same Client for all transaction statements.
- It is thin enough for explicit SQLSTATE/commit phase mapping and has an MIT license.
- Its API is widely compatible with direct managed PostgreSQL endpoints and proxies.
- Cancellation/AbortSignal behavior and exact Node 24 version support require a pinned-version integration test.
## 25. postgres.js
- Postgres.js offers TypeScript, pooling, reserved transaction connections, automatic prepared statements, transforms, and native PostgreSQL-shaped errors.
- Its tagged-template API is ergonomic but more opinionated and automatically prepares static queries unless disabled.
- Prepared behavior under transaction poolers adds policy complexity.
- It is maintained and Unlicense, but changing query API adds no required Slice A capability over `pg`.
- It is the fallback thin driver if `pg` fails Node 24/cancellation requirements.
## 26. Serverless Drivers
- `@neondatabase/serverless` is optimized for Neon/serverless/edge using fetch or WebSockets.
- Official docs state fetch mode does not support interactive sessions; interactive transactions require Pool/Client over WebSockets.
- The managed provider is deferred and workers require stable connections.
- Selecting it now would couple the adapter foundation to a provider/network model.
- It remains deferred for a future Neon deployment adapter, not selected for core V1.
## 27. ORM-owned Drivers
- Prisma, Drizzle, and Kysely ecosystems may bring drivers/dialects but are not needed for Slice A.
- A full ORM can obscure exact constraint, transaction-client, SQLSTATE, and non-transactional migration handling.
- ORM model must never become schema source of truth.
- Query builder adoption is deferred until explicit SQL becomes unmaintainable under measured evidence.
- The selected stack is SQL-first migration plus thin driver plus explicit parameterized SQL.
## 28. Driver Comparison Matrix
- See the Driver Comparison Matrix below.
- The decisive fields are dedicated transaction connection, SQLSTATE visibility, Node 24 proof, parsing control, and provider neutrality.
- Maintenance and license are confirmed from official project sources.
- Streaming is useful later but not a Slice A requirement.
- No candidate package is installed in this ADR.

### Driver Comparison Matrix

| Candidate | API style | Pool | Dedicated transaction connection | TypeScript | ESM / CJS | SQLSTATE | Cancellation | Prepared statements | Streaming | Maintenance | License | Node compatibility | Operational fit | Blocking issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pg` | query text + values | built-in | checked-out Client | declarations via package/types | CJS-compatible import boundary | error `code` | pinned-version proof | optional named | cursor/stream extras | active | MIT | Node 24 test required | Excellent | exact version/cancel proof |
| Postgres.js | tagged template | built-in | reserved `begin` scope | bundled | modern module support | native-shaped errors | proof required | automatic, disable option | supported patterns | active | Unlicense | Node 24 test required | Good | automatic prepare/proxy policy |
| Neon serverless | fetch/WebSocket | Pool/Client mode | only interactive mode | bundled | modern | pg-compatible path | environment-specific | environment-specific | limited by mode | active | verify exact | Node/edge-specific | Conditional | provider coupling |
| Prisma runtime | ORM API | engine-owned | ORM transaction API | bundled | toolchain-owned | abstracted | ORM-owned | engine-owned | ORM-owned | active | Apache-2.0 components | version-specific | Weak for Slice A | SQLSTATE/schema control |
| Kysely/Drizzle stack | builder + dialect | driver-owned | dialect/client-owned | strong | version-specific | driver-dependent | driver-dependent | driver-dependent | driver-dependent | active | package-specific | matrix required | Deferred | extra abstraction/deps |
## 29. Selected Driver
- **Selected Node.js SQL driver: `pg` (node-postgres).**
- Use the pure JavaScript path, not optional `pg-native`, unless a later benchmark/security ADR selects native bindings.
- Select exact current version only after checking its official package engines and running Node 24 import/transaction/cancel tests.
- Add `pg` as a runtime dependency and TypeScript declarations as needed by the pinned release in the next authorized task.
- Postgres.js is fallback; serverless and ORM-owned drivers are rejected/deferred for core V1.
## 30. Driver API Boundary
- Create server-only boundaries: `PostgreSQLConnectionPool`, `PostgreSQLTransactionConnection`, `PostgreSQLQueryExecutor`, and `PostgreSQLDriverErrorMapper`.
- Only narrow project-owned query/result/error types cross those boundaries.
- `Pool`, `PoolClient`, QueryResult, Buffer, and driver errors never appear in Production Runtime interfaces.
- Driver rows are decoded/validated before becoming Store records.
- The boundary owns phase-aware commit classification and connection disposal.
## 31. Connection Pool
- One bounded application Pool per process/consumer class, not one per request or unbounded per module.
- API, worker, scheduler, webhook, and operator pools have separate configuration/credentials where deployed.
- Pool sizing is deferred to provider connection budget and instance-count calculation.
- Pool checkout has a timeout; idle client errors affect health and discard unsafe clients.
- A managed proxy may sit beneath the app pool, but transaction semantics must be conformance-tested.
## 32. Direct Client
- Use direct Client only for migrations, operator tooling, diagnostics, or dedicated transaction checkout.
- Routine single safe reads may use pool convenience queries.
- Direct connections are bounded, authenticated, TLS-configured, and closed deterministically.
- No long-lived provider I/O holds a DB Client.
- Migration uses Flyway/JDBC, separate from `pg` runtime clients.
## 33. Transaction Client
- Checkout one `pg` Client, BEGIN explicitly, run all callback queries on it, then COMMIT or ROLLBACK.
- Never call `pool.query` from inside the transaction callback.
- On callback failure, attempt rollback; on connection failure, discard rather than release as healthy.
- After COMMIT response, result is definitely committed; loss around COMMIT is unknown unless evidence proves otherwise.
- After-commit hooks run outside the transaction and cannot reverse commit.
## 34. Prepared Statements
- V1 defaults to unnamed parameterized queries; named prepared statements are **deferred**, not required.
- This avoids per-connection statement-name/version collisions and transaction-pool proxy incompatibility during foundation.
- Parameterized queries still use PostgreSQL extended protocol safely.
- Named statements may be enabled for measured hot paths after proxy/provider and schema-rollout tests.
- Migration SQL is never executed as runtime prepared statements.
## 35. Parameter Binding
- All data values use positional parameters; no string interpolation.
- Identifiers are from closed static SQL owned by code/migrations, not user input.
- Dynamic lists use bounded, explicitly generated placeholder positions with parameter arrays.
- No generic identifier-format helper is added without maintenance/security review.
- Logs record query operation IDs, not SQL values.

| Input class | Binding policy | Prohibition |
|---|---|---|
| values | positional parameters | interpolation |
| UUID | parameter string after validation | token reuse |
| bytea | binary parameter | hex SQL literal construction |
| JSONB | bounded validated object/string parameter | arbitrary DTO dump |
| timestamptz evidence | validated UTC string parameter | locale Date string |
| identifiers | static allowlisted SQL | user-supplied identifier |
## 36. Result Parsing
- Decode every row through explicit per-query validators; TypeScript generic annotations are not runtime validation.
- Do not rely on driver defaults for bigint, numeric, timestamp, JSON, or binary correctness.
- Unsupported/null/unexpected values map corrupted, never coerce silently.
- Parser policy is adapter-local or query-local to avoid global side effects.
- Results are mutation-isolated before entering Runtime records.

### Result Parsing Matrix

| PostgreSQL type | Driver raw direction | Project representation | Safety rule |
|---|---|---|---|
| `bigint` / `int8` | string | validated safe number for existing revision/attempt; otherwise string/bigint internal | never unsafe number |
| `numeric` | string | exact decimal string | no float coercion |
| `uuid` | string | validated canonical opaque internal ID | never public token |
| `bytea` | Buffer | copied binary digest | never log/implicit text |
| `timestamptz` | textual/cast-preserved | canonical UTC string | no unconditional Date |
| `jsonb` | unknown decoded value | validated frozen DTO projection | generics are not validation |
## 37. Numeric Parsing
- PostgreSQL `int8`/bigint values map to decimal strings or JavaScript `bigint`, never unsafe `number`.
- **Selected Runtime boundary for revision/attempt: validated safe integer number only while schema CHECK caps at `Number.MAX_SAFE_INTEGER`; driver reads int8 as string then validates.**
- Aggregates outside that cap use string/bigint internal types and cannot enter existing Runtime revision type.
- PostgreSQL `numeric` stays string unless a field-specific exact decimal library/policy is selected.
- Overflow is corrupted/operational stop.
## 38. UUID Parsing
- UUID values are decoded as canonical lowercase strings internally, then wrapped in project-owned opaque ID types.
- They are never exposed as public Reference tokens.
- Validate syntax and purpose at row boundary.
- No implicit UUID generation default is assumed; the ID generator remains a separate foundation decision.
- Driver string output is acceptable.
## 39. bytea Parsing
- `bytea` is read as Buffer by `pg`; immediately copy into project-owned `Uint8Array`/Buffer-safe digest representation.
- Constant-time comparison is used where security policy requires it.
- Never encode/decode through locale text or log binary contents.
- Write with parameters, not hex string concatenation.
- Length and algorithm/version are validated against schema contract.
## 40. timestamptz Parsing
- Keep `timestamptz` as canonical UTC string at the project boundary, matching `WorkflowUtcTimestamp`.
- Do not accept unconditional JavaScript Date conversion because it changes representation and can hide precision/timezone issues.
- Configure/query-cast parsing to preserve text, then validate ISO UTC and normalize approved precision.
- Database generates durable commit/lease time; client timestamps are not authoritative.
- Date objects may exist only inside driver implementation if immediately converted with proven precision policy.
## 41. JSONB Parsing
- `jsonb` may arrive decoded by `pg`, but it is still unknown data.
- Validate schema version, exact keys, types, size, and branch before constructing Store records.
- Clone/freeze outputs to preserve mutation isolation.
- Never configure a global parser that treats JSONB as trusted DTO.
- Serialization for writes is canonical and bounded by schema contract.
## 42. Cancellation
- Cancellation is best-effort and not equivalent to rollback or connection safety.
- Use PostgreSQL `statement_timeout`/`lock_timeout` plus driver/application cancellation rather than AbortSignal alone.
- After cancellation inside a transaction, issue rollback on the same Client; discard it if connection state is uncertain.
- Canceling COMMIT does not establish rollback and may create unknown outcome.
- Exact `pg` cancellation API for the pinned version is an acceptance test.
## 43. Timeout
- Separate pool checkout, connect, statement, lock, transaction, idle-in-transaction, and application request timeouts.
- Values remain TBD from workload/SLO and provider constraints.
- Set DB session/local timeouts explicitly per transaction/role where safe.
- Timeout errors are phase-classified; they do not imply retryability.
- Long Provider I/O never occurs inside a DB transaction.

### Timeout Layers

| Layer | Owner | Outcome rule | Exact value |
|---|---|---|---|
| request | API/controller | abort intent; DB phase still reconciled | TBD |
| pool checkout | pool adapter | unavailable before query | TBD |
| connect | driver/TCP/TLS | unavailable | TBD |
| statement | PostgreSQL/session-local | canceled; rollback transaction | TBD |
| lock | PostgreSQL/session-local | safe lock failure/retry policy | TBD |
| transaction | transaction adapter | rollback/unknown by phase | TBD |
| idle in transaction | PostgreSQL | connection/transaction terminated; never reuse blindly | TBD |
## 44. AbortSignal
- AbortSignal propagation is desired at the project adapter boundary but not assumed available until pinned `pg` proof.
- Abort before query prevents dispatch where possible; abort during query triggers safe cancellation/cleanup.
- Abort during COMMIT enters unknown-outcome unless acknowledgement exists.
- The adapter's signal type remains web-standard/project-owned, not driver-specific.
- Unsupported signal handling is a stop condition for HTTP cancellation only if no safe DB timeout fallback is proven.
## 45. Connection Error
- Classify connect, checkout, idle-client, protocol, TLS, socket, server termination, and failover errors.
- Connection class alone cannot decide whether a transaction committed.
- Discard broken/uncertain Client; Pool health and readiness update separately.
- Errors expose safe operation/phase/class only.
- Reconnect is bounded and never replays Provider I/O.
## 46. Commit Unknown
- Before COMMIT send, a proven local failure may be definitely rolled back after successful rollback/connection closure evidence.
- After confirmed COMMIT response, classify definitely committed.
- During COMMIT send or response loss, classify unknown-outcome and resolve by protected result/Reference/Outbox identities.
- Driver exception name/code alone never proves rollback.
- The transaction adapter exposes definitely-rolled-back, definitely-committed, or unknown-outcome internally.

### Commit Certainty Matrix

| Failure point | Minimum classification | Required action |
|---|---|---|
| before BEGIN | definitely-rolled-back / unavailable | no lookup needed |
| after BEGIN, before COMMIT send | rollback if possible; otherwise unavailable/unknown conservatively | discard uncertain client |
| COMMIT send in progress | unknown-outcome | protected Slice A lookup |
| server committed, response lost | unknown-outcome | protected Slice A lookup |
| COMMIT success response received | definitely-committed | after-commit only |
| ROLLBACK success after statement failure | definitely-rolled-back | safe bounded retry if classified |
## 47. SQLSTATE Access
- node-postgres exposes PostgreSQL error fields including `code`; adapter may inspect them internally.
- Map `23505`, `23503`, `23514`, `40001`, `40P01`, class `08`, `57014`, `25006`, `42501`, `42P01`, and `42703` as defined by Schema Foundation.
- Constraint name may select an internal mapping but is never exposed upward.
- Unknown codes map safe internal/unavailable, not guessed domain status.
- Pinned-version tests verify field availability and enumerability/redaction.
## 48. Driver Error Mapping
- A project-owned mapper accepts unknown error plus transaction phase and connection state.
- It returns safe failure class, retry class, readiness impact, discard-client flag, and commit certainty.
- Raw message, SQL, parameters, detail, hint, table, column, constraint values, addresses, and credentials are dropped.
- Only allowlisted SQLSTATE/class and named safe operation identifiers enter diagnostics.
- Mapping tables are exhaustively tested.
## 49. Driver Logging
- Decision: Driver Logging follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 50. Driver Security
- Decision: Driver Security follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 51. Migration Requirements
- Migration must be SQL-first, linear, immutable after apply, checksummed, historically recorded, mutually locked, and CI-validated.
- It must support transactional PostgreSQL DDL and per-script non-transaction execution for `CREATE INDEX CONCURRENTLY`.
- It must handle expand/contract, backfill separation, validation, drift/history mismatch, Windows, generic CI, and production runner provenance.
- Production rollback defaults to forward fix/restore, not trusting Down scripts.
- The tool is deployment infrastructure, not schema source truth; versioned SQL files are truth.
## 52. Migration Candidate Set
- Candidates: node-pg-migrate, dbmate, Flyway, Liquibase, Sqitch, Atlas, ORM migrations, and a custom SQL runner.
- Node-native tools reduce runtime prerequisites but often lack one required checksum/lock/nontransaction feature without customization.
- Standalone tools separate migration privileges from app dependencies.
- Enterprise-only drift features are not assumed available.
- One primary and one fallback are selected.
## 53. node-pg-migrate
- node-pg-migrate integrates with Node/pg and supports JS/TS or SQL-oriented operations.
- Its programmatic model risks making TypeScript builders rather than SQL files schema truth.
- Built-in checksum/drift and non-transaction online-index contract require extra proof/customization.
- It adds runtime/tool dependencies to the Node project.
- Not selected; deferred fallback only if external CLI is operationally unacceptable.
## 54. dbmate
- dbmate is a small cross-platform SQL migration binary with up/down sections and schema migrations table.
- Its simplicity and SQL-first format are attractive.
- Checksum validation and required drift guarantees are not sufficient without an auxiliary owner.
- Down sections encourage reversal assumptions that do not fit production policy.
- Rejected as primary; possible local convenience is not worth dual tool ownership.
## 55. Flyway
- Flyway supports versioned SQL, checksums, schema history, validation, database locking, transactional migrations, and non-transaction execution.
- Official documentation lists PostgreSQL 18 support and Apache-2.0 source licensing.
- The command-line distribution ships the PostgreSQL driver; migration privileges remain outside Node runtime.
- Community foundational commands cover migrate, info, validate, repair, and baseline; advanced drift/undo may require paid editions and are not assumed.
- It is selected because core V1 requirements are available without making ORM/Node code schema truth.
## 56. Liquibase
- Liquibase is mature and supports checksums/locking/formats, but adds a broader changelog abstraction and JVM operational surface.
- XML/YAML/JSON changelogs are rejected; formatted SQL could work.
- It is heavier than required for three-table SQL-first foundation.
- License/edition feature boundaries need ongoing review.
- Rejected for V1 primary; fallback only if organization standardizes on it.
## 57. Sqitch
- Sqitch emphasizes deploy/revert/verify plans and dependency-aware changes.
- It is SQL-centric and database-aware.
- Its plan/revert workflow and Perl/client operational footprint are less aligned with zero-padded linear files and Windows setup.
- Checksum/lock/readiness integration would need more custom policy.
- Rejected for V1.
## 58. Atlas
- Atlas supports versioned SQL, `atlas.sum`, revision history, file transaction modes, and advisory locking.
- Official docs show `--atlas:txmode none` for concurrent indexes.
- Some locking/advanced capabilities are edition-dependent in current docs, and binary licensing/feature boundaries need procurement review.
- It is the **fallback migration tool** if Flyway cannot satisfy online-index or deployment packaging requirements.
- Not installed now.
## 59. ORM Migration Tools
- Prisma/Drizzle/Kysely migrations are rejected as the primary schema owner.
- They couple schema evolution to ORM/query-builder dependencies not selected for Runtime.
- Exact PostgreSQL DDL and SQL-first review are requirements.
- They may consume generated types later without owning migrations.
- No ORM is introduced.
## 60. Custom SQL Runner
- A custom runner could precisely implement checksums, locks, phases, and readiness.
- It would create a security-critical migration product with substantial testing/maintenance burden.
- Custom logic is limited to orchestration around the selected Flyway CLI, not reimplementing history/lock/checksum.
- Rejected unless both primary/fallback tools demonstrably fail mandatory requirements.
- Any future custom runner needs its own contract and threat model.
## 61. Migration Comparison Matrix
- Decision: Migration Comparison Matrix follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.

### Migration Comparison Matrix

| Candidate | SQL-first | Node dependency | Standalone binary | Checksums | Locking | Transactional | Non-transactional | Online index | Rollback | Drift | CI | Cross-platform | Maintenance | License | Operational fit | Blocking issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| node-pg-migrate | partial/possible | yes | no | insufficient proof | proof/custom | yes | configurable proof | custom proof | down-oriented | limited | yes | Node | active | MIT | Medium | checksum/SQL truth |
| dbmate | yes | no | yes | insufficient | tool behavior proof | yes | sections/config proof | possible | down sections | limited | yes | broad | active | MIT | Medium | checksum/drift |
| Flyway Community | yes | no runtime | yes | yes | DB/tool lock | yes | per-script config | yes | forward fix; Undo paid | history validate | yes | Win/Linux/macOS/container | active | Apache-2.0 source | Excellent | exact version/provenance |
| Liquibase | formatted SQL possible | no | yes/JVM | yes | yes | yes | supported/configured | possible | rollback model | validation | yes | broad/JVM | active | Apache-2.0 core | Medium | weight/edition |
| Sqitch | yes | no | CLI/Perl | plan verification | proof required | deploy scripts | explicit scripts | possible | revert scripts | verify scripts | yes | setup-dependent | active | MIT | Medium-low | Windows/linear fit |
| Atlas | yes | no runtime | yes | `atlas.sum` | advisory lock (edition check) | file/all | txmode none | documented | down support | lint/diff tiers | yes | broad/container | active | exact binary terms verify | Strong fallback | lock/license tier |
| ORM migrations | no/ORM-owned | yes | no | tool-specific | tool-specific | tool-specific | weak | awkward | model-driven | tool-specific | yes | Node | active | package-specific | Weak | violates source policy |
| custom runner | yes | yes/custom | no | custom | custom | custom | custom | custom | custom | custom | custom | custom | project-owned | project | Reject | high security burden |
## 62. Selected Migration Tool
- **Selected primary migration tool: Flyway Community command-line.**
- **Fallback: Atlas versioned migrations**, conditional on license/edition and lock confirmation.
- Pin an exact Flyway release and verified binary/container digest in the Migration Runner Foundation.
- Use only Community/core capabilities required by this ADR; do not depend silently on paid drift/undo features.
- The next task may add external tooling configuration, but this ADR adds no dependency.
## 63. SQL-first Policy
- Versioned SQL files in Git are the sole schema source of truth.
- Flyway executes and validates them; it does not generate schema from models.
- Runtime code uses explicit parameterized SQL through `pg`.
- ORM/query builder remains unselected.
- Manual production DDL is prohibited except audited emergency repair followed by reconciliation migration.
## 64. Migration File Format
- Directory: `db/workflow/migrations/` in the future foundation; not created now.
- Files are UTF-8, LF, no BOM, no secrets, and one coherent change per version.
- Use Flyway versioned SQL naming `V000001__create_workflow_schema.sql`, not the earlier bare numeric example.
- No mandatory Down file; production rollback is forward fix/restore.
- Non-transactional scripts carry explicit Flyway script configuration/approved convention verified in the runner foundation.

| Artifact | Contract |
|---|---|
| directory | `db/workflow/migrations/` |
| filename | `V000001__create_workflow_schema.sql` |
| encoding | UTF-8, LF, no BOM |
| ordering | six-digit monotonic Flyway version |
| mutation | immutable after application |
| checksum | Flyway schema-history checksum |
| rollback | no mandatory Down; forward fix/restore |
| secrets | prohibited |
## 65. Migration Naming
- Use `V` plus six-digit zero-padded monotonic sequence, double underscore, and lowercase snake_case description.
- Applied filenames and contents are immutable.
- Reserve repeatable migrations; do not use them for authoritative tables/constraints.
- No timestamps that permit ambiguous merge ordering.
- Sequence allocation conflicts are resolved before merge.
## 66. Migration Ordering
- Flyway version order is linear; out-of-order execution is disabled.
- CI rejects duplicate/out-of-order/missing versions.
- Each environment applies the same ordered directory.
- Backfills use separately named versioned coordination steps or application jobs; they do not reorder history.
- Baseline is prohibited for fresh V1 and separately approved for adoption only.
## 67. Migration Checksum
- Flyway owns migration-content checksum recording and validation in schema history.
- Git review and CI independently verify immutability.
- Checksum mismatch fails migration and readiness; `repair` is break-glass, audited, and never automatic.
- External artifact checksum/signature validates the Flyway binary/container separately.
- Schema metadata projects the approved migration head/checksum for Runtime readiness.
## 68. Migration History
- Flyway schema history is the detailed migration history owner.
- Place it in a controlled history schema/table configuration, separate from application writes and least-privileged from runtime.
- History records version, description, type, script, checksum, installer, installed time, duration, and success per tool behavior.
- Runtime reads only a safe compatibility projection, not unrestricted history.
- History backup/restore is mandatory.
## 69. Migration Lock
- Flyway/database locking is the primary concurrent migration lock owner.
- Only the migration role can run Flyway; external deployment serialization is defense in depth.
- Lock scope is the selected database/schema lifecycle and is tested with two competing runners.
- Migration lock is never reused as business claim/lease.
- Lock timeout/retry values remain operational TBD.
## 70. Transactional Migration
- Default one migration per PostgreSQL transaction where Flyway supports it.
- A failure rolls back the migration and leaves later versions unapplied.
- Do not group all pending migrations into one transaction by default.
- Migration tests prove object/history consistency after failure.
- Explicit non-transactional scripts are isolated.
## 71. Non-transactional Migration
- Only PostgreSQL commands that cannot run in a transaction, primarily concurrent index operations, use non-transactional migration mode.
- One non-transactional concern per file; no mixed business data mutation.
- On failure, inspect catalogs/history, detect invalid remnants, clean through approved migration/repair, then retry.
- Readiness does not require the new object until validation completes.
- Runner configuration must prove per-script transaction disablement on the pinned Flyway version.
## 72. Online Index Creation
- `CREATE INDEX CONCURRENTLY` is isolated in a non-transactional Flyway migration.
- Do not use Flyway `mixed` as a blanket escape hatch.
- Failure can leave invalid indexes; the runbook detects and removes/rebuilds them before validation.
- A later transactional migration can attach/require the index/constraint after validation.
- Production load and lock impact are staged and measured.

| Online-index phase | Transaction mode | Gate |
|---|---|---|
| prepare compatible readers | transactional | application compatible |
| create concurrent index | non-transactional isolated file | index valid |
| validate catalog/query | read-only validation | no invalid remnant |
| require in readiness | metadata/config promotion | all environments ready |
| cleanup failed invalid index | audited nontransaction operation | retry approved |
## 73. Expand / Contract
- Sequence: additive nullable object, compatible readers, compatible writer, bounded backfill, validation, required constraint, retire old reader/writer, destructive cleanup.
- Status/CHECK and JSONB versions expand reader support before emission.
- Index becomes readiness-required only after successful online creation.
- Each phase has its own migration/version and deploy gate.
- No incompatible schema flip in one deploy.
## 74. Backfill
- Decision: Backfill follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 75. Rollback Policy
- No automatic Down migration requirement.
- Rollback choices are application rollback within compatibility window, forward corrective migration, PITR/restore for disaster, or audited manual repair.
- A Down file can exist only when proven data-safe and operationally approved.
- Flyway Undo paid capability is not a V1 dependency.
- Applied versioned files remain immutable even after rollback strategy changes.
## 76. Drift Detection
- Flyway `validate` detects history/file checksum mismatch and missing/changed migrations.
- Community-only physical schema drift detection beyond history is implemented initially by readiness catalog assertions and clean rebuild comparison, not a paid feature.
- CI rebuilds from empty and last supported schema and compares required catalog contract.
- Manual DDL is denied by roles.
- Unexpected drift fails readiness.
## 77. Readiness Integration
- Runtime readiness checks schema version/compatibility projection, expected migration head, required objects/indexes/constraints, role privileges, writer mode, and Outbox writability.
- Flyway validate runs in deployment/CI, not on every application request.
- Mismatch stops new writes and claims.
- Readiness does not disclose history SQL, paths, credentials, or checksums externally.
- Migration completion precedes application-ready promotion.
## 78. Local Test Requirements
- Real PostgreSQL 18, exact image digest, Node 24, pinned `pg`, Flyway-applied migrations, multi-connection visibility, and deterministic cleanup are required.
- Must support connection termination, locks, privilege roles, read-only transaction, and malformed persisted fixture tests.
- Windows developer operation must work through Docker Desktop/compatible Docker API.
- No shared production credential or remote dependency.
- Startup failure is a clear skipped/failed prerequisite, never fallback to memory.
## 79. CI Test Requirements
- CI uses the same PostgreSQL 18 image digest and Flyway version/artifact as local.
- Every run creates fresh isolated database/container, applies migrations, validates history/catalog, runs durable suite/failure tests, and destroys resources.
- CI provider remains generic; Docker-compatible service availability is blocking for implementation.
- Artifacts/logs redact credentials and protected values.
- A provider staging lane later covers failover/proxy commit unknown.
## 80. Docker Compose
- Docker Compose offers simple developer lifecycle and stable service naming.
- A shared fixed port/state complicates parallel tests, per-suite isolation, and cleanup.
- Compose is useful for manual development/staging-like sessions but not selected as the initial automated test owner.
- No Compose file is created now.
- Revisit for multi-service integration beyond PostgreSQL.
## 81. Testcontainers
- Testcontainers for Node provides programmatic container lifecycle, mapped ports, wait strategies, cleanup, and PostgreSQL modules.
- It fits `tsx` tests and can create isolated PostgreSQL 18 containers on Windows and CI with Docker.
- It adds dev dependencies and requires a Docker-compatible runtime.
- Pin exact Testcontainers packages and image digest; do not enable global reusable containers initially.
- Selected for local and generic CI automated PostgreSQL tests.
## 82. Direct Docker CLI
- Direct Docker CLI has no Node package dependency and supports health checks and ephemeral ports.
- It requires custom process, port, readiness, cleanup, Windows quoting, and concurrency code.
- It is the fallback if Testcontainers Node 24 compatibility fails.
- Do not build an ad-hoc container orchestrator unless fallback is activated.
- Manual diagnostic use is allowed outside acceptance automation.
## 83. Remote Test Database
- Remote test DB reduces local Docker needs but introduces network variability, shared state, credentials, cost, and cleanup risk.
- It cannot reliably inject local connection/process failures.
- Rejected as the primary local/CI acceptance environment.
- May be a separate managed-provider conformance lane.
- Never use production or shared staging data.
## 84. Managed Branch Database
- Managed branch databases can test provider proxy/serverless semantics and isolated previews.
- They do not replace upstream PostgreSQL 18 container parity or offline deterministic failure injection.
- Provider is deferred.
- Use later for provider conformance and commit-unknown network tests.
- Deferred.
## 85. Test Environment Comparison
- See Test Environment Comparison below.
- Selection prioritizes isolation, automation, Windows/CI parity, failure control, and exact major pinning.
- Startup cost is accepted initially because correctness dominates throughput.
- Serial test-file execution reduces collision complexity.
- No environment configuration is added here.

### Test Environment Comparison

| Candidate | Windows | CI automation | Isolation | Failure injection | Parallelism | Package impact | Operational fit | Decision |
|---|---|---|---|---|---|---|---|---|
| Docker Compose | good with Desktop | good | shared by default | moderate | port/state conflicts | config only | manual dev good | Deferred |
| Testcontainers Node | Docker required | strong with daemon | dynamic/programmable | strong | database/container scoped | dev dependencies | Excellent | Selected |
| direct Docker CLI | Docker required | strong | custom | strong | custom ports/names | no npm dep | fallback | Fallback |
| remote PostgreSQL | network/credential | provider-dependent | shared risk | weak | quota-dependent | none | poor primary | Rejected primary |
| managed branch DB | network/provider | provider-dependent | strong branches | provider-limited | cost/quota | client only | conformance lane | Deferred |
## 86. Selected Local Strategy
- **Selected local strategy: Testcontainers for Node with the Docker Official `postgres:18.x` image pinned by digest.**
- One container per concrete DB suite initially, one database with deterministic schema/database isolation.
- Flyway applies migrations before tests.
- Docker Compose remains optional/manual future; direct Docker CLI is fallback.
- Developers without Docker cannot claim concrete adapter acceptance.
## 87. Selected CI Strategy
- **Selected CI strategy: the same Testcontainers code, image digest, Node 24 patch, `pg` version, and Flyway version.**
- CI must expose a supported Docker-compatible daemon and permit container cleanup.
- Run serialized initially using existing concurrency=1.
- Add a scheduled newest-minor image lane before approved digest promotion.
- Remote/provider lanes supplement but never replace it.
## 88. PostgreSQL Startup
- Test harness starts container, waits for PostgreSQL readiness using module/health strategy, then performs an actual authenticated query.
- Startup timeout is bounded/configurable; port is dynamically mapped.
- Record server version and image digest as safe diagnostics.
- Do not initialize schema via image entrypoint scripts; Flyway owns migrations.
- Failure to reach selected major is a hard failure.
## 89. Database Initialization
- Create ephemeral admin/migration/runtime/read-only/outbox roles in controlled test setup as future migration/test foundation defines.
- Run Flyway from empty, validate, then seed only safe fixtures through adapters.
- No production data dump.
- Database timezone/session settings are explicit and tested.
- Initialization is idempotent at suite lifecycle, not hidden per query.
## 90. Test Isolation
- Initial isolation: one container/database per suite plus reset/recreate dedicated test schema or database between test groups.
- Do not wrap every test in an outer transaction because multi-connection commit visibility and unknown outcomes must be observable.
- Prefer database recreation for migration tests; bounded truncate/reset only for adapter test speed after correctness proof.
- All identities are unique per test.
- Cleanup failure is reported.
## 91. Schema Isolation
- Decision: Schema Isolation follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 92. Database Isolation
- Decision: Database Isolation follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 93. Parallel Test Policy
- Keep concrete DB test files serial (`--test-concurrency=1`) in the first foundation.
- Tests may use multiple concurrent connections internally for races.
- Parallelize later only with database-per-worker isolation, bounded container capacity, and no shared Flyway history.
- Serial execution improves failure reproducibility on Windows/CI.
- Performance/load suites are separate.
## 94. Cleanup
- Decision: Cleanup follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 95. Failure Injection
- Real PostgreSQL covers unique/FK/CHECK, deadlock, serialization, lock/statement timeout, read-only transaction, privilege, migration mismatch, malformed JSONB, and claim races.
- Testcontainers/container controls support backend termination and restart classes.
- Driver-level controlled fault models pre/post COMMIT ambiguity deterministically.
- Provider staging network faults cover real proxy/failover behavior.
- No production schema scenario column or privileged test switch.

### Failure Injection Matrix

| Failure | Local mechanism | Expected proof | Supplemental environment |
|---|---|---|---|
| unique/FK/CHECK | conflicting/invalid writes | SQLSTATE safe mapping | none |
| deadlock | two Clients lock inverse order | bounded whole-tx retry | none |
| serialization | concurrent Serializable anomaly | `40001` mapping | none |
| connection terminate | backend/container control | discard/phase classification | staging proxy |
| commit unknown | driver fault around COMMIT | protected lookup | network/failover staging |
| read-only | transaction/session/provider state | readiness false/no write | failover staging |
| privilege | restricted role | `42501`, no leakage | none |
| migration mismatch | changed/missing history/catalog | validate/readiness false | none |
| malformed JSONB | privileged fixture insertion | corrupted fail-closed | none |
| Outbox race | concurrent checked-out Clients | one fence/winner | none |
## 96. Connection Termination
- Decision: Connection Termination follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 97. Deadlock
- Decision: Deadlock follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 98. Serialization Conflict
- Decision: Serialization Conflict follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 99. Commit Unknown
- Commit unknown uses two layers: deterministic driver-adapter controlled fault around COMMIT and staging network/process termination.
- Local DB cannot prove every network timing, so tests assert conservative classification rather than exact packet behavior.
- Lookup verifies all/none/partial Slice A records.
- No blind transaction or Provider retry.
- The same protected identities are reused for reconciliation.
## 100. Read-only Mode
- Decision: Read-only Mode follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 101. Migration Mismatch
- Decision: Migration Mismatch follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 102. Privilege Failure
- Decision: Privilege Failure follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 103. Production Dependency Boundary
- Runtime production dependency is only pinned `pg` plus project-owned server adapter code.
- Flyway is deployment tooling, not imported by Runtime.
- Testcontainers packages are dev-only.
- PostgreSQL Docker image is test infrastructure only.
- Managed provider SDK is not required for SQL connectivity.
## 104. Server-only Boundary
- All driver imports live under `lib/server/...` with `server-only` enforcement consistent with production runtime modules.
- No browser bundle, React component, DTO, or public API imports `pg`.
- Connection configuration and credentials resolve server-side.
- Static tests scan for forbidden client imports/leakage.
- Migration CLI runs outside application composition.
## 105. Package Impact
- Next authorized dependency task adds `pg` runtime dependency.
- Add `@types/pg` only if the selected `pg` release does not bundle sufficient declarations; verify rather than assume.
- Add `testcontainers` and `@testcontainers/postgresql` as dev dependencies for tests.
- Flyway uses a pinned external CLI archive or official container distribution selected in the runner foundation, not an npm runtime package.
- No package change occurs now.
## 106. Lockfile Impact
- The next dependency installation legitimately updates `package.json` and `package-lock.json` together under explicit scope.
- Lockfile must record exact resolved packages/integrity and receive diff/security review.
- Do not hand-edit lockfile.
- External Flyway and Docker image digests live in approved tool/config artifacts, not npm lockfile.
- This ADR's lockfile remains unchanged.
## 107. Security
- TLS verification, parameter binding, least privilege, timeout limits, redacted errors, and server-only isolation are mandatory.
- Connection strings/credentials never enter logs, fixtures, migrations, or client bundles.
- Migration role is separate and unavailable to Runtime.
- Container credentials are ephemeral test-only.
- Dependency and binary provenance is verified before install/use.
## 108. Supply Chain
- Pin npm dependencies through lockfile integrity; review transitive dependency count and lifecycle scripts.
- Verify GitHub/npm publisher/repository alignment and security reporting for `pg` and Testcontainers.
- Pin Flyway version and checksum/signature or immutable container digest from official distribution.
- Pin Docker Official PostgreSQL image by digest and record source architecture.
- Automated update proposals run full DB suite before promotion.
## 109. License
- node-postgres is MIT licensed per official repository.
- Postgres.js is Unlicense; not selected.
- Flyway source repository license is Apache-2.0; commercial features/terms are excluded unless separately procured.
- Testcontainers libraries use their official repository license, to be verified at exact-version selection; Docker/PostgreSQL image components retain their licenses.
- License approval for exact artifacts is an acceptance gate before installation.
## 110. Maintenance
- Decision: Maintenance follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 111. Operational Complexity
- Decision: Operational Complexity follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 112. Risks
- Decision: Risks follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 113. Selected Stack
- PostgreSQL major: 18; minor: latest approved supported 18.x, exact patch/digest pinned.
- Driver: `pg`; SQL style: explicit parameterized SQL; ORM/query builder: none.
- Pooling: bounded `pg.Pool`; transactions: dedicated checked-out Client.
- Prepared statements: unnamed parameterized default; named deferred.
- Parsing: bigint/numeric strings then validation, UUID string, bytea copied binary, timestamptz UTC string, JSONB unknown+validator.
- Migration: Flyway Community CLI, versioned SQL, Flyway checksum/history/database lock; Atlas fallback.
- Tests: Testcontainers Node + pinned Docker Official PostgreSQL 18 image locally and CI, serialized initially.

### Selected Stack Snapshot

| Layer | Selection | Exact-version status |
|---|---|---|
| Node | 24 LTS | patch alignment pending |
| PostgreSQL | major 18 | current approved 18.x/digest pending |
| SQL driver | `pg` | package version pending |
| SQL style | explicit parameterized SQL | fixed |
| ORM/query builder | none | fixed for Slice A |
| Pool | bounded `pg.Pool` | size/timeouts pending |
| Transaction | dedicated checked-out Client | fixed |
| Prepared statements | unnamed parameterized default | named deferred |
| Migration | Flyway Community CLI | exact version/artifact pending |
| Migration format | versioned SQL | fixed |
| Checksum/history/lock | Flyway-owned | config proof pending |
| Local/CI DB | Testcontainers + Docker Official Postgres 18 | package/image digest pending |
| Timestamp | canonical UTC string | parser proof pending |
| Revision | int8 string → validated safe number | limit/check pending |
## 114. Rejected Candidates
- PostgreSQL 14/15 rejected for insufficient runway; 16/17 rejected for V1 default because 18 is mature/supported and tooling supports it; 19 beta rejected.
- Postgres.js rejected as primary due to opinionated automatic prepare/query API without a required advantage.
- Serverless and ORM-owned drivers rejected for provider coupling/abstraction leakage.
- dbmate, node-pg-migrate, Liquibase, Sqitch, ORM migrations, and custom runner rejected as primary for missing fit or added ownership.
- Docker Compose, remote DB, and managed branches rejected as primary automated acceptance.
## 115. Deferred Candidates
- Postgres.js remains driver fallback.
- Atlas remains migration fallback after license/lock verification.
- Named prepared statements, query builder, managed proxy, RLS, parallel DB tests, Compose manual environment, and provider branch lane are deferred.
- Exact package/tool versions and image digest are deferred to the immediately next foundation, but selection criteria are fixed.
- Managed provider, exact production minor, timeouts, pool sizes, routing, KMS, RPO/RTO, and operational ownership remain production TBDs.
## 116. Implementation Consequences
- Decision: Implementation Consequences follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 117. Test Consequences
- Decision: Test Consequences follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 118. Migration Consequences
- Decision: Migration Consequences follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 119. Adapter Consequences
- Decision: Adapter Consequences follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.
## 120. Dependency Installation Plan
- Authorized next task installs pinned `pg` as runtime dependency.
- It installs pinned Testcontainers core/PostgreSQL modules as dev dependencies and only needed `pg` types.
- It records Node 24 engine/toolchain alignment and updates package-lock atomically.
- Flyway and PostgreSQL image are external pinned artifacts, not application runtime dependencies.
- Before changes: verify exact Node engines, licenses, release provenance, vulnerabilities, import compatibility, and package lifecycle scripts.
## 121. Test Environment Foundation Plan
- Create PostgreSQL Test Environment Foundation after dependency approval.
- Define Docker availability preflight, official image digest, startup/wait, ephemeral credentials/ports, Flyway runner, database reset, role setup, safe diagnostics, and teardown.
- Add a serialized concrete test script without changing existing in-memory contract semantics.
- Prove Node 24 import, pool/client transaction, parsing, SQLSTATE, cancellation, and connection termination.
- Do not create production schema until migration foundation approval.
## 122. Slice A Implementation Plan
- 1. PostgreSQL Test Environment Foundation.
- 2. Driver Adapter Foundation and parsing/error contract.
- 3. Flyway Migration Runner Foundation.
- 4. Slice A versioned SQL migration files.
- 5. PostgreSQL Transaction/Clock Adapter.
- 6. Final Result/Reference/Outbox adapter and atomic composer.
- 7. Durable contract suite, failure injection, and readiness/schema validation.
## 123. Acceptance Gates
- Passed: PostgreSQL major, driver, explicit SQL/no ORM, pool/dedicated transaction, parsing, prepared policy, migration tool/format/checksum/history/lock, and local/CI strategy selected.
- Passed: timeout/cancel direction, SQLSTATE access, commit-unknown model, dependency plan, failure layers, and sequence selected.
- Before dependency install: pin exact `pg`, Testcontainers, Flyway, Node patch, image tag/digest and verify licenses/engines/provenance.
- Before migration: prove Flyway per-script non-transaction and concurrent runner lock on PostgreSQL 18.
- Before adapter: all driver import/parsing/cancel/SQLSTATE/commit certainty tests pass.
## 124. Stop Conditions
- Stop if PostgreSQL 18 is unavailable in the target provider without an approved major exception.
- Stop if pinned `pg` lacks Node 24/module compatibility, dedicated Client transactions, SQLSTATE access, safe bytea/timestamp parsing, or conservative commit uncertainty.
- Stop if Flyway version/license/provenance, checksum/history/lock, or per-file online-index mode cannot be proven.
- Stop if Docker/Testcontainers cannot provide real PostgreSQL 18 locally and in CI.
- Stop if installation omits lockfile update, ORM alters schema truth, memory-only tests substitute for DB tests, or provider driver leaks into Runtime.
## 125. Open Questions
- **Immediate blocking before dependency task:** exact `pg`, Testcontainers, Flyway and Node 24 patch versions; official PostgreSQL 18 image digest; exact licenses/provenance; Docker availability confirmation.
- **Blocking before migration/adapter:** Flyway nontransaction script convention, history schema, lock concurrency proof, PK generator, digest algorithm, JSONB bounds, timeout defaults, and parsing implementation proof.
- **Production blocking:** managed provider, exact minor/provider cadence, pool/proxy sizes, credentials/TLS, KMS, RPO/RTO, home-region routing, runner deployment, CI provider, operations owner.
- **Deferred:** query builder, named statements, parallelism, managed branch lane, paid drift tooling, covering indexes.
- Dependency update policy and security response owner remain to be assigned.
## 126. Final Decision Matrix
- Decision: Final Decision Matrix follows the selected PostgreSQL 18 + `pg` + Flyway + Testcontainers stack.
- Boundary: project-owned server adapters and versioned SQL remain authoritative; tool types do not escape.
- Verification: pin exact versions and prove behavior in real PostgreSQL before Slice A acceptance.
- Failure: unsupported, ambiguous, unsafe, or unverified behavior fails closed and blocks readiness.

### Final Decision Matrix

| Decision | Selected | Official evidence | Rejected | Reason | Implementation consequence | Blocking TBD | Revisit trigger |
|---|---|---|---|---|---|---|---|
| PostgreSQL major | 18 | PG versioning/release docs | 14–17 default, 19 beta | longest mature runway | pin 18.x image/provider | exact minor/digest | provider unavailable |
| local minor policy | newest approved 18.x | PG recommends current minor | stale fixed minor | fixes/security | promotion lane | cadence owner | regression |
| production policy | same major/current approved minor | PG policy | silent skew | parity | provider validation | provider patch | managed constraint |
| SQL driver | `pg` | official Pool/query/transaction docs | Postgres.js/serverless/ORM | thin, explicit control | runtime dependency + adapter | exact version | failed Node/cancel proof |
| SQL style | parameterized SQL | node-postgres docs | interpolation/builder default | security/control | query catalog | query organization | complexity evidence |
| ORM | none Slice A | schema contracts | Prisma/Drizzle model truth | unnecessary | explicit decoders | none | measured maintenance cost |
| pooling | bounded app Pool | `pg` pooling docs | pool/request | connection control | per-consumer config | sizes/proxy | topology change |
| transaction | one checked-out Client | `pg` transaction docs | pool.query sequence | same connection required | adapter callback | cleanup proof | driver change |
| prepared | unnamed default | `pg` query docs | named mandatory | proxy/schema safety | optional later | benchmark/proxy | hot path |
| timestamptz | UTC string | Runtime contract/PG types | unconditional Date | precision/shape | custom parser/cast | exact precision | contract change |
| bigint | string then safe validation | JS precision reality | unconditional number | correctness | decoder/CHECK | ceiling | larger domain |
| bytea | Buffer copied binary | `pg` type behavior | text encoding | digest integrity | binary decoder | length/algorithm | security ADR |
| cancellation | DB timeouts + driver best effort | PG/driver docs | AbortSignal-only | transaction safety | rollback/discard | exact API/values | driver enhancement |
| SQLSTATE | error `code` internal | node-postgres/PG error docs | message parsing | stable mapping | failure mapper | pinned proof | driver change |
| migration | Flyway Community CLI | official history/support/config docs | Node/ORM/custom primary | checksum/lock/SQL | external pinned runner | exact release | feature/license change |
| format | `V000001__slug.sql` | Flyway convention | JS/TS/Down mandatory | SQL truth | immutable files | final convention test | tool change |
| checksum | Flyway | schema history docs | custom only | built-in validation | validate gate | config | tool loss |
| lock | Flyway/database | official FAQ/config | business claim | concurrent-runner safety | migration-only role | race proof | provider limitation |
| online index | isolated nontransaction migration | PG + Flyway execute config | blanket mixed | invalid-index handling | separate file/runbook | exact config proof | tool limitation |
| local test | Testcontainers Node | official wait/lifecycle docs | Compose/remote primary | isolation/automation | dev dependencies | versions/Docker | Node incompatibility |
| CI test | same Testcontainers/image | parity principle | remote-only | reproducibility | Docker daemon needed | CI provider | daemon unavailable |
| failure injection | DB + driver fault + staging | contract needs | schema scenario field | layered realism | harness/runbooks | fault API | provider capability |
| first step | Test Environment Foundation | dependency order | Store adapter first | proves base | install/config next | exact artifacts | gate failure |
## 127. Readiness
- The ADR is ready when its structural and diff checks pass.
- **PostgreSQL Test Environment Foundation may start**, including the separately authorized dependency additions.
- Concrete Slice A Store Adapter still may not start until test environment, driver boundary, Flyway runner, and first migrations exist and pass gates.
- Production connection and launch remain prohibited.
- Next implementation artifact: PostgreSQL Test Environment Foundation.

## Official Source Register

- PostgreSQL: [Versioning Policy](https://www.postgresql.org/support/versioning/), [PostgreSQL 18 release notes](https://www.postgresql.org/docs/18/release-18.html), [18.4 release notes](https://www.postgresql.org/docs/release/18.4/), [Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html), [Error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html), [CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html).
- Node.js: [Release status](https://nodejs.org/en/about/previous-releases), [Node 24 archive](https://nodejs.org/en/download/archive/v24), [Node 24 LTS migration note](https://nodejs.org/en/blog/migrations/v22-to-v24).
- node-postgres: [Repository and MIT license](https://github.com/brianc/node-postgres), [Pooling](https://node-postgres.com/features/pooling), [Transactions](https://node-postgres.com/features/transactions), [Queries and prepared statements](https://node-postgres.com/features/queries), [Data types](https://node-postgres.com/features/types).
- Alternatives: [Postgres.js repository/docs](https://github.com/porsager/postgres), [Neon serverless driver sessions and transactions](https://github.com/neondatabase/serverless/blob/main/README.md).
- Flyway: [Supported databases/versions](https://documentation.red-gate.com/flyway/getting-started-with-flyway/system-requirements/supported-databases-and-versions), [Schema history/checksums](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/flyway-schema-history-table), [Configuration](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace), [Commands](https://documentation.red-gate.com/flyway/reference/commands), [Apache-2.0 source license](https://github.com/flyway/flyway/blob/main/LICENSE.txt).
- Atlas fallback: [Applying versioned migrations](https://atlasgo.io/versioned/apply).
- Test infrastructure: [Testcontainers Node wait strategies](https://node.testcontainers.org/features/wait-strategies/), [Docker run](https://docs.docker.com/reference/cli/docker/container/run/), [Docker Official PostgreSQL image](https://hub.docker.com/_/postgres/).
