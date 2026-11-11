# Repository Baseline and Evidence Provenance

## 1. Environment and Working-Tree Forensics
- **Active Inspection Environment**: Docker devbox container (`/app`)
- **Remote Origin URL**: `https://github.com/hiro042355/easyslice-ai`
- **Active Working Branch**: `jules-541966946090285922-637b2eee`
- **Authoritative Baseline HEAD SHA**: `7a12460684f8c4aeae99234bfbacd74b8857efb3` (PR #12 merge commit)
- **Working-Tree Status**: Completely clean unstaged tree; Phase 3.7 post-merge audit and readiness closure.

## 2. Commit History and Upstream PR Provenance
The commit hierarchy leading to the current baseline demonstrates strict linear continuity:
```
*   7a12460 (HEAD -> origin/main) Merge pull request #12 from hiro042355/jules-541966946090285922-637b2eee
|\
| * 310954f docs(bilibili): complete Phase 3.6 Freebuff implementation readiness package
* |   64ff714 Merge pull request #13 from hiro042355/fix-wp03-flyway-history-assertions
|\ \
| * 58ce2a8 fix(tests): align Flyway history assertions with migrations V000001-V000009
|/
*   6f1c5f9 Merge pull request #10 from hiro042355/jules-970785852056125113-5a296739
│ \
│  * a1907e4 docs(tiktok): complete Freebuff engineering handoff package
*  │ ea60cbc Merge pull request #11 from hiro042355/jules-12836246595565940175-e12acb0a
│ /
* c150f32 Merge pull request #9 from hiro042355/tiktok-staging-readiness-plan-3110607620436353703
* e8338e8 Merge pull request #8 from hiro042355/jules-15655640267996884995-a76be81e
* ce24b71 Merge pull request #6 from hiro042355/jules-17810214896416270490-525661c9
```

## 3. Repository Boundary Verification & Separation Matrix
To eliminate confusion, repository roles are strictly decoupled:
- **`hiro042355/easyslice-ai` (Core)**:
  - Next.js 16, React 19, TypeScript.
  - Video processing runtime (packaged FFmpeg, Gemini AI transcription, TikTok URL admission).
  - Common Publication Orchestrator: Job tracking, export generation, outbox dispatcher, signed GCS URL issuance.
  - Database schema: `workflow.*` (Migrations `V000001` through `V000009` committed; `V000010` specified).
- **`hiro042355/nexcut-bilibili-publisher` (Publisher Microservice)**:
  - Standalone Node.js / TypeScript microservice.
  - Bilibili Partner Open Platform client, chunked file uploader, archive submission lifecycle.
  - Publisher-side durable deduplication ledger: `publisher.*`.
- **`hiro042355/nexcut-youtube-publisher` (YouTube Microservice)**:
  - YouTube Data API v3 publisher, resumable upload offset tracker.

## 4. Standalone Repository Portability Transfer Instructions
To initialize `hiro042355/nexcut-bilibili-publisher` with this complete specification:
```bash
# In the environment with authenticated access to hiro042355/nexcut-bilibili-publisher:
git clone https://github.com/hiro042355/nexcut-bilibili-publisher.git
cd nexcut-bilibili-publisher
mkdir -p docs/freebuff-handoff/
# Copy the 12 files from docs/implementation/bilibili-freebuff-handoff/ into docs/freebuff-handoff/
# Freebuff can then execute FREEBUFF_MASTER_IMPLEMENTATION_PROMPT.md directly inside the repo.
```
