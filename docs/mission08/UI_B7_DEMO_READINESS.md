# Mission 08: UI, accepted B7 and genuine-demo readiness

Actual UI: app/settings/connections/page.tsx -> TikTokConnectionPanel -> existing TikTokConnectionCard. Existing black/cyan/rounded border styles reused. Added fixed permission/reauthorization/consent/disabled-production guidance. No unrelated page redesign or dependency.

Default page/API producer remains UNAVAILABLE, all real Connect/Disconnect/Publish actions disabled. Explicit branded LOCAL_TEST producer supports NOT_CONNECTED, CONNECTING, CONNECTED, REAUTH_REQUIRED, ERROR, DISCONNECTING and UNAVAILABLE plus disconnect confirmation. Mock section visibly says synthetic local testing, no actual connection/post. Only authenticated server persisted-connection DTO is projected; query parameters cannot set CONNECTED. A generic connection account label is not genuine TikTok profile retrieval. Permission notice is guidance, not proof of scope grant. Callback errors remain bounded fixed JSON; no provider error description rendered.

| Scene | Actual current source / test capability | Genuine recording gap / dependency |
|---|---|---|
| 1 Website introduction | Existing website and legal pages build; no redesign | Current canonical deployment/browser observation and genuine recording not performed. |
| 2 Connect interface | Existing settings/card, disabled default actions; explicit mock interactive panel; new permissions notice | Approved real client producer, bootstrap and deployment missing. |
| 3 Login Kit authorization | Canonical URL, state issuance, route composition and synthetic exchange verified | Real normal-browser Sandbox authorization, saved client/scopes, cookie behavior and approval missing. |
| 4 Connected account | Disposable DB callback commits encrypted account then safe DTO; UI reads persisted evidence | Real owned account connection/profile not observed; fixture account label not genuine evidence. |
| 5 Video selection | Existing generic application device video/workspace preview; B7 owned synthetic device bytes checked | Integrated TikTok-specific real device selection/preview/source ownership wiring and rights qualification missing. |
| 6 Publishing settings | Accepted B7 sanitizes Creator Info, privacy choices, duration and disclosures; deterministic synthetic tests | No accepted reusable React publishing-settings component exists in this checkpoint; real Creator Info and approved UI/server producer missing. No fabricated dynamic options added. |
| 7 Explicit consent | Existing B7 consent contracts: exact owner/account/media/options/current Creator revision + one-use durable grant | Genuine per-post confirmation screen/rights/policy and deployment wiring missing. Fixed notice grants no consent. |
| 8 Posting/status | Existing packaged B7 mock sequence/init/ranges/observation/reconciliation tested | No real posting/status UI activation; separate private-capability/init/transfer/status approvals required. No public Sandbox posting promise. |

Developer Review readiness is PARTIAL. No video generated/uploaded, no fake approval/success screen, no review submission. Mission 07 eight-scene recording plan remains the accepted genuine-recording plan; this table updates source readiness, not deployed evidence.

B7 preserved: artifact checkpoint 7f16aa12c75f7f20a50b88c50b4e7e5b13f11196; artifact verification in prepareLocalRehearsal validates pinned files. Existing FirebasePublisherBridge reuses acceptedPublisherB7 and service custody. Creator query, privacy/duration validation, owner/source checks, consent TTL/one-use, init grant claim, FILE_UPLOAD ranges, upload-host and credential omission, bounded status and duplicate/restart prevention are tested with mocks.

video.publish is Direct Post scope; video.upload is Inbox/draft scope; FILE_UPLOAD is transfer mechanism and adds no OAuth scope. No video.upload added. A verified connection is not permission to post. Unknown processing is not success. No automatic init/upload retry. First future separately approved live API stage: CREATOR_INFO_ONLY. Publisher endpoints and real-media UI/server command wiring were deliberately not activated; no separately approved native B7 stage authorizers exist here.
