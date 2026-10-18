# V8 — request-isolated subtitles and offline multimodal planning

Baseline: `21a5d4a8f97c1f765211b4530c02591c21958492`, Draft PR #2 / `codex/master-integration-v4-20261018`. Implementation occurs only in the existing clean isolated worktree. Original dirty workspace is not a source target. No merge, deployment, real inference, external media transfer or Production DB operation.

## Confirmed security defects and corrections

- Legacy `/api/transcript` read OS-temp `downloaded.mp4` and wrote `transcript-audio.wav` without a resource/owner binding. `/api/upload-video` wrote the common source. The UI already uses durable media admission elsewhere but its clip transcript request omitted the reference. It now sends its existing job/media IDs with the unchanged clip range; the server verifies authenticated owner, job and media relationship before downloading. No caller-supplied owner/path/URL enters acquisition. Original Japanese plain-text prompt/WAV format and success DTO remain, while missing/invalid references fail closed. Explicit safety limits: 8 KiB JSON, positive range up to 600 seconds and end up to 86,400 seconds. Unsupported unidentified legacy clients must migrate; the unused shared-upload endpoint returns authenticated 410, not a filesystem path. `/api/media/admit` is unchanged.
- Durable transcript and subtitle burn used predictable job-scoped roots; two requests for the same job could overwrite or delete each other's files. A synthetic proof reproduces both effects using only a disposable test root. These subtitle routes now use independent OS `mkdtemp` roots, mode 0700, server-fixed file names, regular-file/symlink checks and closure-owned cleanup. Output bytes/text are fully materialized before cleanup. No cleanup path comes from a request/job ID. Request roots are separate from older job-temp operations.
- Local subprocesses use argument arrays, shell=false, no interactive input, bounded time and ignored raw output. Timeout/cancellation kill the child and wait for close before cleanup. Input FFmpeg protocols are restricted to file/pipe. GCS streams are exclusive-create and cancellable; no Production storage mutation is introduced. Inspection is bounded to 120 seconds; cancellation during inspection waits for that bounded operation to settle before cleanup. This is not an OS sandbox against a privileged same-account attacker or malicious codec exploitation.
- YouTube subtitle acquisition uses the same request lifetime and child-close semantics, so setup/parse/failure/cancellation cleanup is not scattered across callback branches. URL allowlist, Japanese/English selection, scoring and subtitle projection remain. JSON3 is regular-file checked and bounded to 4 MiB. No real YouTube acquisition was executed.
- Translation and clip-provider responses are bounded, structurally checked and safely normalized; raw provider messages/exceptions/paths are not logged/returned. Same-origin checks protect subtitle mutations. Timed transcript output/SRT/ASS remain covered by existing tests. Timed audio reads are limited to 32 MiB; request/provider byte limits count actual streamed data.

## Executing proof

`tests/productionIdentity/v8SubtitleIsolation.test.ts` executes old-collision reproduction, six concurrent same-filename/different-owner/project operations, same-job no-cross-cleanup, foreign-resource rejection before I/O, download/extract/provider/cancellation cleanup, traversal and Windows junction rejection, real child cancellation/timeout/spawn failure, verified-owner route dispatch and invalid requests, bounded safe provider response/translation, and real synthetic FFmpeg WAV clipping. Existing subtitle tests retain authorization/order/output assertions, updated only for the new request-workspace API and stream download. They are not replaced by source-only assertions.

The storage/auth/provider boundaries are deterministic mocks; Production WIF, GCS/SQL connectivity, Production authorization and full authenticated browser E2E are not certified. No real credentials are used in tests.

## Type and lint group

Full TypeScript baseline is zero diagnostics; full ESLint baseline is 169 errors and 55 warnings. Safely known types replace nine explicit-any occurrences: PendingPoll client input derives from its interface; lookup audit uses its actual reason/status type; accepted-state projection, omission actions/policy and failure-class projection use existing contracts. The union's pending/processing combined discriminant requires an explicit property guard, preserving undefined for malformed missing-property observations. No guessed authority or confidentiality brand is created, no rules/strictness/exclusions changed.

Remaining explicit-any clusters still involve correlated operation bindings, branded persisted envelopes, resume/cancel/terminal projections and validators. They require domain-aware reconstruction and executing lifecycle proofs; not a blanket unknown alias or cast. Exact final diagnostics and per-file remediation requirements are in the owner evidence ledger. Full lint remains a required failing gate, not waived.

## OpenRouter — verified documentation, no live execution

Official documentation inspected 2026-10-19 (Asia/Tokyo):

- [Text API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)
- [Model metadata](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [Image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [Video submission](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos)
- [Video workflow](https://openrouter.ai/blog/tutorials/video-generation-api/)

Text, image and asynchronous video are documented, but not universally supported by every model. Image has dedicated model/endpoint capability and per-unit pricing metadata. Video submission returns a job handle and requires bounded polling/content retrieval; it is not a synchronous text response. Models, parameters, input/output modalities, pricing SKUs and availability must be freshly validated before future activation. No model list/prices are hardcoded as live authority.

New `openRouterMultimodal.ts` is **offline planning/interfaces only**: discriminated text/image/video requests, explicit per-output modality and model-specific allowlists, token/image/second mock quote units, input-cost upper bounds, immutable plans and async job observations including unknown/no-resubmit. It contains no network implementation or arbitrary download URL. Complete mock quotes are synthetic assertions, not real SKU coverage or billing guarantees.

Existing token/text executor now rejects image/video before transport even if a catalog advertises them. It must not mislabel a text parse as media execution. `OPENROUTER_ENABLED` remains false by default; direct Production execution remains forbidden. No real multimodal dispatch/poll/download is implemented. Durable owner-bound authorization, reservation/usage reconciliation, ambiguous job recovery and artifact custody are required before activation. Cancellation must never imply provider non-consumption or automatic resubmission.

## Character and independent features

ZIP checksum/CRC and all 142 blobs reverified against `6aa8474495820df64093935e8e82feb27d92c029`; upstream branch is identical. Official contracts/OpenAPI unchanged. Existing HTTP/domain Casting mismatch, missing Scene endpoint/security/owner/Lock authority and package license/version gaps remain. Decision C+D: affected Production operations stay disabled; no invented endpoint/revision conversion. Deterministic local identity/casting/scene/direct-invocation negatives remain, separate from upstream compatibility tests.

AI MV, camera and Clip workflows are regression targets, not bulk imports from original uncommitted foundations. Camera proof uses real local synthetic FFmpeg; tracking remains manual and crane 2D. Browser pixel parity and authenticated editing/save end-to-end remain unverified.

## Residual boundaries / disposition

Other media operations (`cut`, `multi-cut`, `audio-energy`, direct YouTube import) still use the older job-temp helper. New subtitle roots cannot be deleted by those operations, but same-job concurrency among those non-subtitle operations is not certified by this patch. Do not treat the corrected subtitle boundary as a whole-application filesystem sandbox.

Full lint, residual media/job lifecycle architecture, upstream Character authority, durable provider/cost accounting, original AI MV/Core reconciliation and authenticated browser E2E keep merge and Production readiness BLOCKED. Exact final-commit commands, failures/retries, result counts and Draft publication evidence accompany the 50-section owner report. No deployment or provider activation follows from local PASS results.
