# NEXCUT AI TikTok Developer review preparation package

Prepared 2026-10-08. PACKAGE = PARTIAL; SUBMITTED = NO; PORTAL CHANGES = 0. The following text is a future submission draft, not evidence that Production TikTok features operate today. Known URLs/contact come from Product Owner evidence, not a new Production check. Current portal products/scopes/domain verification/audit status have not been inspected and are UNKNOWN. Production Connect remains disabled.

## 1. App purpose draft — READY as copy, NEEDS_USER_ACTION to confirm

NEXCUT AI helps creators prepare and review their own original video content. Creators can connect their TikTok account, preview a video, choose supported posting settings and explicitly authorize publication to that account. Intended audience must be authentic creators broadly, not an internal account-upload utility. The Product Owner must confirm actual audience and content rights before using this wording.

## 2. Login Kit explanation — READY draft

Users first authenticate to NEXCUT AI with its existing Firebase sign-in. Connecting TikTok is a separate optional authorization flow; it does not replace NEXCUT identity. An unpredictable one-use state binds authorization to the same verified Firebase user and session, requested scopes, application, environment and fixed callback. A successful server-side exchange links only that user's owned TikTok account. Cancellation and expiry do not create a connection.

## 3. Content Posting explanation — READY draft, BLOCKED_BY_IMPLEMENTATION for live demo

After account connection, the service obtains current Creator Info and displays the account and supported settings. The creator previews the actual video, edits the title, selects privacy and permitted interactions, completes disclosures and explicitly consents before any upload. A durable single-use publication authorization binds that decision to current account, connection generation, media bytes and fresh Creator Info. Status is reconciled after transfer; an ambiguous transfer never automatically republishes.

FILE_UPLOAD is a transport mode, not an OAuth scope. The official content-sharing guideline limits FILE_UPLOAD to content on users' devices and requires PULL_FROM_URL for already server-stored video. This mission implements the requested FILE_UPLOAD adapter, but NEXCUT's real export/media origin must be documented before claiming that flow is eligible. If videos already reside on NEXCUT servers, verified-domain PULL_FROM_URL implementation and separate approval are blockers; do not misdescribe server exports as device media.

## 4–6. Custody, consent and removal — READY draft, NEEDS_USER_ACTION for policy sign-off

Client secret and access/refresh tokens stay on the server. Token envelopes use authenticated encryption and account/user/application/environment/generation metadata binding. The browser sees bounded connection status, never credentials. Keys are resolved by a server-owned provider; Production key custody/rotation is still a release prerequisite. Session expiry, revocation, logout, user mismatch, state replay and consent replay fail closed. Expired provider credentials require controlled reauthorization until a separately reviewed refresh lifecycle is enabled.

Users must knowingly authorize TikTok permissions and each specific video publication. Privacy and interaction options cannot be silently preselected; unsupported choices are disabled. Commercial content and music confirmation require the correct disclosures. Generated-content labeling must match actual content and policy. Disconnect invalidates local pending authorizations, erases encrypted token envelopes and marks the connection revoked; provider revocation transport must complete through a separately enabled authorized path. Do not claim completed provider revocation when network is disabled or its result is unknown. NEXCUT account deletion and provider account disconnection are different operations; deletion/retention policy must be reviewed.

## 7. Privacy consistency checklist — NEEDS_USER_ACTION

Review https://www.nexcutai.com/privacy and /terms for actual TikTok permissions/data categories, purpose, encrypted server custody, processor/provider sharing, retention/deletion windows, disconnect vs account deletion, user rights/contact, international processing and generated-content policy. Contact: nexcut.ai@gmail.com. Require legal/Product Owner review; no claim that current public text covers these additions. Keep legal links visible directly on the externally facing website. This mission does not change public policy.

## 8–11. Product and portal checklist

| Item | Required value/action | Status |
|---|---|---|
| App | NEXCUT AI; matching clear original icon and broad creator-facing purpose | NEEDS_USER_ACTION |
| Website | https://www.nexcutai.com/ ; mature public product, not only a landing/login page | NEEDS_USER_ACTION |
| Legal | https://www.nexcutai.com/terms and https://www.nexcutai.com/privacy; visible active links | NEEDS_USER_ACTION |
| Contact | nexcut.ai@gmail.com | READY as owner-provided copy |
| Login Kit | Add/verify correct web product only after separate authorization | NEEDS_USER_ACTION |
| Basic scope | user.info.basic for identifying the connected account | READY justification; portal UNKNOWN |
| Direct Post scope | video.publish for creator-approved direct posting | BLOCKED_BY_TIKTOK_APPROVAL |
| Inbox scope | video.upload excluded; no separately approved Inbox/Draft feature | READY |
| Redirect | Exactly https://www.nexcutai.com/api/tiktok/oauth/callback ; static HTTPS, no query/fragment, no wildcard/alternate domain | NEEDS_USER_ACTION |
| Domain ownership | Supply and verify owner-approved portal challenge using separately authorized DNS/file action | NEEDS_USER_ACTION |
| Direct Post | Verify product enablement/audit status and creator limits | BLOCKED_BY_TIKTOK_APPROVAL |
| Media source | Device-based FILE_UPLOAD provenance; otherwise implement verified-domain PULL_FROM_URL separately | BLOCKED_BY_IMPLEMENTATION |

Do not claim public visibility from an unaudited client. Current official guidance restricts unaudited Direct Post to SELF_ONLY and private accounts, with an active-user cap. Final permitted visibility depends on current audit state and fresh Creator Info, not a local mock success.

## 12. Review demo storyboard — NEEDS_USER_ACTION and BLOCKED_BY_IMPLEMENTATION

1. Show the matching canonical website and visible legal/contact links; explain broad creator use.
2. Sign in with an approved dedicated NEXCUT reviewer account. Show TikTok disconnected.
3. Use Connect, show actual approved sandbox TikTok consent for basic identity and direct posting, return to exact callback and display the account identity. Never show cookies, tokens, developer credentials or network headers.
4. Select an original rights-cleared device video; show preview, current creator identity and supported duration/privacy/interaction controls.
5. Explicitly choose privacy (no default) and interactions (none enabled by default); demonstrate a creator-disabled control. Edit title. Show commercial-content settings, correct music/policy confirmation and AIGC disclosure when applicable.
6. Confirm consent and publish in the approved sandbox/unaudited visibility constraints; show progress then reconciled result. Do not present mock output as a real post.
7. Demonstrate cancellation, invalid/expired permission recovery and disconnect, plus connection unavailable after local invalidation.

The current local recording can document engineering only. It cannot replace TikTok's required genuine sandbox integration demonstration. No live OAuth/posting or sandbox portal mutation is authorized by this mission.

## 13–14. Recording and reviewer instructions — NEEDS_USER_ACTION

Official app review requires at least one current end-to-end demo; maximum five videos of up to 50 MB each. First-time applicants must demonstrate in the Developer Portal sandbox. Ensure recording domain matches the submitted website, readable UI, narration for every product/scope and no unrelated feature claims. Remove all secrets from footage; keep only reviewer-authorized synthetic/non-sensitive account identifiers. The Product Owner provisions an approved dedicated account and communicates access through the approved submission channel; this document contains no credentials. Reviewer steps: open canonical site, use approved sign-in, navigate Connections, connect authorized sandbox account, follow storyboard, disconnect. Because Production Connect is disabled today, do not submit those steps as currently runnable.

## 15. Rejection/remediation checklist

Mature public product absent -> complete and verify actual public user experience. Portal scope/product mismatch -> remove unused products under separate authorization. Broken/invisible legal links or inconsistent policy -> Product Owner/legal revision then verification. Redirect/domain mismatch -> authorize exact registration and ownership proof. Demo incomplete/mock-only -> record genuine approved sandbox lifecycle. Missing creator identity/current limits/privacy choice/interaction restrictions/music or commercial disclosures -> implement and demonstrate compliance. Private/internal utility or copied content -> correct actual business/use case; wording alone cannot cure this. Server media sent with FILE_UPLOAD -> implement proper verified PULL_FROM_URL or prove genuine device-media path. Unaudited visibility claim -> disclose restrictions and await audit; never bypass. No submission or portal change occurs here.

## Official references checked 2026-10-08

- [App review guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines): public mature product, complete scope explanation, current demo and sandbox requirement.
- [Login Kit web](https://developers.tiktok.com/docs/en/login-kit-web): registered static HTTPS callback and state/session forgery protection.
- [Content sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines): creator-facing UX, consent, media provenance and unaudited restrictions.
- [Direct Post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post): video.publish and posting contract.

Sources are requirements, not evidence that NEXCUT currently satisfies them. No review approval or turnaround time is assumed.

## Mission 04 completion supplement — 2026-10-09

Documentation coverage is complete for the authorized preparation scope; package remains PARTIAL. Real demo/Portal/audit evidence = BLOCKED_PENDING_LIVE_VERIFICATION. No current live functionality is claimed. Actual server code now includes managed-key/native/B7 integration and durable observation, tested solely with synthetic external dependencies.

Repository privacy-policy consistency review: app/privacy/page.tsx sections 2–3 describe Firebase identity/session and processors; section 5 expressly marks TikTok OAuth/token storage/refresh/publication as not active; sections 6–7 describe retention, deletion requests and platform choices. app/terms/page.tsx likewise marks TikTok preparation and rejects blanket autonomous posting consent. This is consistent with current disabled routes. It does not prove the deployed legal text matches the repository or that future active processing is sufficiently disclosed. No public policy edit/deployment occurred.

Before activation, Product Owner/legal sign-off must cover actual TikTok basic identity/open_id, encrypted token/wrapped-key storage, media/caption/settings/provider transfer, purpose and optional consent, revocation vs local disconnect vs NEXCUT account deletion, key/provider processing, retention/backup/reconciliation windows and rights/contact. Proposed expired-state retention 24h and terminal-grant/correlation retention 30d are drafts, not implemented/promised policy. Disconnect wipes the active envelope and invalidates grants; provider revocation may be unknown and deleting a NEXCUT account does not automatically delete an existing TikTok post.

Screenshot capture requirements (genuine approved sandbox only): canonical domain and legal links; normal Firebase sign-in without credential exposure; disconnected state; actual TikTok consent containing only user.info.basic/video.publish; returned owned connection; current Creator Info/nickname; original eligible device video preview and editable caption; manually selected supported privacy; disabled unsupported interactions; commercial/AIGC/music confirmation; explicit final consent; transfer/progress and validated result or conservative unknown; disconnect and unavailable local custody. Use reviewer-approved accounts, redact identifying/secret fields where allowed and never show cookies/tokens/headers/connection strings. Do not fabricate screenshots or present local mock DOM as actual TikTok evidence.

Reviewer procedure remains a future plan: Product Owner prepares a dedicated approved account, confirms app/domain/products/scopes/callback and access in the Portal, communicates account access through the approved review channel, and records the genuine end-to-end approved sandbox lifecycle. Current Production Connect is disabled; these instructions are not currently runnable. A real review submission and Direct Post audit need separate authorization/TikTok approval. Do not add video.upload to repair a Direct Post rejection.
Official app review guidelines were rechecked 2026-10-09. Genuine sandbox recording and real product/permission evidence remain pending; engineering fixtures do not satisfy that requirement.
