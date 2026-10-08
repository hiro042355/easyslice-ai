# Mission 06 FILE_UPLOAD consent and retention decision contract

INITIAL_TRANSFER_METHOD=FILE_UPLOAD. PULL_FROM_URL=DEFERRED; no implementation or speculative critical dependency added. Current live routes/publication remain disabled. This contract is preparation and Product Owner review material, not evidence of a deployed UI.

## Existing storage and source qualification

Repository uses private Google Cloud Storage with uniform bucket access/public-access prevention, owner-scoped media/export/job identifiers and isolated local per-job temp roots. No new storage provider introduced. Terraform declares 7 days after customTime and a separate 7-day acquisition-handoff prefix rule; this is desired-state conditional infrastructure, not a universal TikTok retention policy or proof of applied lifecycle. Current object/bucket contents and applied retention were not inspected. Existing storage code/permissions must be reused and owner boundaries preserved.

First eligible media must be a genuine user-selected device video with content rights and trusted source hash/size/duration. The synthetic media seam demonstrates code only, not real provenance/codec validation. A generated clip already stored server-side is not silently reclassified as device media. The Product Owner must select an eligible initial workflow; if the chosen workflow inherently requires server PULL_FROM_URL, stop and separately scope/approve it rather than bypass the deferred-method decision.

## Explicit consent UX contract

1. Authenticate through canonical Firebase UI. Show owned connection state; unavailable/expired/revoked/error disables posting. Browser UID/client state is not ownership evidence.
2. User selects one eligible video. Server validates owner/source/codec, recomputes exact bytes/checksum/size/duration and presents preview. No arbitrary path/storage key/provider URL from client.
3. User chooses the owned TikTok account and reviews actual current Creator Info/nickname. Bind account/app/environment/generation and server receipt; refresh stale information before consent.
4. Present editable caption, explicitly selected supported privacy (no hidden default), disabled unsupported interactions and explicit music/commercial/AIGC choices. Display media/account details without credentials.
5. User confirms preview and publication deliberately. Server authenticates same user/session, validates same-origin/CSRF and exact snapshot/settings, then issues one-use authorization with existing technical maximum five-minute expiry and session/token/Creator deadlines. This is permission expiry, not a retention period.
6. Claim before init/I/O. Changed media/checksum/size/duration/account/session/generation/settings/Creator info invalidates the grant. Concurrent/duplicate/replay cannot start another init. Cold restart before init requires fresh review/consent rather than recovering process-scoped handles unsafely.
7. Show preparing/uploading/processing/published/unknown states from verified server evidence. Provider lookup/auth errors are UNKNOWN, not proof a post failed. Persist immutable publish correlation for observation-only recovery. No automatic repost or ambiguous retry.
8. Disconnect after verified owner/CSRF invalidates states/grants and wipes token envelope even if key recovery fails. Actual provider revocation needs its own approved network action and is not claimed from local deletion. Disconnect does not delete a TikTok post.

## Retention/deletion proposal — no final periods invented

| Data | Storage/control | Proposed lifecycle boundary | Final retention |
|---|---|---|---|
| Generated/source video | Existing owner-scoped GCS/job storage | Keep only for approved processing/export/user need; honor legal/backup rules | REQUIRES_PRODUCT_OWNER_DECISION |
| Temporary local/upload artifacts | Existing per-job temp roots/private staging | Clean only owned job artifacts after completion/approved timeout/cancel; verify no active reader | REQUIRES_PRODUCT_OWNER_DECISION |
| Connection access/refresh tokens | Version2 encrypted SQL envelope, wrapped DEK/KMS version | Erase active envelope at verified disconnect; expired credentials are unusable, not silently refreshed | REQUIRES_PRODUCT_OWNER_DECISION for normal/expired/account-deletion window |
| OAuth state | Hashed state, owner/session/app/scope/callback binding | Existing maximum ten-minute authorization validity; terminal/expired cleanup needs bounded maintenance | REQUIRES_PRODUCT_OWNER_DECISION |
| Publication receipts/correlation | Owner-scoped SQL metadata, immutable provider ID | Retain enough for unknown-outcome reconciliation, security/audit/legal obligation | REQUIRES_PRODUCT_OWNER_DECISION |
| Failed/partial upload artifacts | Existing private job storage only | Preserve only approved diagnostic/recovery need; never replay init from artifacts | REQUIRES_PRODUCT_OWNER_DECISION |
| Disconnect record | Revoked metadata and invalidated grants | Local credential wipe; distinguish provider revocation and posted content | REQUIRES_PRODUCT_OWNER_DECISION for remaining metadata |
| Account deletion | Verified request across existing owner-scoped DB/GCS/export/backup records | Reviewed deletion/anonymization/exception workflow; no automatic external post deletion | REQUIRES_PRODUCT_OWNER_DECISION |

Earlier 24h/30d examples are proposals, not adopted deadlines. No cleanup scheduler, lifecycle/IAM setting, Production deletion or new storage was installed. Consent/token/state expiry does not prove row/blob deletion. Retention must cover backups, reconciliation, user rights/contact and legal holds; Product Owner/legal/cloud storage owners approve exact periods and maintenance identity before execution.
