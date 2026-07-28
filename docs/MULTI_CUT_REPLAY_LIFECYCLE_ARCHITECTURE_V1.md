# Multi-cut Replay Lifecycle Architecture V1

> Status: Accepted
>
> Decision scope: Multi-cut request admission replay lifecycle
>
> Persistence authority: PostgreSQL

## 1. Purpose

- Multi-cut request admissionのatomic reservationからterminal transition、authoritative recoveryまでを閉じる。
- 既存の`MultiCutReplayResolutionCapability`を維持し、同一Replay capability family内の最小port構成を確定する。
- Replay判定、Workflow Result、Result Reference、Artifactの所有境界を分離する。
- TypeScript、SQL、migration、Store adapter、Composition、Route、Workflow Runtimeはこの文書では実装しない。

## 2. Existing Architecture

- `MultiCutRequestAdmissionInput`はidempotency keyとcanonical fingerprint inputを保持する。
- Reference Admission Runtimeはprivate deterministic fingerprint projectionを所有する。
- `MultiCutReplayResolutionCapability`はDIされ、`new`、`replay`、`duplicate-in-flight`、`semantic-conflict`、`unavailable`を返す。
- Production durable truthはPostgreSQLの単一relational transaction domainに置く。
- PostgreSQL Foundationはtransaction、UNIQUE、conditional mutation、CAS、row lock、lease fencing、database-authoritative time、commit-unknown lookupを要求する。
- Final Result、protected Result Reference、Outboxは既存Workflow durable domainが所有する。
- Multi-cut Replay専用のschema、adapter、compositionは未実装である。

## 3. Problem Statement

- Resolutionだけではreservation後のcompletion、failure、release、lease renewal、stale takeover、commit-unknown recoveryを表現できない。
- `new`をread結果として扱うと、同時requestが複数とも処理を開始できる。
- processing recordにleaseとfencingがなければ、crash後のrecordが永久に`duplicate-in-flight`になる。
- completed replayが重いWorkflow Resultを直接返すと、ReplayとResult ownershipが混同される。
- Route、Provider、Workflow Entry Runtime、Admission RuntimeへStore mutation責務を移してはならない。

## 4. Decision Summary

- Candidate **CASE B**を採用する。
- ResolutionとLifecycle操作を、同一Multi-cut Replay capability family内の別portへ分離する。
- familyは次の3 portに限定する。
  1. Resolution / Reservation Port
  2. Lifecycle Port
  3. Recovery Port
- Completion、release、renewal、stale takeoverを操作ごとの独立Architecture Layerにはしない。Lifecycle Portの明示methodとしてまとめる。
- Authoritative lookupとreconciliation projectionをRecovery Portにまとめる。Reconciliation worker自体は既存worker layerに属する。
- failedとreleasedを分離する **Failure CASE C** を採用する。
- PostgreSQLを唯一のauthoritative truthとし、cache、queue、filesystem、process-local memoryは正としない。

## 5. Capability Family

### 5.1 Resolution / Reservation Port

- protected scoped keyに対するatomic reservationを所有する。
- fingerprint comparisonと現在stateのclassificationを所有する。
- recordが存在しない場合だけprocessing reservationを作成し、成功時に`new`を返す。
- reservationを作成せずに`new`を返してはならない。

### 5.2 Lifecycle Port

- processing leaseのrenewalを所有する。
- processingからcompleted、failed、releasedへのconditional transitionを所有する。
- expired processingのfenced takeoverを所有する。
- Workflow処理そのもの、retry scheduling、Final Result生成、Artifact取得は所有しない。

### 5.3 Recovery Port

- authoritative record lookupを所有する。
- commit-unknownの状態解決を所有する。
- inconsistentまたは判定不能な状態をreconciliation-requiredへ安全に分類する。
- repair policyやworker schedulingは所有しない。

## 6. Resolution Boundary

`MultiCutReplayResolutionCapability`の正式責務は次である。

- namespace、tenant、operationを含むscopeを検証する。
- protected key identityに対してatomic insert-if-absentを試行する。
- insert成功時、processing claim、lease expiry、fencing revisionを確定して`new`を返す。
- conflict時、同じauthoritative transaction domainからrecordを再読する。
- 同一fingerprintかつcompletedなら`replay`を返す。
- 同一fingerprintかつ有効なprocessingなら`duplicate-in-flight`を返す。
- 異なるfingerprintならstateにかかわらず`semantic-conflict`を返す。
- authoritative判定不能なら`unavailable`を返す。
- Workflow Entry identity、Workflow Result、HTTP responseを生成しない。

## 7. Processing Reservation

- processingは「処理が存在する」だけでなく、有効なclaimが1 ownerへ割り当てられた状態である。
- reservationはclaim identity、lease expiry、fencing revisionを含む。
- lease時刻はPostgreSQLのdatabase-authoritative timestampから計算する。
- process clock、Route clock、Provider clockをauthorityにしない。
- renewalは長時間処理で必要であり、Lifecycle Portがexpected revisionと現fenceを条件に行う。
- renewal失敗後、旧ownerはcompletion、failure、releaseを行ってはならない。

## 8. Completion Boundary

- completionの呼び出し主体はWorkflow execution orchestrationのpersistence boundaryである。
- Admission Runtime、Route、Provider、Materialization Runtimeはcompletionを直接呼び出さない。
- completion inputは最低限次を含む。
  - replay resolved identity
  - claim identity
  - expected record revision
  - fencing token
  - protected Result Reference identity
  - versioned safe completion metadata
- keyだけによる更新、無条件更新、fencingなし更新は禁止する。
- completionはprocessingからcompletedへの一方向transitionである。
- Result Referenceがauthoritative storeに存在し、scopeとownerが一致する場合だけcompletedへ遷移できる。
- completed transitionとResult Reference linkageは同じconditional transactionで整合させる。
- completed recordはprocessing、failed、releasedへ戻らない。

## 9. Failure and Release Policy

Failure CASE C、すなわち`failed`と`released`の分離を採用する。

- `failed`は処理が開始され、versioned safe failure classificationが確定したterminal recordである。
- `released`はside effect開始前、または安全なcheckpointでclaimを放棄し、同一fingerprintの再reservationを許可できるnon-terminal recordである。
- failedを暗黙にnewへ戻してはならない。
- releasedの再試行はpolicy ownerが許可し、attempt上限と次回eligible条件を満たす場合だけ行う。
- failed resultのreplayはfailure classificationとResult Reference linkageの有無を返すRecovery/Result境界で解決する。raw failureを返さない。
- 異なるfingerprintはfailed、releasedを含む全stateで`semantic-conflict`である。
- stale processingはfailedでもreleasedでもなく、lease expiryを根拠としたtakeover候補である。
- failed/released recordを保持し、監査とoperator diagnosisを可能にする。

## 10. Stale Takeover

- lease expiryだけでrecordを即座に`new`として返してはならない。
- Lifecycle Portがauthoritative time、expected revision、旧fenceを条件にtakeover transitionを行う。
- takeover成功時、新claim identity、新lease expiry、新fencing revision、incremented attemptをatomicに確定する。
- takeover後、旧claimまたは旧fenceによるcompletion、failure、release、renewalを拒否する。
- completed、failed recordをtakeoverしない。
- released recordの再reservationとstale takeoverは別operationとして扱う。
- takeover commit outcomeが不明なら処理を開始せずRecovery Portへ移行する。

## 11. Replay Result Ownership

- Replay Resolutionは「同じ意味の処理が存在するか」を判定する。
- Result Reference Vaultは公開可能なprotected referenceと所有関係を管理する。
- Final Result Storeはimmutable terminal resultを管理する。
- Artifact domainはartifact metadataとbinary/storageを管理する。
- Replay Resolution ResultへFinal Result本体、Artifact、binary、path、URLを埋め込まない。
- completed replayはresolved replay identityとprotected Result Reference linkageを通じて、既存Result resolution boundaryへ委譲する。

## 12. Result Reference Linkage

- Replay recordが保持する最小linkageは既存Result Reference Contractに対応するprotected Result Reference identityである。
- raw public token、HTTP URL、filesystem path、archive path、Artifact locatorを保持しない。
- `workflowExecutionId`や`workflowEntryIdentity`をResult Referenceの代替公開locatorにしない。
- internal correlationが必要な場合もprotected identityとして保持し、Result Reference ownershipを置換しない。
- Result Referenceの発行、resolve、revoke、expiryはResult Reference Vaultが所有する。
- Replay completed transitionはResult Referenceの存在、tenant、operation、owner scopeとの一致を検証する。

## 13. Minimum Logical Record

Production Replay Recordの論理schemaは次を最小とする。

| Field | Required | Meaning |
|---|---:|---|
| recordVersion | yes | logical record schema version |
| namespace | yes | operation family isolation |
| tenantScope | yes | tenant-isolated uniqueness scope |
| operationScope | yes | endpoint/operation identity |
| protectedKeyIdentity | yes | versioned protected idempotency key identity |
| protectedFingerprintIdentity | yes | versioned protected semantic fingerprint |
| state | yes | processing/completed/failed/released |
| revision | yes | expected-revision CAS |
| attempt | yes | reservation/takeover generation |
| claimIdentity | processing only | current owner identity |
| fencingRevision | processing only | stale owner rejection |
| leaseExpiresAt | processing only | database-authoritative lease expiry |
| createdAt | yes | database-authoritative creation time |
| updatedAt | yes | database-authoritative mutation time |
| completedAt | completed only | terminal completion time |
| failedAt | failed only | terminal failure time |
| releasedAt | released only | safe release time |
| resultReferenceIdentity | completed; optional for terminal failure | protected linkage |
| failureClassification | failed only | versioned safe classification |
| releaseClassification | released only | versioned safe reason |

- physical UUID、column名、index名、SQL typeはこのADRの範囲外である。
- raw request、raw exception、credential、Artifact pathを保存しない。

## 14. Identity Protection

- raw idempotency keyとraw request fingerprintをdurable storageへ保存しない。
- equality lookupにはdomain-separated、versioned keyed digestを使用する。
- digest inputはnamespace、tenant、operation、identity kindを含めてdomain separationする。
- digest algorithm/versionとkey versionをrecordまたはschema metadataで識別可能にする。
- rotation中は明示versionでlookupし、暗黙fallbackや全version比較を行わない。
- observabilityにはdigest、raw key、raw fingerprintを出さず、safe classificationとopaque audit identityだけを出す。
- HMAC key custody、rotation execution、KMS productは別Security implementation concernである。

## 15. Namespace and Tenant Scope

unique reservation scopeは最低限次のtupleである。

1. replay namespace
2. tenant protected identity
3. operation/endpoint identity
4. protected idempotency key identity

- authenticated principalはauthorization/audit scopeとして保持できるが、同一tenant内の正式unique scopeへ無条件に含めない。principal rotationがreplayを破壊するためである。
- operation scopeにはMulti-cut request admissionのversioned operation identityを使用する。
- 異なるtenant、namespace、operation間でkeyまたはfingerprintを比較しない。
- cross-tenant conflictの存在を外部へ示さない。

## 16. Atomicity Model

- reservationはPostgreSQL transaction内のinsert-if-absentとUNIQUE constraintで実施する。
- UNIQUE conflict後はauthoritative recordを読み、fingerprintとstateを比較する。
- read後の非atomic insertは禁止する。
- completion、failure、release、renewal、takeoverはexpected revisionとfencing predicateを持つconditional updateである。
- terminal transitionはpermitted prior stateをSQL predicateまたは同等のStore invariantで強制する。
- Result Reference linkageはreferential integrityとscope validationを満たす。
- external Workflow execution、Provider I/O、Artifact I/Oをtransaction内で実行しない。
- cache、queueは最適化またはdeliveryに限定し、classification authorityにしない。

## 17. Commit-unknown Policy

- reservation commit outcomeが不明なら`new`を返さず、処理を開始しない。
- completion commit outcomeが不明ならcompletedともfailedとも推測しない。
- blind insert retry、blind completion retry、process-local記憶による判定は禁止する。
- Recovery Portが同じprotected scopeとidentityでauthoritative lookupする。
- lookup結果が完全なrecordならそのstateへ解決する。
- record不存在をauthoritativeに確認できた場合だけnot-committedへ解決できる。
- partial/inconsistent state、schema mismatch、接続不能はreconciliation-requiredまたは`unavailable`とする。
- automatic retryは同一identity、expected revision、fenceを維持し、外部side effectを再実行しない場合に限定する。

## 18. Retention and Expiry

- processing lease expiryはownership expiryであり、record retention expiryではない。
- completed replay retentionはidempotency/replay policyで決定し、lease durationと分離する。
- failed retentionはterminal diagnosisとfailure replay policyを満たす。
- released retentionはretry上限、semantic conflict、audit evidenceを保つ期間とする。
- audit retentionはSecurity/Operations policyが所有する。
- Result Reference retentionはResult Reference Vaultが所有し、Replay record retentionから独立する。
- completed recordをlease expiryで削除しない。
- retention workerはclaim/fencing付きで削除またはtombstone化し、active processingを削除しない。
- 具体的durationはimplementation policyとして後続Contractで明示する。

## 19. Required Port Contracts

### 19.1 Resolution / Reservation Port

- Existing name: `MultiCutReplayResolutionCapability`
- Input: version、scope、protected replay identity、reservation request metadata
- Output: new＋claim、replay＋identity/linkage、duplicate-in-flight、semantic-conflict、unavailable
- Failure: invalid、unsupported-version、corrupted、commit-unknown/unavailable
- Owner: Multi-cut Replay capability family
- Caller: Admission orchestration

### 19.2 Lifecycle Port

- Conceptual name: `MultiCutReplayLifecycleCapability`
- Methods: renew、complete、fail、release、takeover
- Input: replay identity、claim、expected revision、fence、operation-specific safe metadata
- Output: updated、terminal-preserved、stale-revision、stale-fence、conflict、unavailable、unknown
- Owner: Multi-cut Replay capability family
- Caller: Workflow execution persistence orchestration; stale takeoverはauthorized recovery orchestration

### 19.3 Recovery Port

- Conceptual name: `MultiCutReplayRecoveryCapability`
- Methods: authoritative lookup、resolve unknown、project reconciliation request
- Input: protected scope＋replay identity、optional expected evidence
- Output: found state、not-found、corrupted、reconciliation-required、unavailable
- Owner: Multi-cut Replay capability family
- Caller: Admission recovery path、Workflow completion recovery path、Reconciliation worker

- Completion、Release、Lookupを個別Capabilityへ分割するのは、異なるimplementation authorityが必要になるまで行わない。

## 20. Call Ownership

| Operation | Caller | Must not call directly |
|---|---|---|
| resolve/reserve | Admission orchestration | Route, Provider, Workflow Entry Runtime |
| renew | Workflow execution persistence orchestration | Route, Provider |
| complete | Workflow completion persistence orchestration | Admission Runtime, Route, Provider |
| fail/release | Workflow execution persistence orchestration | Route, Provider |
| stale takeover | authorized recovery orchestration | ordinary Route request |
| authoritative lookup | Admission/recovery orchestration | UI, Provider |
| reconcile | Reconciliation worker | Route, Admission Runtime |
| retention | Cleanup/retention worker | Route, Provider |

- Materialization completionはReplay record completionのownerではない。Workflow全体のterminal Result Referenceが確定した境界がcompleteする。

## 21. Transaction Ownership

- 各port operationはReplay Production Adapter内部でtransaction boundaryを所有する。
- reservation transactionはResolution Port adapterが所有する。
- renew、fail、release、takeover transactionはLifecycle Port adapterが所有する。
- completion transactionはWorkflow completion persistence commandが所有し、Result Referenceのauthoritative existence/scopeとReplay transitionを一つのtransaction domainで整合させる。
- authoritative lookupはRecovery Port adapterのread-only transaction/sessionが所有する。
- reconciliation mutationはReconciliation workerが呼ぶRecovery Port operation自身がtransactionを所有する。
- 上位callerはconnection、SQL、row lock、複数Storeの手動transactionを組み立てない。
- capability間の分散transactionは導入しない。

## 22. Required Invariants

1. 同一scope＋同一key＋同一fingerprintでcompletedなら`replay`。
2. 同一scope＋同一key＋同一fingerprintで有効なprocessingなら`duplicate-in-flight`。
3. 同一scope＋同一key＋異なるfingerprintなら`semantic-conflict`。
4. record不存在時のみatomic reservationが成功し、`new`。
5. stale takeover後、旧claimのcompletionを拒否する。
6. completed stateはprocessingへ戻らない。
7. Result Referenceはcompleted transitionと整合して確定する。
8. commit outcome不明時に推測classificationを返さない。
9. 永続依存がauthoritative判定不能なら`unavailable`。
10. 異なるtenant／namespace間でidentity比較しない。
11. failedは暗黙にreleasedまたはnewへ変換しない。
12. released再試行は新claimと新fenceをatomicに取得する。
13. raw key、raw fingerprint、raw Result tokenをdurable recordへ保存しない。

## 23. Candidate Comparison

### CASE A: Resolution Capabilityが全Lifecycleを所有

- Reject。
- Admission向けresolve APIがcompletion、failure、renewal、recoveryまで肥大化する。
- caller ownershipとfailure semanticsが曖昧になる。

### CASE B: 同一Replay family内の別port

- Adopt。
- 一つのdurable aggregateとtransaction authorityを保ちながら、call timingと責務を分離できる。
- 既存Store architectureのreserve → external work → outcome transactionと整合する。

### CASE C: Workflow Entry Contractへcompletionを移動

- Reject。
- Workflow Entry RuntimeへReplay Store責務とPostgreSQL lifecycleを侵入させる。

### CASE D: Providerへcompletionを移動

- Reject。
- ProviderはReplay authorityでもWorkflow terminal ownerでもない。

### CASE E: RouteがReplay Storeを直接操作

- Reject。
- HTTP lifecycleとdurable transaction ownershipが結合し、retry/timeoutで不整合を生む。

### CASE F: Workflow Result StoreへReplay recordを統合

- Reject。
- processing reservationはFinal Result作成前に必要であり、Result Storeのterminal ownershipとstate modelが異なる。
- 同じPostgreSQL transaction domainへco-locateするが、logical recordとportは分離する。

## 24. Consequences

- Multi-cut Replay専用schema、migration、PostgreSQL adapter、compositionが後続Foundationとして必要になる。
- Lifecycle PortとRecovery PortのContractがResolution Contractに続いて必要になる。
- Existing Admission Runtimeはresolve/reserve以外へ拡張しない。
- Workflow execution persistence orchestrationにLifecycle Portの明示DIが必要になるが、Workflow Entry Runtime自体は変更しない。
- failed/released、lease/fencing、Result Reference linkageをadapter独自policyにできなくなる。
- cacheやprocess-local fixtureをProduction fallbackとして使用できない。

## 25. Non-goals

- SQL、table、index、migration versionの決定。
- concrete PostgreSQL statement catalogの実装。
- lease duration、retry limit、retention durationの数値決定。
- managed PostgreSQL provider、KMS、queue、cache製品の選定。
- Workflow Result、Artifact、HTTP responseの再設計。
- Route、Provider、Workflow Entry、Admission Runtimeの実装変更。

## 26. Implementation Sequence

1. Replay Lifecycle/Recovery Contract Foundation
2. logical record validation and contract tests
3. PostgreSQL schema/migration decision and migration
4. PostgreSQL Replay adapter
5. atomic reservation/concurrency tests
6. lifecycle、stale takeover、commit-unknown tests
7. Production composition
8. Workflow completion persistence wiring
9. reconciliation/retention wiring
10. Route integrationは全Production readiness gate通過後

## 27. Validation Gates

- Capability ownershipに循環依存がない。
- Admission RuntimeはResolution Portだけを利用する。
- Provider、Workflow Entry Runtime、RouteはStoreを所有しない。
- PostgreSQLが唯一のauthoritative truthである。
- reservationからcompleted/failed/releasedまでconditional transitionで閉じる。
- stale takeoverはrevision、claim、fenceで旧ownerを拒否する。
- commit-unknownはauthoritative lookupへ移行する。
- Replay、Result Reference、Final Result、Artifact ownershipが分離される。
- raw key、raw fingerprint、raw Result tokenを保存しない。
- Production launchはschema、adapter、composition、real-engine concurrency evidence完成まで禁止する。

## 28. Stop Conditions

- Result Reference linkageを既存Vaultと同じtransaction domainで検証できない。
- stale takeoverをexpected revisionとfencingで保護できない。
- commit-unknownをauthoritative lookupで解決できない。
- PostgreSQL以外のdurable truthが必要になる。
- Route、Provider、Workflow Entry RuntimeへStore responsibilityを移す必要が生じる。
- Replay capability family外の新Architecture Layerが必要になる。
- raw keyまたはraw fingerprint保存が必要になる。
