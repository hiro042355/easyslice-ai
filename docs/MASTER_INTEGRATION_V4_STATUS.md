# Master integration V4 — bounded foundation, not release certification

Baseline: `6edd8726709c6c530f9228fed38d076f349f5387` (merged PR #1). Its tree matches PR head `8d3449586002816a724a2623d05238ff83df28c7`. Original dirty main remains at `f3873fb294bbc11974ca180dea10fa711c49d436`; it is not this branch.

## Implemented and locally exercised

- Camera: common easing, crop-centre direction, first-match overlap priority; finite/bounded export parameters; malformed camera requests reject rather than silently omit an effect. Explicit recommendation Accept → Apply; Reject preserves movement settings.
- Real FFmpeg: ten synthetic coordinate-ramp cases, seven frames and nine coordinates per frame, five RGB levels tolerance; three synthetic MP4 encode/decode cases. This is numerical crop/zoom evidence, not browser pixel equality or Production export evidence.
- Shared UI: enabled focus trap/return, unique modal/menu IDs, radio arrow focus; DOM interaction tests. No visual redesign.
- Reviewed local PCM analysis imported unchanged (normalized LF) from the protected worktree, with its four deterministic tests; a separate browser-only panel is added without replacing existing AI MV editing or sending media.
- Character: disabled-by-default, server-guarded read client for the actual `/api/v1/characters/{id}` path, exact operator HTTPS origin, no redirects, bounded response size, timeout and safe errors. It projects only owner/character/locked revision authority. It is not a complete OpenAPI SDK or a production credential bridge.
- Contract-5 domain Casting/Scene development store: owner/project/scene checks through injected server authority, exact opaque revision lock checks, duplicate prevention, immutable snapshots, removal propagation. Construction rejects `NODE_ENV=production`. No public route or production persistence is installed.
- OpenRouter: offline mock catalog, capability metadata, unknown prices stay null, default-disabled configuration, key/budget/capability/price denial, estimate reservation vs mock actual usage, safe error normalization, zero automatic retries. Existing normalized provider error types are reused. The Reference registry remains unchanged. No live transport, inference or discovery is supplied.

## Selective import ledger

| Original and destination path | Reason | Conflict | Evidence |
| --- | --- | --- | --- |
| `lib/aiMvEvolution/musicIntelligence.ts` | Independent bounded PCM analysis, no infrastructure dependencies | Destination absent | LF SHA-256 `4caefa2b0801d1be15c27829d31e0b5ceedbd292dcd0ed46caa706e1c6ea888c`; exact normalized text match |
| `tests/aiMvEvolution/musicIntelligence.test.ts` | Executable deterministic regression | Destination absent | LF SHA-256 `715bc829a42b6ec8819d50bd2a40d258fc714bc838e65a91182292ec2cd356d1`; exact normalized text match |

No other dirty-worktree source was copied. No `.env`, local database, personal media, cancellation foundation or generated cache was imported.

## Unresolved reconciliation and Character boundaries

The original worktree contains 575 modified/untracked paths. A path-heuristic inventory classifies A=92, B=19, C=165, D=65, E=27, F=14, G=0, H=165, I=4, J=11, K=13. This is triage, not a content/security approval of all 575 files. Those files remain preserved, not discarded.

Original `app/api/cut/route.ts` and its durable ownership/export dependencies differ substantially from this baseline; original `app/workspace-flow/page.tsx` also diverges. Their complete dependency-closed integration is **BLOCKED pending content-level reconciliation**, not implicitly superseded by this branch. The original AI MV durable storyboard/render/revision/candidate stack remains outside this branch. Only the isolated PCM slice is reconciled here.

Character archive SHA-256: `4948cfb9a91f53935e174ff81fafcf24a335cff74e5aa8ae21ee65ce898cff87`. CRC/path/symlink/entry-size checks passed before isolated extraction. ZIP source comment `6aa8474495820df64093935e8e82feb27d92c029` remains **UNVERIFIED**: the authorized GitHub commit GET returned HTTP 404.

Six files under `docs/integration/`: `CHARACTER_ID_CONTRACT.md`, `CHARACTER_BIBLE_CONTRACT.md`, `IDENTITY_LOCK_CONTRACT.md`, `REFERENCE_ASSET_CONTRACT.md`, `CASTING_CONTRACT.md`, `GENERATION_REQUEST_CONTRACT.md`.

OpenAPI 3.0.3 parses, but does not define response schemas or security schemes. Domain `CastingRecord` carries revision/status; HTTP `CastingAssignment` does not. No Scene Assignment HTTP endpoint exists in the packaged router/OpenAPI. Legacy AI MV integer identity revision is not equivalent to Character Engine opaque string revision. No coercion or invented endpoint is introduced.

The archive also includes a development default HMAC secret and seeded auth fixtures. These are not a safe production identity bridge and were not imported. Packaged consumer/E2E tests were executed offline with Node 24/tsx/SQLite; both failed during cleanup with Windows SQLite `EBUSY`. Cleanup can mask an earlier failure, so no 26-step completion is claimed. Vendor package sources were not repaired.

Character UI selection, production Casting/Scene persistence, HTTP mutation compatibility, server auth composition and complete AI MV integration remain **BLOCKED**. The development store is not production durability evidence and cannot grant generation/publication authority.

## Reproducible local commands

```powershell
$env:NEXCUT_TEST_FFMPEG='<absolute existing local ffmpeg executable>'
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/camera/*.test.ts tests/ui/*.test.ts tests/ui/*.test.tsx tests/aiMvEvolution/musicIntelligence.test.ts
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/clipEditing/*.test.ts tests/providerClients/*.test.ts tests/workflows/*.test.ts
npx tsc --noEmit --incremental false
npm run lint -- --quiet
npm run build --ignore-scripts
git diff --check
```

Focused tests: 44/44 on the recorded run. Wider selected regression: 58/59; the same `workflowRuntimeBoundary.test.ts` import-list failure reproduces on the exact unchanged merge baseline. Full repository typecheck: 31 diagnostics on baseline and candidate, added/removed diagnostics zero after installing pinned `@types/jsdom` 30.0.0. Full repository lint remains red; changed-file lint passes. No full deterministic repository suite or Production E2E certification is claimed.

One earlier `next build` passed before the final source set. The final recorded build attempt is **BLOCKED** by Google Fonts Geist/Geist Mono retrieval failure, not accepted as PASS. Build scripts were suppressed to avoid the prebuild yt-dlp network download; this does not certify packaged binary distribution. Final build/package certification and complete original-stack reconciliation are required before merge.

## Architecture map / activation boundaries

Existing AI MV page → existing application APIs (unchanged provider behavior); new local signal panel → pure browser WAV analysis only. Workspace flow → CameraEditor/CameraPreview → existing authenticated cut route → bounded camera filter → FFmpeg. This route's Production DB/storage behavior was not exercised.

Character server guard → read compatibility client or development Casting store → injected/mock authority only; neither is wired to a public mutation route. OpenRouter mock foundation → injected offline transport/accounting only; no new catalog member is activated in the live registry.

Production readiness: **BLOCKED**. Merge readiness: **BLOCKED**. This branch is for bounded implementation review, not deployment. No Production mutation, external inference, publishing, migration or credential change is part of this work.
