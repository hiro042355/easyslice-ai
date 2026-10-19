# Master integration V6 — bounded stabilization, activation blocked

Starting commit: `60e7a7bb69688f65b3a296869da68c0557b97c11`. Existing Draft PR #2 / `codex/master-integration-v4-20261018` only. No merge, production deployment, production database access or real inference is authorized by this implementation.

## Changes and executing proof

- Update two stale PostgreSQL bridge/observability fixtures to the actual V4 transaction interface. Methods outside the exercised legacy bridge explicitly throw instead of pretending V2 behavior is tested. Failure fixtures now include the canonical safe reason. Existing result, rollback, discard and observability assertions are retained.
- Remove simple JSX/navigation/declaration lint violations and use a lazy cooldown clock initializer. Do not suppress the remaining lint rules or replace `any` with an unchecked alias.
- Validate workflow context/authorization from `unknown` through object, scalar and enum guards. Valid domain inputs preserve behavior; malformed arrays are rejected.
- Disable Character compatibility reads in Production at the direct factory method boundary, even if enabled configuration is supplied. Development Casting already refuses Production construction. Neither has an application route/background-job composition in this branch. The unrelated AI MV UI remains available.
- OpenRouter remains offline-only with no real inference implementation. Mock execution now requires explicit mock authorization, a bounded request ID and a synchronous accounting claim. Duplicate claims are rejected before transport; cancellation reaches transport via AbortSignal; ambiguous/cancelled requests retain both claim and reservation. Production direct invocation is rejected. These are local mock guarantees, not production authentication or durable billing.
- Security review found a legacy subtitle URL interpolated into a shell command. Replace with `execFile` argument-array invocation, canonical HTTPS YouTube host validation, end-of-options delimiter, isolated `mkdtemp` directory/cookie file, bounded execution/output and secret-safe failures. No subtitle download or provider request was executed. Valid JSON3 text/timing projection is tested; malformed structures fail closed.
- Bridge Node byte streams to DOM ReadableStream with runtime byte validation instead of `any` assertions. Tests execute Response consumption, malformed chunks and cancellation. Existing shared legacy video-temp-file ownership remains a separate unresolved security concern, not certified by this stream typing correction.

## Character authority and six contracts

Read-only verification again matches all 142 ZIP files to commit `6aa8474495820df64093935e8e82feb27d92c029`, tree `b451bed221aa179d2ccc32d7580f6c232268d135`, in `hiro042355/nexcut-character-engine`. Archive SHA256: `4948cfb9a91f53935e174ff81fafcf24a335cff74e5aa8ae21ee65ce898cff87`; CRC passes. A ZIP comment alone is not treated as proof.

Official inventory: `docs/integration/CHARACTER_ID_CONTRACT.md`, `CHARACTER_BIBLE_CONTRACT.md`, `IDENTITY_LOCK_CONTRACT.md`, `REFERENCE_ASSET_CONTRACT.md`, `CASTING_CONTRACT.md`, `GENERATION_REQUEST_CONTRACT.md`; OpenAPI `docs/integration/openapi.json` is 3.0.3, API version 1.0.0. Package name is `tanstack_start_ts`, private=true; package version/license and a LICENSE file are absent. Distribution permission is not inferred.

The detailed V5 mismatch table remains applicable. Resolution is **C + D**: keep affected production integration disabled and request upstream corrections; do not invent a compatibility version or mutate authoritative contracts.

| Authority | Unresolved mismatch / upstream correction |
|---|---|
| Character ID | Opaque string revision IDs vs original AI MV integer versions; require explicit interoperable identity/version contract, not coercion |
| Character ID lifecycle | Locked-edit docs describe new draft while SQL rejects edits; preserve rejection until upstream clarifies |
| Bible | OpenAPI response schemas missing; bounded consumer projection is not a complete generated SDK |
| Identity Lock | Production owner/project identity mapping and durable snapshot authority unavailable; locked badge is not authorization |
| Reference Asset | HTTP generation path does not establish approved references/revision ownership as required by domain contract |
| Casting | Domain CastingRecord has revision/status/project type, HTTP CastingAssignment does not; no semantic equivalence proven |
| Scene Assignment | No official HTTP endpoint; do not fabricate one |
| Generation | Presence/count validation does not establish locked revision and reference-guidance authority |
| Authentication | Development keys/default secret, list/job ownership gaps; require upstream server-side resource authorization |
| OpenAPI | Missing security scheme and response/detail/cancel schemas; require authoritative spec closure |
| Package | SQLite request handles stay open; Windows child finalizer EBUSY. Existing parent-owned compatibility harness changes only disposable cleanup statements, preserving all assertions; this is not an upstream leak fix |

## Camera and existing AI MV boundaries

Camera remains deterministic 2D crop/zoom interpolation. TRACKING is manually configured motion, not subject recognition; CRANE_SIMULATION is not 3D. Real coordinate-ramp FFmpeg proof covers static, both pan/tilt/zoom directions, combined movement and mid/end boundaries across landscape, portrait and square. Three synthetic MP4 cases are also executed when the verified local FFmpeg binary is supplied. Browser pixel parity/responsive visual certification is not implied by filter-string or synthetic numeric tests.

No bulk import from the original dirty workspace. Its durable AI MV/Core render/revision/custody/export changes remain unintegrated. No original untracked cancellation foundation is staged or modified.

## Remaining quality gates

Initial reproduction: full TypeScript 14 diagnostics; ESLint 231 errors. Six stale PostgreSQL fixture diagnostics are corrected. Remaining synthetic Sensitive fixtures and arbitrary generic query-row mock need proper typed fixture reconstruction, not broad casts. Full typecheck remains FAIL until these are resolved.

Large remaining explicit-any clusters are legacy Reference workflow/persistence/polling authority plumbing. Replacing them mechanically with unknown or guessed unions would either fail compilation or hide real discriminant/branding/authority gaps. Full lint remains FAIL; no rule configuration or relevant-source exclusion is weakened. Remaining effect-derived state needs lifecycle-specific regression before changing synchronization semantics. Accepted-persistence cleanup references cannot simply become const at later initialization: failure cleanup closes over values before all writes finish.

Final commands, individual diagnostic ledger, stdout/exit/skip counts, final candidate SHA, original-file hash checks and PR update evidence are in the accompanying V6 report. Passing selected tests does not certify every repository suite. Merge readiness and production readiness remain BLOCKED while global quality/security/contract gaps remain.
