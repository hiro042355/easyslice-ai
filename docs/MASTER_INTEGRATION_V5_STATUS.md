# Master integration V5 — stabilization, not production activation

Start commit: `ff615509b1c313d59357c5e0643f7e5b37c06a78`. Existing Draft PR #2 and branch `codex/master-integration-v4-20261018` are retained. V4's status document is historical; this document supersedes its build/provenance/QA observations.

## Narrow remediation

1. The generic Workflow class and a server-dependent Reference facade shared one source module, violating the original dependency boundary test. The facade is moved without changing its function body to `lib/workflows/referenceGenerationWorkflowFacade.ts`; all three in-repository wrapper callers and the executing tests now import that module. Generic boundary assertions remain unchanged. The input-contract test follows the moved consumer; redundant regex dotAll flags are removed without changing regex behavior.
2. The root layout no longer requests Google Fonts during build. Existing body Arial/Helvetica stays unchanged. `font-sans` utilities now use Arial/Helvetica; `font-mono` uses the installed system monospace stack instead of Geist Mono. This utility typography difference is intentional and documented. No font files were downloaded or redistributed and no TLS verification was disabled.
3. Seventeen of the 31 pre-existing TypeScript diagnostics are addressed by literal annotations, exhaustive failure guards, correctly typed mock callbacks and immutable fixture reconstruction. No strictness/suppression/broad any escape is added. Remaining fixture contract errors are not certified away.
4. Character read projection requires an actual LOCKED snapshot/revision, rejects duplicate revision authority, cancels stalled response streams on timeout, and keeps bounded error projection.
5. Development Casting rejects malformed array/prototype appearance payloads; tests cover foreign owners, parallel duplicates and removal racing confirmation. It remains development-only and does not establish a real authenticated route or distributed lock transaction.
6. OpenRouter remains mock-only. Added bounded timeout, malformed-response classification, conservative synchronous aggregate budget reservations, retention of reservations after timeout, and a server-only entry point. No live catalog, inference or provider activation.
7. Camera coordinate-ramp proof expands to 11 scenarios (including movement ending before clip completion), in 16:9, 9:16 and square outputs. Preview remains the application's fixed 16:9 UI; browser pixel parity and responsive physical playback are not implied by numeric FFmpeg samples.
8. Additional DOM tests cover Breadcrumb, typed Select, disabled choices and keyboard SelectionCard. Select explicitly rejects disabled values in its handler.

## Additional broad-regression findings

The broader run exposed three more pre-existing failures, independently reproduced on the exact V4 commit:

- Materializer variant test used LF-specific string substitutions on CRLF checkout content. Normalize the disposable source string to LF before mutation and assert the mutation actually occurred. Production registry availability is unchanged.
- Two Hook boundary tests referenced an absent timer adapter. The exact three-line source already exists in the protected dirty worktree and matches the existing timer port contract. That one reviewed standalone file is selectively imported; no Hook composition/provider/auth behavior is rewired. An executable one-shot/cancellation test is added. No other original source is copied in V5.

## Character provenance

Authenticated read-only GitHub evidence establishes repository `hiro042355/nexcut-character-engine`, branch `v0/nexcut-engine-development-eb546ed2`, commit `6aa8474495820df64093935e8e82feb27d92c029`, signature verified, tree `b451bed221aa179d2ccc32d7580f6c232268d135`. All 142 ZIP files match the tree's Git blob SHA-1 values, with no missing or differing file. ZIP SHA-256 remains `4948cfb9a91f53935e174ff81fafcf24a335cff74e5aa8ae21ee65ce898cff87` and CRC passes. This proves source correspondence, not production security readiness.

## Six-contract mismatch inventory

All source references below are relative to the verified Character commit. These upstream findings are not fixed by changing the NEXCUT consumer or modifying official contracts.

| Contract / source | Expected vs actual | Classification / consequence | Resolution boundary |
|---|---|---|---|
| Character ID contract; `model.ts`; legacy AI MV Casting | Official revision is an opaque branded string; original AI MV declaration uses an integer version | SCHEMA_MISMATCH; coercion would fabricate identity authority | Keep separate namespace; no silent conversion |
| Character ID lifecycle doc; `sql-repository.ts:243,286,344` | Doc describes creating a new draft when editing locked identity; SQL methods reject locked mutation | DOCUMENTATION_MISMATCH / IMPLEMENTATION_MISMATCH | Keep stronger rejection; upstream versioning decision required |
| Bible contract; OpenAPI; `model.ts` | Full Bible required fields exist in model/doc; HTTP response schemas are absent | SCHEMA_MISMATCH | Consumer validates the bounded read projection; not a full generated SDK |
| Identity Lock contract; `lifecycle.ts:56`; V4 read client | Upstream `canCastCharacter` requires locked snapshot status LOCKED; V4 accepted APPROVED too | IMPLEMENTATION_MISMATCH | NEXCUT client tightened; no upstream weakening |
| Reference Asset contract; `api-router.ts:401`; `generation.ts:47` | Approved-reference/identity guidance contract is stronger than HTTP generation request validation | SECURITY_MISMATCH | No generation endpoint exposed by NEXCUT adapter; upstream authority validation required |
| Casting contract; `casting.ts`; `model.ts:121`; `api-router.ts:321` | Domain CastingRecord includes revision/status/project type; legacy HTTP CastingAssignment does not | API_MISMATCH / SCHEMA_MISMATCH | Production mutation integration blocked; local domain store explicitly separate |
| Scene Assignment domain contract; router/OpenAPI | Domain record/store exists; no Scene HTTP endpoint is present | API_MISMATCH | No invented endpoint or claimed remote persistence |
| Generation request contract; `generation.ts:47`, `api-router.ts:401` | Validation checks presence/count but does not prove selected revision belongs to locked Character or approved references | SECURITY_MISMATCH | No real generation calls; upstream closure required |
| API auth doc; `auth.ts:38,74,107`; `api-router.ts:75,428,440` | Production-style ownership language vs development default secret/fixture keys; character list lacks owner filter; job read/cancel lacks resource ownership context | SECURITY_MISMATCH | Do not use as Production identity bridge. Local-only tests do not certify tenant isolation |
| OpenAPI vs API contract/router | Missing security scheme, response schemas and several documented detail/cancel routes | SCHEMA_MISMATCH / API_MISMATCH | Preserve official source; upstream spec closure required |
| Packaged tests; `api-router.ts:25`; `sql-repository.ts:42` | Custom test DB path creates fresh unclosed SQLite connections; child finally unlink fails on Windows | TEST_MISMATCH / IMPLEMENTATION_MISMATCH | Parent-owned disposable cleanup compatibility proof; upstream leak remains |

## Packaged test compatibility proof

`scripts/verifyCharacterPackage.mjs <absolute ZIP path>` verifies the pinned archive, validates entries, extracts into a new owned temporary directory, and changes only the disposable copies' two cleanup statements. Every original assertion is preserved. Tests execute with synthetic HMAC material and a restricted environment. The parent deletes the disposable database directory after child process exit and verifies cleanup completion. Result: 2 tests / 2 pass / 0 fail / 0 skip. This is not an upstream fix; the original ZIP/repository is unchanged.

## Remaining activation blockers

- Fourteen existing test type-contract errors remain; full repository typecheck is not PASS.
- Full repository lint remains red; focused task scope is checked separately.
- Real authenticated Character composition, production durable Casting/Scene state, revision CAS and source-to-user identity mapping are not implemented.
- Original dirty AI MV durable storyboard, revision history/CAS, owned audio admission, candidate lifecycle/render/custody and newer Core/export integration remain outside this branch. V5 adds only the reviewed timer file, not a wholesale source reconciliation.
- No browser-wide Production E2E, external inference, publication, DB migration or deployment acceptance is claimed.

## Final local verification

| Group | Result |
|---|---|
| Focused camera/UI/Character/OpenRouter/PCM | 75 tests, 75 pass, 0 fail, 0 skip, exit 0 |
| Broad deterministic regression (24 existing test directories) | 434 tests, 434 pass, 0 fail, 0 skip, exit 0 |
| Changed real PostgreSQL proofs | 13 tests, 13 pass, 0 fail, 0 skip, exit 0; disposable local Testcontainers only |
| Character package compatibility proof | 2 tests, 2 pass, 0 fail, 0 skip, exit 0; parent cleanup verified |
| Full repository typecheck | 31 baseline → 14 current; 17 resolved, 0 new; FAIL overall |
| Focused lint | 0 errors, 2 existing warnings; exit 0 |
| Global lint | 231 errors, exit 1; FAIL overall |
| Actual `npm run build` including prebuild | PASS, exit 0; FFmpeg materialized from verified local package cache and pinned yt-dlp SHA-256 verified; 58 static pages generated |
| Built local HTTP smoke | `/ai-mv` and `/workspace-flow` HTTP 200; local PCM panel present; no API/provider route invoked |

The earlier restricted-environment build failed starting a Turbopack child process (exact cause unproven); that failure is retained in evidence. The ordinary Windows-host build subsequently completed; no framework suppression or font TLS bypass was used. The original Google Fonts build-time dependency is removed rather than relying on network availability.

Reproduce focused tests with `NEXCUT_TEST_FFMPEG` set to an existing verified local FFmpeg executable and `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/camera/*.test.ts tests/ui/*.test.ts tests/ui/*.test.tsx tests/aiMvEvolution/musicIntelligence.test.ts`. The owner's JSON evidence records exact broad-regression and PostgreSQL file arguments. The complete repository suite is not claimed solely from those selected groups.

Final counts/commands and original-worktree hash verification are recorded in the owner's accompanying V5 evidence report. Draft PR remains review-only; do not merge/deploy based on this document alone.
