# Content Posting API readiness — Mission07
LOCAL_CONTRACT_READY=YES; LIVE_READY=NO; FIRST_FUTURE_STAGE=CREATOR_INFO_ONLY. Real API/init/transfer/publication=0. Pinned accepted B7 checkpoint7f16aa12c75f7f20a50b88c50b4e7e5b13f11196,40 files verified; no engine/artifact replacement.

| Boundary | Current evidence | Live gap |
|---|---|---|
| Creator | Server-owned current token,sanitized revision/privacy/permissions/max duration | Real scope/eligibility/response unknown |
| Privacy/consent | Settings/media hash+size+source/Creator revision,preview/music/disclosure checks | Genuine dynamic UI/manual privacy/rights controls not deployed+qualified |
| Replay | Durable one-use grant UID/session/app/environment/openID/generation/expiry,atomic claim before init | Schema/migration/runtime authority missing |
| Init | Fixed video/init POST,video.publish,one attempt,publishID persisted | Side effect not authorized; ambiguity never replayed |
| FILE_UPLOAD | Exact owned source bytes,HTTPS destination+expiry,no token/cookie transfer | Real device preview/source wiring unqualified; PULL_FROM_URL deferred |
| Chunks | Pinned B2 validator5MiB–64MiB normal,small-file whole,floor count1–1000,tail merged into final up to128MiB | Official docs label MB; accepted implementation binary constants,real acceptance unproved |
| Transfer | Sequential index/range/length/MIME,206 intermediate/201 final,no retry after failure | Region-host/server compatibility needs approved live receipt |
| Status | One explicit observation,persisted immutable publishID after restart,owner/current generation | No polling scheduler; expiry/disconnect blocks without approved reauthorization |
| Errors/rate limits | Fixed redacted errors,bounded timeout/body,429 RATE_LIMITED,retry0 | No guaranteed recovery; explicit observation gate |
| Cancellation | Abort current transport,consumed grant blocks redispatch | Abort does not prove provider rollback or delete |
| Audit/state | SQL grants separate provider UNKNOWN/PROCESSING/PUBLISHED/FAILED | MOCK_PUBLISHED/MOCK_HTTP_ONLY test vocabulary cannot prove genuine production result |

video.publish=DirectPost;video.upload=Inbox/draft;FILE_UPLOAD=transfer. No video.upload merely for FILE_UPLOAD. Refresh returns REAUTH_REQUIRED; public native routes unavailable. Genuine UI must show actual Creator nickname/settings and safe statuses; mock output vocabulary needs explicit real-release review.
Mission07 adds pinned transfer boundary tests: small file,trailing bytes,invalid layout,failure without retry. All injected calls synthetic; no actualvideo transfer. Existing tests cover consent/ownership/replay/generation/transfer/status/no-reinit.
FutureG3 only one approved Creator query after approved OAuth/schema/key/deployment; bounded permissions/privacy/duration thenSTOP. G4 init remote side effect; G5 final bytes may really publish evenSELF_ONLY; G6 existing-ID observation. Eachdistinctapproval. Sandbox cannot provide public-video posting; app review/DirectPost audit separate.
References: [DirectPost](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post),[transfer](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide),[sharing UX](https://developers.tiktok.com/docs/en/content-sharing-guidelines). Local tests do not certify platform compliance.
