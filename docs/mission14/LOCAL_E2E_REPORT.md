# Complete local E2E
Connect UI → server initiation → synthetic authorization → actual Next callback handler export → mock exchange → synthetic AES256GCM/envelope → disposable PostgreSQL → connected status → accepted B7 mock consent/worker → disconnect/wipe → not connected.

Mission14 actual Next child first evaluates final preflight on nonsecret known blockers, asserts startupPermitted=false and SANDBOX_STARTUP_BLOCKED, then explicitly initializes NODE_ENV=test/LOCAL_TEST_POSTGRES mock fixtures. UI E2E asserts reported livePreflight=BLOCKED/liveStartupPermitted=false alongside provider candidates/poolMax1/externalUNKNOWN/readinessNO/realNetwork0. No live adapter/bootstrap permission inferred from this.

React/JSDOM UI calls actual Next exports over local IPC, not a public server, ordinary live browser/Firebase sign-in or deployed provider TLS. Real disposable PG18.4 pool1 proves software state/ownership/crypto persistence behavior only. Accepted B7 bytes/production code unchanged. All required missing config/invalid state/replay/wrong user/key/DB/duplicate/disconnect/worker/Production-mixing negatives covered by regressions and new45 tests. Synthetic tokens/cookies/media only, no real TikTok requests/uploads/review footage.

Exact passing line/counts/commands/log hashes appear in TEST_EVIDENCE.json. Local fixture DDL/DML executed; cloud/Production DB0. Private pinned Docker no published ports/credential mounts/persistent volumes, owned containers/networks0 after cleanup. Real readiness remainsNO and billingUNKNOWN.
