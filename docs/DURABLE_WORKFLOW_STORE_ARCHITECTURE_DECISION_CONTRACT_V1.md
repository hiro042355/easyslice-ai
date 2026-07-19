# Durable Workflow Store Architecture Decision Contract V1

Status: Accepted architecture decision and implementation contract

Decision scope: Production Durable Workflow Store Adapter Foundation

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose
- Durable Store Adapter実装前にtransaction domain、Store配置、outbox atomicityを固定する。
- claim／lease、migration、clock、region ownershipをProduction Runtime Interfaceへ接続可能にする。
- ADRとしてV1 architectureを選択し、Contractとしてinvariant、owner、failure semanticsを拘束する。
- Reference Foundationのsemantic contractを維持する。
- 具体DB、queue、cache、KMS、auth製品は選定しない。
- 未決定事項をimplementation-blocking TBDとdeferred TBDへ分類する。
- accountable ownerはData Platform Architectureである。

## 2. Current Runtime Interface
- `ProductionWorkflowRuntime`はCore、Stores、Providers、Security、Observability、Lifecycleのbundleである。
- `WorkflowTransactionManager.runInTransaction()`はopaque contextをcallbackへ渡す。
- Store bundleは18のnamed Storeをreadonlyで公開する。
- Store Resultはcreated、found、updated、conflict、not-found、expired、deleted、corrupted、unavailableを区別する。
- `WorkflowRecordRevision`と`WorkflowExpectedRevision`はnamed structural typeである。
- `WorkflowLease`はfencing revisionと`providerSubmitPermitted: false`を持つ。
- Reference transaction managerはcontract-onlyでありdurableではない。

## 3. Current Store Gap
- interfaceとReference test adapterは存在するがdurable concrete adapterはない。
- transaction product、connection lifecycle、schema、migration runnerは未選定である。
- Store間atomicity、outbox delivery、database clockの実装証跡はない。
- multi-process claim、lease、CAS、commit unknownのintegration evidenceはない。
- encrypted Restricted Input placementとkey ownerは未選定である。
- multi-region writer、backup、restore、DR目標は未決定である。
- Production connectionとlaunchは引き続き禁止する。

## 4. Decision Scope
- Primary durable transaction domainとStore co-location policy。
- Final Result、Result Reference、Outbox、Idempotencyのatomicity。
- Claim／Lease persistence、fencing、clock、expiry semantics。
- schema／record version、migration、rolling deployment、backfill。
- Restricted Input、Audit、Auth／CSRF、Billing、Asset metadata配置。
- tenant／region partition、single-writer、replication、failover。
- Adapter implementation order、contract testing、failure injection。
- readiness gateとstop condition。

## 5. Non-goals
- 具体的なrelational engine、queue、cache、KMSを選定しない。
- schema DDL、migration file、Store adapter、workerを実装しない。
- 数値TTL、lease、retention、RPO、RTO、capacityを推測しない。
- Provider、Auth、Billing、Asset productsを決めない。
- active-active multi-regionを採用しない。
- Event Sourcingへ既存state graphを全面移行しない。
- Reference StoreをProduction fallbackにしない。

## 6. Decision Drivers
- terminal immutabilityとResult／Reference一貫性を最優先する。
- Provider acceptance unknownでblind submitを防ぐ。
- multi-instanceが同じdurable state graphを共有する。
- business stateとoutboxをatomic commitする。
- create-if-absent、CAS、claim、idempotencyを明確に表現できる。
- rolling migrationとfail-closed readinessを運用可能にする。
- concrete vendorからRuntime Interfaceを独立させる。
- security、region、recovery、testabilityを同等の判断軸とする。

## 7. Required Invariants
- terminal Resultはimmutableである。
- Final ResultとResult Referenceの不整合状態を外部へ公開しない。
- same idempotency identityの重複side effectを防止する。
- same identity/different fingerprintはconflictである。
- Provider acceptance unknownでは再submitしない。
- lease expiryだけでProvider submitを再実行しない。
- external Provider I/Oをdatabase transactionへ含めない。
- Result公開はdurable commit後だけである。
- Reference possessionだけで認可しない。
- raw secret／contentをindex、audit、outboxへ保存しない。
- multi-instanceは同じstate graphを共有する。
- migration不整合時はfail closedする。

## 8. Candidate Architectures
- A: Single relational transaction domain。
- B: Relational primary plus distributed cache。
- C: Relational primary plus queue。
- D: Split durable databases by domain。
- E: Event-sourced core。
- F: Serverless managed key/value/document store。
- 比較軸はatomicity、complexity、operations、migration、recovery、multi-region、lock-in、testing、observability、security、cost、failure surfaceである。
- candidate評価は製品ではなくsemanticsを対象とする。

## 9. Single Relational Transaction Domain
- Workflow Stores、Idempotency、Jobs、Final Result、Result Reference、Outboxを一つのtransaction domainへ置く。
- local ACID transactionで主要invariantを表現しやすい。
- unique constraint、row revision、conditional update、claim queryを利用可能なsemanticsとして要求する。
- operational topologyとschema migrationを一つに集約できる。
- scale、region、large payload、domain ownershipの集中がtrade-offである。
- Auth、Billing、Asset binary、Credential secretまで同居させる必要はない。
- V1 coreのprimary candidateである。

## 10. Relational Plus Cache
- Cacheはread optimization、rate limit、ephemeral coordinationに限定する。
- durable truth、idempotency truth、lease fencing、terminal Resultを所有しない。
- cache miss／eviction／stale valueでcorrectnessが変化してはならない。
- invalidationはrecord revisionを使いbest-effortで行う。
- cache outageはperformance degradationでありdata lossではない。
- Production V1でoptional componentとする。
- concrete cache productはTBDである。

## 11. Relational Plus Queue
- Queueはdelivery mechanismでありsource of truthではない。
- business stateとOutbox recordをprimary transactionで同時commitする。
- dispatcherがOutboxからqueueへat-least-once deliveryする。
- workerはqueue messageだけで判断せずJob／Outbox／claim Storeを確認する。
- queue duplicate、delay、loss claimはdurable truthからrepairする。
- V1 recommended delivery architectureである。
- concrete queue productはTBDである。

## 12. Multi-database Split
- Auth、Workflow、Billing、Asset metadata等のdomain分離にはsecurity/ownership利点がある。
- cross-database atomicityを前提にしない。
- Outbox、Inbox、saga、reconciliationでdomain連携する。
- Workflow core内部を初期から細かくsplitするとResult/reference/idempotency atomicityが複雑化する。
- V1ではWorkflow coreをsplitしない。
- Auth、Billing、binary asset、Credentialはseparate domainを選択する。
- 将来のsplit triggerをsection 19で固定する。

## 13. Event-sourced Core
- 完全なhistory、replay、auditには利点がある。
- projection、schema evolution、operator model、idempotencyの複雑性が大きい。
- 現在のStore Interfaceはstate/CAS orientedであり全面置換を要求する。
- V1 invariantにfull event sourcingは必要ない。
- JournalとOutboxはappend semanticsを使うがevent-sourced coreとは呼ばない。
- V1 primary architectureとしてrejectする。
- 将来の高いtemporal reconstruction要求で再検討可能である。

## 14. Serverless Managed Store
- managed scalingと運用軽減は利点である。
- multi-record transaction、conditional claim、index、region semanticsの製品差が大きい。
- Runtime Interfaceを製品制約へ曲げることは禁止する。
- 必須invariantを満たすadapterなら候補から排除しない。
- serverlessという名称だけでdurable/atomicと判断しない。
- V1 decisionはsemantics-firstでありproduct形態はTBDである。
- conformance evidenceなしでは選定できない。

## 15. Candidate Comparison
| Candidate | Atomicity | Implementation | Operations | Migration | Recovery | Multi-region | Failure surface | V1 result |
|---|---|---|---|---|---|---|---|---|
| Single relational domain | Strong core | Moderate | Moderate | Centralized | Direct reconciliation | Home-region friendly | Bounded | Selected core |
| Relational + cache | Primary unchanged | Additional | Additional | Cache independent | Rebuildable | Read assistance | Cache staleness | Optional |
| Relational + queue | Outbox atomic | Moderate | Queue/dispatcher | Event versioning | Redelivery | Regional delivery | Duplicate/delay | Selected delivery |
| Split databases | Saga only | High | High | Per domain | Complex | Flexible | Partial commit | External domains only |
| Event-sourced core | Append strong | High | High | Event evolution | Replay | Complex | Projection lag | Rejected V1 |
| Serverless managed | Product-dependent | Variable | Lower/variable | Product-dependent | Product-dependent | Product-dependent | Constraint drift | Eligible after proof |

## 16. V1 Decision
- Primary relational transaction domainをWorkflow durable truthとして選択する。
- Transactional Outboxを同一domain内でbusiness stateとatomic commitする。
- Separate queue deliveryをOutbox dispatcherのtransportとして採用する。
- Optional cacheはperformance/ephemeral用途だけに限定する。
- Queueはsource of truthではない。
- Cacheはdurabilityを所有しない。
- WorkerはOutbox／Job Storeからdurable claimを取得する。
- concrete productsはimplementation-blocking TBDとして別ADRで決める。

## 17. Consequences
- Final Result、Result Reference、Outboxを一つのtransactionでcommitできる。
- Idempotency reservationと関連business mutationを同じtransaction ownerへ置ける。
- Workflow core Store migrationとcapacity責任がData Platformへ集中する。
- large restricted payloadとbinary assetは別domain連携が必要になる。
- Queue/cache outageからprimary truthでrecoveryできる。
- cross-region writeはhome-region routingが必要になる。
- concrete adapterはrelational transaction semanticsを証明しなければならない。
- Product選定前にcontract harnessを実装できる。

## 18. Rejected Alternatives
- Queue-only truthはatomic query、replay、Result ownershipを損なうためrejectする。
- Cache-based lockをprimary fencingに使う案はeviction/partitionでcorrectnessを失うためrejectする。
- Final Result後の非同期Reference発行は公開gateを複雑化するためV1ではrejectする。
- Workflow coreの初期multi-database splitはpartial commit surfaceが増えるためrejectする。
- Full event sourcingはV1要件に対し過剰である。
- Reference in-memory StoreのProduction利用はdurabilityを満たさない。
- active-active writesはconflict ownershipが未定義なためrejectする。

## 19. Revisit Conditions
- Primary domainのmeasured capacityがapproved targetを満たさない。
- residencyによりworkflow aggregateを単一domainへ置けない。
- asset metadataとのatomic requirementが新たに承認される。
- full temporal replayがcompliance上必須になる。
- provider/job volumeがclaim/index設計の分割を要求する。
- multi-region availability requirementがsingle-writer RTOを満たせない。
- database productが必須semanticsを証明できない。
- revisitはRuntime Interface invariantを緩めてはならない。

## 20. Store Ownership
- Data Platformはphysical Store、transaction、schema、migration runnerを所有する。
- Workflow Platformはrecord semanticsとtransition invariantを所有する。
- Provider/Asset/Security/Billing ownersはdomain-specific recordsを所有する。
- SREはavailability、backup、restore、capacity、incidentを所有する。
- Data Governanceはretention、deletion、legal holdを承認する。
- Region ownerはResidency Architectureである。
- owner未割当Storeはadapter implementationを開始できない。

## 21. Store Co-location
- Workflow coreのAccepted、Poll、Resume、Idempotency、Job、Final、Reference、Outboxをprimary domainへco-locateする。
- Resume JournalとAudit safe eventsもV1では同一domainに置けるがretention partitionを分離可能とする。
- Restricted payload binary/ciphertextは別encrypted storageを許可する。
- Auth／CSRF、Billing Ledger、Credential secrets、Asset binaryはseparate domainである。
- Asset metadataはseparate domainを許可しOutboxで連携する。
- co-locationは同一schemaを意味せず同一atomic transaction capabilityを意味する。
- product topologyはTBDである。

### Store Co-location Matrix

| Store | Recommended transaction domain | Must be co-located with | May be separated from | Atomic operations | External I/O relation | Migration owner |
|---|---|---|---|---|---|---|
| Accepted Persistence | Workflow core | acceptance idempotency/outbox | Auth/Billing | createIfAbsent + outbox | before provider I/O | Workflow/Data |
| Poll State | Workflow core | poll idempotency/job handoff | queue/cache | claim/CAS/outbox | lookup outside tx | Upload/Data |
| Resume Record | Workflow core | resume claim/journal outcome | restricted ciphertext | claim/CAS | materialize/submit outside | Resume/Data |
| Resume Journal | Workflow core | Resume Record transition | analytics | append + transition | records safe outcome | Resume/Data |
| Materialization Idempotency | Workflow core | Resume Record | materializer compute | reserve/CAS | before materialization | Materializer/Data |
| Generation Submit Idempotency | Workflow core | Resume/Job/Journal | provider | reserve/outcome CAS | submit outside tx | Generation/Data |
| Generation Poll Idempotency | Workflow core | Generation Job | provider | reserve/claim/CAS | lookup outside tx | Poll/Data |
| Generation Job | Workflow core | generation idempotency/outbox | queue | create/claim/terminal CAS | provider outside tx | Worker/Data |
| Output Ingestion Idempotency | Workflow core | Final workflow stage/outbox | asset binary | reserve/stage CAS | fetch outside tx | Ingestion/Data |
| API Idempotency | Workflow core | command aggregate | Auth session | reserve/result commit | command-specific | API/Data |
| Final Result | Workflow core | Result Reference/Outbox | asset binary | commitIfAbsent atomic group | none in final tx | Workflow/Data |
| Result Reference Vault | Workflow core | Final Result/Outbox | Auth | issue/revoke/CAS | no external I/O | Security/Data |
| Restricted Input Metadata | Workflow core | workflow reference metadata | ciphertext storage | metadata create/delete | encryption outside/adjacent | Privacy/Data |
| Original Input Metadata | Workflow core | restricted ref/acceptance | ciphertext storage | create/delete | no plaintext I/O in tx | Entry/Data |
| Audit | Workflow core safe audit | required domain transition | SIEM/export | append | delivery via outbox | Security/Data |
| Outbox | Workflow core | emitting business mutation | queue | append same tx | queue after commit | Messaging/Data |
| Auth Session | Security domain | CSRF as security policy | Workflow core | session rotation/revoke | projected principal only | Identity |
| CSRF | Security domain | Auth Session | Workflow core | bind/rotate/revoke | request boundary | Security |
| Billing Ledger | Billing domain | billing idempotency | Workflow core | ledger transaction | workflow outbox consumer | Billing |
| Asset Metadata | Asset domain | Asset storage registry | Workflow core | asset commit | ingestion outside workflow tx | Asset |

## 22. Transaction Domain
- Primary domain is one logical ACID transaction boundary for Workflow core。
- physical cluster、schema、table layoutはTBDである。
- transaction contextはStore adapter以外へ持ち出さない。
- cross-domain operationはOutbox/Saga/Reconciliationを使用する。
- distributed transactionはV1 requirementにしない。
- transaction domain failureはsafe unavailable/unknown outcomeへmapする。
- ownerはData Platformである。

## 23. Transaction Manager Ownership
- physical Transaction Manager adapter ownerはData Platformである。
- operation scope、participating Stores、retry permission ownerはWorkflow command ownerである。
- isolation semanticsは両ownerが共同承認する。
- managerはbegin/commit/rollback detailをRuntime Interfaceへ漏らさない。
- transaction context lifetimeをenforceする。
- external I/O禁止をdocument、static test、integration testで守る。
- product selectionはimplementation-blocking TBDである。

## 24. External I/O Boundary
- Provider submit、poll、cancel、asset fetch、queue publish、billing callをtransactionに含めない。
- standard patternはvalidate → reserve transaction → external I/O → outcome transactionである。
- credential resolutionのremote callもlong transaction外で行う。
- Outbox appendはlocal Store writeでありtransaction参加する。
- queue deliveryはcommit後である。
- timeoutはexternal failure確定ではない。
- unknown outcomeはdurable claim/journalを保持してreconcileする。

## 25. Reservation Transaction
- idempotency identity、fingerprint、aggregate stage、revisionをatomic reserveする。
- same identity/same fingerprintはexisting reservation/resultを返す。
- different fingerprintはconflictをcommit/returnする。
- Provider I/O前にreservation commitがdurableでなければならない。
- reserve commit unknownならI/Oを開始せずlookupする。
- authorizationとdeletion/legal hold preconditionをtransaction時に再確認する。
- outboxはreservation自体のdeliveryが必要な場合だけ含める。

## 26. Outcome Journal Transaction
- external outcome validation後にsafe outcome classをJournalへappendする。
- accepted、rejected、timeout-unknown、lookup-requiredを区別する。
- raw provider response、Reference、Asset ID、secret、raw errorを含めない。
- relevant aggregate revisionとidempotency stateを同時更新する。
- journal conflictはreread/reconciliationである。
- outcome commit unknownはsame identityでlookupする。
- terminal公開はこのstageだけでは行わない。

## 27. Final CAS Transaction
- expected revisionとpermitted transitionを検証する。
- stale responseはconflictとなりunconditional updateしない。
- terminal aggregateはabsorbing stateである。
- Final Result commitはResult Reference／Outboxとatomic groupにする。
- formal Asset metadataは事前にdurable committed referenceでなければならない。
- final commit unknownはResult/Reference/idempotency lookupで解決する。
- durable確認前にterminal DTOを返さない。

## 28. Outbox Atomicity
- Outbox recordはemitting business stateと同一transactionでappendする。
- separate queue publishをtransactionへ含めない。
- dispatcherはpending Outboxをclaimしat-least-once deliveryする。
- delivered markerはfencing付きで更新する。
- queue acknowledgement unknownでもOutbox truthからredeliver可能である。
- consumerはevent identityでdedupeする。
- Outbox write failureはbusiness transactionをcommitさせない。

## 29. Inbox Atomicity
- signature/schema/replay validation成功後にInbox create-if-absentする。
- Inbox durable commit後にwebhook acknowledgementを返す。
- signature失敗payloadはInboxへ保存せずsafe security auditだけを許可する。
- Provider event IDがある場合はprotected identityでdedupeする。
- event IDがないbindingのdedupe strategyはimplementation-blocking TBDである。
- Inbox processingとJob CASは同一または段階的transactionで明示する。
- raw webhook payloadはrestricted policyに従う。

## 30. Final Result Atomicity
- V1は候補Aを選択する。
- Final Result、Result Reference protected index、Outboxをsame transactionでcommitする。
- `FinalResultStore.commitIfAbsent`の成功だけでは外部公開可能とみなさない。
- atomic group全体のcommit成功後にterminal DTOを構築する。
- duplicate finalizationはexisting immutable recordを返す。
- commit unknownはthree-record invariantをlookupする。
- 候補Bのasync issuanceはV1では採用しない。

## 31. Result Reference Atomicity
- `ResultReferenceVault.issueIfAbsent`はFinal Result identityと同一transactionに参加する。
- raw public tokenではなくprotected indexをStore lookupへ使用する。
- token generationはtransaction前に行えても、publicationはcommit後だけである。
- owner、tenant、region、operation、kindをFinal Result ownershipと一致させる。
- mismatchはtransaction conflictである。
- revoke/expire/deleteはrevision/CASとauthorizationを要求する。
- terminal snapshotはimmutable Result revisionへbindする。

## 32. Accepted Persistence
- `createIfAbsent`でacceptance identityをdurableにする。
- accepted kind、operation、binding、restricted/original refs、revision、expiryを保持する。
- raw input本文をbusiness tableへ保存しない。
- acceptance idempotencyと必要なOutboxをsame transactionにする。
- durable commit前にaccepted responseを返さない。
- commit unknown時はidentity lookupする。
- ownerはWorkflow Entry/Data Platformである。

## 33. Poll State
- `create`、`read`、`claim`、`renew`、`commitPollResult`、`markTerminal`、`release` semanticsを維持する。
- itemIndex／assetIndex mappingをexplicitに保持する。
- protected session handleをclient projectionへ出さない。
- claimとnext eligibilityをsame transactionで更新する。
- provider lookupはtransaction外である。
- duplicate/late pollはrevision/CASで収束する。
- terminal overwriteは禁止する。

## 34. Resume Record
- `createIfAbsent`、`read`、`claim`、`compareAndSet`、`markTerminal`を実装対象とする。
- waiting、materialization-reserved、submit-reserved、submit-unknown、job-accepted、terminalを区別する。
- restricted request referenceとbinding versionをpinする。
- claim取得とstage transitionをtransactionで保護する。
- submit-unknownからblind submitへ戻さない。
- terminal workflowをresumeしない。
- ownerはResume Pipelineである。

## 35. Resume Journal
- `append`と`readSafeHistory` semanticsを維持する。
- event identityでduplicate appendを防ぐ。
- attempt、stage、transition、outcome class、safe reason、database timestampを保持する。
- raw request、Asset ID、Provider reference、credentialを保存しない。
- Resume Record transitionとのatomicityをoperationごとに固定する。
- append failure時はstate transitionをcommitしない場合をdefaultとする。
- retentionはdeferred TBDである。

## 36. Materialization Idempotency
- protected identity/fingerprintをprimary domainへreserveする。
- reserve、lookup、commitResult、commitUnknown、markConflict、expireを実装する。
- materialized bodyをrecordへ保存しない。
- materialization external workはreserve commit後に行う。
- unknownはreconciliation-requiredへ移せる。
- expired capabilityはpolicy lookup後にrepairする。
- TTL durationはdeferred TBDである。

## 37. Generation Idempotency
- generation-submit reservationをResume/Job domainとco-locateする。
- Provider I/O前にdurable reserveする。
- accepted job referenceはprotected formでJob作成とoutcome journalに結合する。
- acceptance unknownをretryable submitへ変換しない。
- provider idempotency supportはbinding metadataとしてpinする。
- different fingerprintはconflictである。
- operator repairもsame reservationを使用する。

## 38. Generation Job
- `createIfAbsent`、`read`、poll claim/renew、pending/completed/failed/unknown/reconciliation commitsを実装する。
- cancel/expireもrevision/CASを要求する。
- Provider Job Referenceはprotected storageである。
- `providerSubmitMayRun: false` invariantを永続化する。
- claim、nextPollEligibleAt、statusをatomic updateする。
- terminal Resultをlate poll/webhookが上書きしない。
- ownerはWorker Platform/Data Platformである。

## 39. Generation Poll Idempotency
- generation-submit namespaceから分離する。
- Job revision、poll attempt、provider response classを関連付ける。
- claim transactionとpoll reservationをco-locateする。
- Provider lookupはtransaction外である。
- duplicate API/worker/webhookをcurrent Job truthへ収束させる。
- poll unknownはsubmit unknownと混同しない。
- TTLはdeferred TBDである。

## 40. Output Ingestion Idempotency
- output identity、binding、expected class、stageをprotected formで保持する。
- fetch、inspect、scan、store、register、finalizeを別stageにする。
- asset fetch/store external I/OをWorkflow transactionへ含めない。
- formal Asset referenceのdurable commit後にFinal Resultへ進む。
- partial multi-outputをreconciliation可能にする。
- duplicate storage writeをAsset domain idempotencyで補完する。
- provider URLをOutbox/Auditへ入れない。

## 41. API Idempotency
- start、poll-upload、poll-generation、result、cancelをcommand namespaceで分離する。
- principal/tenant/region/operation scopeをprotected identityへ含める。
- reservationとcommand admission stateをsame transactionにする。
- terminal safe responseをbusiness stateと整合してcommitする。
- raw HTTP body/headerを保存しない。
- unknown commitはsame identity lookupで解決する。
- Result Queryのread-only replayにもsafe dedupe policyを適用する。

## 42. Final Result
- `commitIfAbsent`、`read`、`compareAndSet` semanticsを維持する。
- completed、degraded、partial、failed、cancelledをimmutable terminalとして扱う。
- formal Asset referenceは成功系だけに保持する。
- Result Reference／Outboxとsame transactionでcommitする。
- storage locatorやsigned URLを保持しない。
- deletion/legal hold/region ownershipをrecord metadataへ持つ。
- retention durationはdeferred TBDである。

## 43. Result Reference Vault
- `issueIfAbsent`、`resolve`、`revoke`、`expire`、`delete`を実装する。
- public tokenとprotected indexを分離する。
- Final Result identity、kind、owner、tenant、region、stateを保持する。
- token値をprimary key、Audit、log、Outboxへ出さない。
- resolveはauthorization後に行う。
- issuanceはFinal Result transactionへ参加する。
- revocation raceはrevision/CASで処理する。

## 44. Restricted Input
- V1はencrypted payloadを別encrypted blob/document capabilityへ置くことを許可する。
- Workflow primary domainにはRestricted Input metadataとopaque ciphertext handleだけを置く。
- plaintextをbusiness table、index、Journal、Audit、Outboxへ保存しない。
- envelope encryption metadata、key version、schema、region、lifecycleを保持する。
- metadata creationとworkflow referenceはsame transactionにできる。
- ciphertext writeとの跨域atomicityはstaged reservation/reconciliationで扱う。
- concrete storage/KMSはimplementation-blocking TBDである。

## 45. Original Input
- Original Input metadataはRestricted Input referenceを指す。
- Story、Lyrics、Scene、Prompt本文を複製しない。
- `createIfAbsent`、`read`、`delete` semanticsを維持する。
- owner、operation、region、schema、lifecycleを保持する。
- acceptanceとのmetadata atomicityをprimary domainで確保する。
- plaintext accessはRestricted Store policyを経由する。
- retention/deletionはgovernance policyに従う。

## 46. Audit
- Workflow domainのsafe Audit eventはprimary domainへappend可能とする。
- security/enterprise audit export先はseparate domainでよい。
- required Audit eventはbusiness mutationとsame transaction/outboxで記録する。
- action、outcome、policy version、safe aggregate handle、database timeを保持する。
- raw content、secret、token、provider reference、raw errorを禁止する。
- Audit unavailable policyはrisk別implementation-blocking TBDである。
- ownerはSecurity Audit/Data Governanceである。

## 47. Outbox
- event identity、protected aggregate identity、event type、payload versionを保持する。
- delivery state、attempt、next eligibility、claim、created database timeを保持する。
- dead-letterはterminal data lossではなくmanual repair/reconciliation stateである。
- payloadにStory、Lyrics、Scene、Prompt、Credential、raw token、raw key、secret、raw errorを含めない。
- dispatcherはfencing付きclaimを使う。
- delivered updateのunknown outcomeはqueue dedupe/Outbox rereadで解決する。
- retentionはdeferred TBDである。

## 48. Auth Session
- Auth Sessionはseparate Security transaction domainを選択する。
- Workflow Startとsession rotation/updateをsame transactionにしない。
- request boundaryでauthenticated Principal projectionを確定する。
- Workflow transactionはprojected subject/tenant/region/permissionだけを受ける。
- long-running jobは必要なownership policyをdurable metadataで保持し再認可する。
- Reference Auth StoreをProduction利用しない。
- identity productはTBDである。

## 49. CSRF
- CSRF StoreはAuth Sessionと同じSecurity domainまたは強く整合するsecurity storeに置く。
- Workflow core transactionへ参加しない。
- token digest、session binding、rotation、expiry、revocationをSecurity domainが所有する。
- valid Principal/CSRF結果だけをAPI command boundaryへ投影する。
- raw tokenをWorkflow Storeへ保存しない。
- Auth/CSRF outageはmutation admissionをfail closedする。
- concrete implementationはTBDである。

## 50. Credential Metadata
- Credential secretはWorkflow primary domainへ保存しない。
- provider、scope、tenant class、region、operation、binding、key versionのsafe handle metadataだけを参照可能とする。
- Credential Vaultはseparate Security domainである。
- rotation/revocation eventはOutbox/Inbox型連携を使用する。
- active jobはpinned bindingとresolver policyでcredentialを再解決する。
- secret lifetimeは別Credential Contract ownerである。
- Store productはTBDである。

## 51. Billing
- Billing Ledgerはseparate Billing transaction domainを選択する。
- Workflow stateからbilling Outbox eventを発行する。
- Billing consumerは独立idempotencyでledger mutationする。
- distributed transactionを要求しない。
- pre-generation credit reservationが必要なら別Contractでadmission protocolを定義する。
- pricing/refund modelを本Contractで推測しない。
- unresolved billing outcomeはfinancial reconciliationを要求する。

## 52. Asset Metadata
- Asset metadata/binaryはAsset domainへ分離可能とする。
- Output IngestionはAsset domainでformal Assetをdurable commitする。
- Workflow Final Resultはcommitted formal Asset referencesだけを保持する。
- cross-domain handoffはidempotent event/reference verificationを使う。
- storage locator/signed URLをWorkflow primary domainへ複製しない。
- deletion/legal hold/regionを両domainでreconcileする。
- Asset productはTBDである。

## 53. Claim Model
- claim対象はUpload Poll、Resume、Generation Poll、Reconciliation、Cleanup、Deletion、Outbox deliveryである。
- keyはclaim kindとprotected record identityである。
- ownerはprotected identityでありhostnameをbusiness resultへ保存しない。
- acquireはexpected revisionとterminal checkをatomicに行う。
- claim revision、attempt、heartbeat baselineを保持する。
- duplicate workerはalready-claimed/conflictを受ける。
- claimはProvider acceptance truthではない。

## 54. Lease Model

- leaseはclaim identity、record identity、owner、fencing revision、expiry、attemptを持つ。
- lease expiryはdatabase-authoritative UTCで比較する。
- duration数値はdeferred TBDでinjected policyとする。
- indefinite leaseは禁止する。
- renew/releaseはfencing revisionを検証する。
- process crash後はexpiry/takeover可能だがstage invariantを尊重する。
- `providerSubmitPermitted: false`を維持する。

## 55. Fencing Revision

- lease取得/renew/takeoverでmonotonic fencing revisionを進める。
- mutationはcurrent fenceとaggregate expected revisionを検証する。
- stale ownerはleaseが時間上有効に見えてもcommitできない。
- revisionをclientへ公開しない。
- overflow/corruptionはfail closedする。
- database conditional updateまたは同等semanticsを要求する。
- test harnessはstale fencing raceを必須化する。

## 56. Heartbeat

- heartbeatはlease renewalでありprogress/acceptance truthではない。
- renewalはcurrent owner/fence/terminal stateを確認する。
- heartbeat failureはbounded retry後safe checkpoint/reconciliationへ進む。
- frequency、grace、lease durationはdeferred TBDである。
- database timeをnext expiryに使用する。
- heartbeat diagnosticへtenant/Reference/provider handleを出さない。
- shutdown/drainでnew renewal policyを明示する。

## 57. Stale Claim

- stale判定はdatabase time、lease expiry、fence revision、record statusを使う。
- stale ownerはCAS commitを拒否される。
- abandoned claimを無条件deleteしない。
- Provider I/O前stageならpolicyでsafe retry可能性を評価する。
- I/O中/後stageならlookup/reconciliationを要求する。
- manual releaseはoperator auditとrevisionを必要とする。
- cleanup jobも同じfencing ruleを使用する。

## 58. Job Eligibility

- next eligibilityはdurable database timestampとしてJob/Poll/Outboxに保持する。
- scheduler local clockだけでdue判定しない。
- status、deletion、legal hold、region、claim状態もquery条件に含める。
- batch selectionとclaimをatomicまたはconflict-safeにする。
- late queue messageはcurrent eligibilityを再確認する。
- jitter/backoff数値はdeferred TBDである。
- index migration ownerはData Platformである。

## 59. Provider Submit Protection

- generation-submit idempotency reservationをProvider I/O前にdurable commitする。
- Resume/Job stageはsubmit may-have-occurredを明示する。
- lease expiryだけでsubmitを再実行しない。
- possible acceptanceではProvider Job Lookupを使用する。
- lookup不能/ambiguousならreconciliation-requiredにする。
- operator repairもsame identity/fingerprintを使用する。
- bindingがprovider idempotencyを保証してもlocal reservationを省略しない。

## 60. Database Clock

- V1はdurable state timestampとlease expiryにdatabase-authoritative UTCを選択する。
- createdAt、updatedAt、claim acquired、lease expiry、next eligibilityをtransaction domain clockで生成する。
- application supplied timestampをdurable ordering truthにしない。
- database clock formatはcanonical UTCへprojectする。
- product-specific clock functionはadapter内部へ隔離する。
- clock unavailableはtransaction unavailableである。
- test adapterはinjected authoritative clockを使用する。

## 61. Monotonic Time

- in-process timeout、latency、deadline elapsedにはinjected monotonic clockを使用する。
- monotonic valueをdatabase record間orderingに使用しない。
- process restart/instance間で比較しない。
- wall clock jumpからtimeout計測を分離する。
- Provider client deadlineはtransaction外でmonotonic policyを使用する。
- metrics durationもmonotonic sourceを使う。
- concrete implementationはRuntime Foundation後工程である。

## 62. Expiry

- expiryはaccess capability、claim、job、idempotency、record lifecycleごとに意味を分離する。
- database timeで比較する。
- expiryだけでdata deletionやProvider resubmitを意味させない。
- legal hold/deletion stateを同時評価する。
- expired transitionはrevision/CASを必要とする。
- browser supplied timeを信用しない。
- duration値はpolicy ownerのTBDである。

## 63. TTL

- TTLはautomatic physical deletionとsemantic expiryを混同しない。
- active claim、unknown outcome、dispute、legal hold、reconciliationを尊重する。
- native TTL機能をcorrectness-critical transitionに使わない。
- physical pruning前にtombstone/eligibilityを確認する。
- namespace別durationはdeferred TBDである。
- Store adapterはTTL capabilityなしでもsemantic expiryを実装できる。
- TTL metricsはsafe aggregateだけを使用する。

## 64. Retention

- Store/data class別にretention policyを持つ。
- durationはLegal、Privacy、Support、Billing承認までTBDである。
- Journal、Audit、Outbox、Restricted Input、Resultで異なる。
- active workflow、unknown outcome、dispute、holdはretentionを延長し得る。
- policy versionをrecord metadataまたはgoverned lookupで追跡する。
- retention jobはclaim/fencing/idempotencyを使用する。
- ownerはData Governanceである。

## 65. Deletion

- deletion-pending tombstoneを先にprimary domainへcommitする。
- new claim、Provider I/O、Result deliveryを停止する。
- Restricted、Asset、Reference、indexes、external copiesをstaged deletionする。
- partial deletionはJournal/Outboxからresumeする。
- resurrectionを防ぐtombstone policyを持つ。
- SLAはdeferred TBDである。
- ownerはPrivacy/Data Lifecycleである。

## 66. Legal Hold

- legal holdはdeletionを停止するがexecution/delivery権限を付与しない。
- hold stateはauthoritative policyまたはprimary metadataでtransaction時に確認する。
- hold changeはOutbox/Inboxでdomainへ伝播する。
- deletion/retention workerはholdを再確認する。
- raw legal case detailをWorkflow Storeへ保存しない。
- jurisdiction/integrationはimplementation-blocking TBDである。
- ownerはLegal/Data Governanceである。

## 67. Region

- every workflow aggregateはhome regionを持つ。
- regionはtrusted tenant/principal policyから決定しclient overrideしない。
- Store key/index/claim/queryはhome region scopeを含む。
- Provider binding/Restricted/Asset constraintsと整合する。
- Result Reference routingはhome region metadataを安全に解決する。
- raw region policy detailをpublic DTOへ出さない。
- region selection policyはimplementation-blocking TBDである。

## 68. Residency

- Workflow records、Restricted payload、Asset、backup、Auditのresidencyを個別に評価する。
- cross-region replicationはpolicy approvalを必要とする。
- Provider data transfer termsをbindingでpinする。
- deletion/legal holdはreplica/backupにも適用する。
- residency violation時はnew writes/claimsをfail closedする。
- jurisdictionはTBDである。
- ownerはResidency Architecture/Legalである。

## 69. Tenant Partition

- tenant identityはprotected partition keyまたはprotected index scopeに含める。
- every ownership lookupはtenantとregionを検証する。
- raw tenant valueをlog/metric/index diagnosticへ出さない。
- unique constraintはtenant/region/namespace semanticsを含める。
- noisy tenant isolationとquota連携を可能にする。
- physical partition schemeはcapacity evidence後のTBDである。
- cross-tenant queryはoperator-only audited pathである。

## 70. Multi-region Writes

- V1はworkflowごとのsingle-writer home regionを選択する。
- active-active concurrent writesは採用しない。
- API/workerはhome regionへrouteまたはsafe unavailableを返す。
- cross-region readはauthorized Result Query等に限定しstaleness contractを持つ。
- failoverはwriter lease/epochを明確に移管する。
- split-brain時はnew writesを停止する。
- writer ownership technologyはimplementation-blocking TBDである。

## 71. Replication

- replicationはavailability/read supportでありwrite ownershipを変更しない。
- asynchronous replicaからclaim/CAS/authorization-changing readを行わない。
- Result Queryでreplicaを使う場合はpublished terminal revisionを確認する。
- deletion/hold propagation lagをdelivery authorizationで補完する。
- replication topology/productはTBDである。
- lag metricsはsafe region classで観測する。
- failover前にconsistency evidenceを確認する。

## 72. Failover

- failoverはsingle-writer epochを旧regionから新regionへ移すcontrol operationである。
- automatic/manual policyはRPO/RTO決定後のTBDである。
- old regionのclaims/fencesを無効化する。
- Provider external stateをreconcileする。
- Outbox/queue duplicate deliveryをidempotencyで吸収する。
- unknown commit recordsをwrite再開前に分類する。
- drillとrollback evidenceなしにproduction enableしない。

## 73. Consistency

- command writes、idempotency、claim、terminal、Reference issuanceはstrong transactional consistencyを要求する。
- cache/replicaはcorrectness decisionに使用しない。
- read-your-writeはsame command responseで保証する。
- terminal Result公開はFinal/Reference/Outbox commit確認後である。
- cross-domain Billing/Assetはeventual consistencyとreconciliationを明示する。
- client cached terminal stateをtruthにしない。
- consistency classをStore methodごとにcontract testする。

## 74. Isolation Level

- 全処理へ一律`serializable`を要求しない。
- create-if-absentはunique/conditional insert semanticsを要求する。
- idempotency reserveはidentity/fingerprintのatomic decisionを要求する。
- CASはexpected revision conditional updateを要求する。
- claimはeligible checkとfence allocationをatomicにする。
- terminal/reference/outbox groupはwrite conflictを検出する。
- concrete isolation mappingはadapter ADRのimplementation-blocking TBDである。

## 75. Serialization Conflict

- transaction adapterはserialization/conditional conflictをsafe classificationへmapする。
- retryはexternal I/Oを含まないtop-level transaction callbackだけに許可する。
- retry callbackはdeterministic local mutationでなければならない。
- budget数値はTBDである。
- exhaustionはconflict/unavailableとしてcallerへ返す。
- raw database detailを返さない。
- metricsはstage/status classだけを使う。

## 76. Deadlock

- Store access orderをcommand patternごとに固定する。
- Final Result → Result Reference → Outbox等のlock orderをadapter planで文書化する。
- deadlock victimはretryable transaction failureへsafe mapする。
- external I/Oはlock保持中に行わない。
- retry budget超過はsafe unavailable/conflictである。
- raw query/table nameをAPI/logへ出さない。
- failure injectionでdeadlockを試験する。

## 77. Retryable Transaction Failure

- begin failure、serialization conflict、deadlock、transient connectionを分類する。
- definitely rolled backの場合だけsafe retry候補である。
- commit unknownはretryable failureに分類しない。
- callback replayにexternal side effectがないことをTransaction Managerが前提とする。
- retry ownerはTransaction Adapterとcommand ownerの共同責任である。
- numeric policyはTBDである。
- repeated failureはreadiness/alertへ反映する。

## 78. Unknown Commit Outcome

- definitely rolled back、definitely committed、commit outcome unknownを分離する。
- unknown時はsame idempotency/aggregate identityでlookupする。
- blind external I/O再実行を禁止する。
- Final groupはFinal Result、Reference、Outbox invariantを確認する。
- unresolvedはreconciliation-required/manual repairである。
- clientにはsafe pending verificationを返す。
- operator viewもraw Store errorを表示しない。

## 79. Connection Failure

- connection acquisition、transaction中、commit acknowledgement後のfailureを区別する。
- begin前failureはunavailableでside effectなし。
- transaction中failureはrollback certaintyをadapterが分類する。
- commit時failureはunknown outcomeになり得る。
- pool/endpoint detailをRuntime Resultへ出さない。
- circuit/readiness policyはData Platform/SRE ownerである。
- product-specific retryはadapter内部に隔離する。

## 80. Store Unavailable

- required Workflow Store unavailable時はnew writes/claimsを停止する。
- read-only Result Queryを許可するのはFinal/Reference/auth dependencyがsafeかつschema-compatibleな場合だけである。
- defaultはfail closedである。
- operation-scoped degradationをhealth/readinessへ反映する。
- cache/queueでdurable truthを代替しない。
- accepted responseを返さない。
- recovery後にunknown transactionsをreconcileする。

## 81. Corruption

- schema-validでないrecord、revision invariant違反、broken referenceをcorruptedとして隔離する。
- default値やcastで修復を推測しない。
- new mutationを停止しsafe reasonをAudit/alertする。
- raw record/contentをdiagnosticへ出さない。
- automatic migration対象とoperator repair対象を分離する。
- terminal corruptionはResultを推測再構築しない。
- corruption test fixtureはtest adapterだけが所有する。

## 82. Schema Version

- Store schema versionはRuntime/interface/record/provider binding versionと分離する。
- migration stateとcompatible reader/writer rangeを管理する。
- unknown majorはreadiness falseである。
- required index/constraint不在もmigration incompleteである。
- schema registry/tool productはTBDである。
- version checkはComposition Root initializationで行う。
- ownerはData Platform Schema Ownerである。

## 83. Record Version

- each persisted recordはrecord versionを持つ。
- decoderはsupported versionsだけをacceptする。
- additive fieldのdefault semanticsをmigration contractで定義する。
- semantic majorをdirect castしない。
- old/new writerが同時存在するcompatibility windowを固定する。
- fingerprint/job/reference versionsをrecordと別にpinする。
- corrupt/future recordはsafe statusで隔離する。

## 84. Migration Ownership

- schema ownerはData Platform、domain semantic ownerは各Workflow teamである。
- migration runnerはDeployment Platformが実行する。
- deployment gateはRelease Engineering/SREが所有する。
- backfill ownerはData Platformとdomain ownerの共同責任である。
- rollback policy/compatibility windowをmigrationごとに承認する。
- mismatchではreadiness false、new claims/API writes停止である。
- migration tooling選定はimplementation-blocking TBDである。

## 85. Forward Migration

- expand → compatible writer/readers → backfill → enforce → contractを基本とする。
- destructive changeを先にdeployしない。
- new optional fieldsはold readerが安全にignore可能でなければならない。
- new statusをold workerが誤解する場合はclaimをversion gateする。
- index/constraint build中のwrite semanticsを定義する。
- migration progressをsafe metricsで観測する。
- rollback pointを各stageで固定する。

## 86. Backward Compatibility

- old application versionがnew recordを安全に読めるwindowを定義する。
- unsafe writerはnew claimを取得できない。
- Result Referenceとterminal snapshotの既存semanticを維持する。
- fingerprint version mismatchをsame semanticsと推測しない。
- Provider binding/job statusのunknown versionをdeferする。
- rollbackでnew recordsを破壊しない。
- compatibility evidenceはmixed-version testで示す。

## 87. Rolling Deployment

- reader-first/expand-firstをdefault順序とする。
- schema compatibility確認後にnew writerをenableする。
- old/new workersはversion-compatible claimsだけを取得する。
- binding versionはJobへpinしdeployment default変更から隔離する。
- outbox/inbox payload versionをconsumerがvalidateする。
- migration incompleteならnew claims/writesを停止する。
- Result Query限定availabilityはexplicit readiness modeが必要である。

## 88. Backfill

- backfillはbounded batch、claim/fence、checkpoint、idempotencyを持つ。
- business external I/Oを実行しない。
- active record revisionをCAS/skipする。
- deletion/legal hold/regionを尊重する。
- raw sensitive contentをdiagnosticへ出さない。
- progress/failed classをsafe metricsで観測する。
- completion verification後にconstraintをenforceする。

## 89. Index Migration

- protected identity、due job、claim、tenant/region、Reference lookup indexを対象とする。
- online/offline capabilityはproduct選定後に評価する。
- build中のduplicate/uniqueness invariantを別手段で保護する。
- index ready前にdependent capabilityをavailableにしない。
- query plan/performance evidenceをstagingで取得する。
- rollback/cleanupを定義する。
- ownerはData Platformである。

## 90. Protected Identity Index

- raw token、idempotency key、provider reference、tenant valueをindex keyにしない。
- domain-separated protected identityを使用する。
- hashing/protection key ownerはSecurity/Data PlatformでTBDである。
- rotationはdual lookup/backfill/revoke windowを必要とする。
- collision handlingをconflict/corruptionとして定義する。
- protected valueもunbounded loggingしない。
- uniqueness scopeにnamespace、tenant、regionを含める。

## 91. Encryption

- transportとat-rest encryptionをrequiredとする。
- Restricted payload、credential、provider reference、sensitive indexを分類する。
- database-native encryptionだけでauthorization/minimizationを代替しない。
- key scopeはenvironment/region/classificationに合わせる。
- algorithms/productsはSecurity ownerのTBDである。
- backup/replicaも同等controlを要求する。
- configuration evidenceをacceptance gateに含める。

## 92. Envelope Encryption

- Restricted payloadはdata keyで暗号化しkey wrapping metadataを保持する方式を候補とする。
- Workflow recordはciphertext handle、key version、schema、regionだけを持つ。
- plaintext/data keyをbusiness tableへ保存しない。
- encrypt/writeとmetadata commitのpartial failureをreconcileする。
- decryptはauthorized purposeとshort lifetimeに限定する。
- KMS/productはimplementation-blocking TBDである。
- deletion/key revocation semanticsを別Contractで固定する。

## 93. Key Version

- encrypted recordはnon-secret key version metadataを持つ。
- readerはsupported active/retiring versionをresolveする。
- unknown/revoked versionはunavailable/corruptedを区別する。
- key versionをcredentialやsecretとして扱わない。
- rolling rotation中のold/new compatibilityを保証する。
- region mismatchをfail closedする。
- ownerはSecurity/KMS Platformである。

## 94. Key Rotation

- routine/emergency rotationを区別する。
- new writesをnew keyへ切替後、bounded rewrap/backfillする。
- active job/reconciliationはold key access windowを必要とし得る。
- compromise時はadmission停止、revocation、impact auditを行う。
- rotation progressをsafe metricsで観測する。
- raw key/secretをmigration logsへ出さない。
-具体手順と期間はTBDである。

## 95. Backup

- Workflow core、Reference Vault、Restricted metadata、Outbox、Auditをclassification別にbackupする。
- encryption、region、access、retentionを適用する。
- queue/cacheをprimary backupとみなさない。
- deleted data/legal holdのbackup policyを承認する。
- backup consistencyはFinal/Reference/Outbox invariantを維持する。
- RPO数値はTBDである。
- ownerはData Platform/SRE/Data Governanceである。

## 96. Restore

- restoreはisolated environmentでintegrityを検証してから昇格する。
- revision、idempotency、claims、tombstone、hold、regionを保持する。
- stale leasesをwriter epochとdatabase timeで無効化する。
- Provider external stateとOutbox/queueをreconcileする。
- duplicate submitを禁止する。
- Result/Reference invariantを全件またはapproved samplingで検証する。
- restore frequency/RTOはTBDである。

## 97. Disaster Recovery

- DRはhome-region writer transfer、Store restore、key availability、queue rehydrationを含む。
- RPO/RTOを本Contractで推測しない。
- failover前後のunknown commitとexternal Provider stateをreconcileする。
- split-brain preventionをlaunch blockerとする。
- deletion/residency/legal holdをDR中も維持する。
- runbook/drill evidenceを必須とする。
- ownerはSRE/Data/Securityである。

## 98. Observability

- transaction outcome、commit unknown、conflict、deadlock、claim、lease、outbox backlogを計測する。
- migration status、schema mismatch、replication lag、corruption、restoreを観測する。
- allowed labelsはoperation/stage/status/region class等のbounded valuesだけである。
- raw Reference、tenant、Asset ID、key、content、errorを禁止する。
- query/table/connection detailをpublic healthへ出さない。
- thresholdsはTBDである。
- ownerはSRE/Observabilityである。

## 99. Auditability

- schema migration、operator repair、failover、key rotation、deletion、holdをauditする。
- actor class、action、outcome、policy/version、safe aggregate handleを記録する。
- direct database mutationは禁止しcontrolled commandを使用する。
- Audit failure policyをrisk別に定義する。
- audit exportはOutbox経由でseparate security domainへ送れる。
- raw record snapshotをAuditとしない。
- accessはleast privilegeである。

## 100. Security

- least privilege、server-only、fail closed、protected identityを原則とする。
- Store accountをAPI/worker/migration/read-onlyで分離する。
- Runtime Resultへraw database/queue/KMS errorを出さない。
- SQL/SDK detailはsafe mapperを通す。
- Reference fallback、in-memory fallbackを禁止する。
- backup/replica/operator accessを監査する。
- threat model承認をadapter acceptanceに含める。

## 101. Performance

- correctness invariantをperformanceのために緩めない。
- due job、Reference、idempotency、tenant/region queryにindexを設計する。
- transaction scopeを短くしexternal I/Oを除外する。
- hot aggregate、claim contention、outbox throughputを測定する。
- cacheはread optimizationだけに使う。
- numeric latency targetはSLO決定までTBDである。
- staging load evidenceをproduct selectionに用いる。

## 102. Capacity

- records/workflow、job duration、poll volume、outbox volume、asset metadataをmodel化する。
- tenant/region skewとburstを含める。
- storage growthはretention/backup/index overheadを含める。
- numeric targetはProduct/SREのTBDである。
- capacity不足時はbackpressure/new admission停止を可能にする。
- partition/shardingを早期採用せずevidenceで判断する。
- scale testはmulti-instance correctnessも検証する。

## 103. Testing

- pure state transition、Store contract、transaction integration、multi-instance、failure injectionを層別化する。
- concrete adapterはshared suiteとproduct-specific suiteを通す。
- Reference Store assertionだけでProduction durabilityを主張しない。
- real transaction rollback/commit unknown/connection lossを検証する。
- migration/rolling/backfill/restore/region routingをstagingで検証する。
- sensitive leakage/static server-only testを維持する。
- ownerはQuality Engineeringと各Platform teamである。

## 104. Contract Test Strategy

- common matrixはcreate、duplicate create、read、update、stale revision、CAS conflictである。
- terminal overwrite、expiry、deletion、legal hold、corruption、unavailableを含む。
- concurrent claim、lease expiry、stale fencing、release、next eligibilityを含む。
- transaction rollback、commit unknown、outbox atomicityを含む。
- instance/process simulationとmutation isolationを含む。
- same fingerprint replay/different fingerprint conflictをnamespaceごとに検証する。
- test adapterだけがfailure controlを所有する。

### Failure Injection Matrix

| Injection | Expected contract outcome | Forbidden outcome |
|---|---|---|
| transaction begin failure | unavailable, no mutation | partial reservation |
| commit failure definite rollback | safe retry class | report committed |
| commit unknown | lookup/reconciliation | blind external retry |
| connection loss | classified safe result | raw driver error |
| deadlock | retryable transaction failure | unbounded retry |
| serialization conflict | conflict/retry policy | unconditional write |
| outbox write failure | business rollback | state without event |
| claim race | one fence winner | two active commits |
| crash after Provider I/O | unknown/reconcile | resubmit on lease expiry |
| migration mismatch | readiness false | writes continue |
| corrupted record | isolate/alert | inferred repair |

## 105. Adapter Implementation Plan

1. Durable Store Contract Test Harnessを実装する。
2. Transaction Adapter Contractとfailure-controlled test doubleを実装する。
3. Single-domain Test Adapterでatomic group semanticsを証明する。
4. Final Result／Reference／Outbox Adapterを最初のvertical sliceにする。
5. Idempotency Adapterをnamespace別に実装する。
6. Job／Claim／Lease Adapterをdatabase clock/fencing付きで実装する。
7. Restricted Input Metadata Adapterとencrypted storage seamを実装する。
8. Migration／Readiness Adapterを実装する。
- Concrete DB adapterはproduct ADR承認後に実装する。
- 各stepはshared contract passingをexit criterionとする。

## 106. Acceptance Gates

- V1 architectureとしてrelational primary + transactional outbox + queue + optional cacheを承認する。
- Workflow core Store co-location matrixを承認する。
- Final Result／Reference／Outbox same transactionを承認する。
- idempotency reservation transaction ownerを承認する。
- claim／lease/fencing/provider-submit protectionを承認する。
- database-authoritative UTC + monotonic process clockを承認する。
- migration owner、schema/version、rolling strategyを承認する。
- single-writer home regionとtenant partitionを承認する。
- Auth／CSRF、Billing、Asset、Credential separationを承認する。
- Restricted Input metadata/ciphertext separationを承認する。
- Adapter order、test/failure injection、stop conditionsを承認する。

## 107. Stop Conditions

- Final Result／Reference atomicityが変更または未承認なら停止する。
- Outboxとbusiness stateをsame transactionにできないなら停止する。
- Provider I/Oをtransactionに含める必要があるなら停止する。
- claim／lease fencingが未定義なら停止する。
- lease expiryでblind submit可能なら停止する。
- idempotency reservation ownerが不明なら停止する。
- database clock policyまたはmigration ownerが不明なら停止する。
- schema mismatchで起動継続するなら停止する。
- Restricted plaintext placement/key ownerが不明なら停止する。
- tenant／region partitionまたはmulti-region writerが不明なら停止する。
- concrete DB都合でRuntime Interface/invariantを変更するなら停止する。
- Queueをsource of truth、Cacheをdurable Storeにするなら停止する。
- Reference StoreへProduction fallbackするなら停止する。
- commit unknown/manual repair pathがないなら停止する。

## 108. Open Questions

- concrete relational engineは何か。
- managedかself-hostedか。
- transaction retryのfinal owner/policyは何か。
- Outbox dispatcherとqueue selectionは何か。
- protected identity hashing/key ownerは誰か。
- Restricted payload storageとencryption/KMSは何か。
- home region selection/routing mechanismは何か。
- cross-region Result Queryのconsistency classは何か。
- backup RPO/RTO、retention durations、deletion SLAは何か。
- legal hold integrationは何か。
- billing reservation protocolは必要か。
- Auth DBとのoperational relationは何か。
- operator repair UI/command surfaceは何か。
- migration tooling/schema registryは何か。
- load/capacity targetは何か。
- blocking TBD: relational engine semantics proof、transaction mapping、migration tooling、region writer、Restricted storage/KMS、webhook dedupe without event ID。
- deferred TBD: numeric TTL/lease/retention/RPO/RTO/capacity、optional cache、operational UI。

## 109. Final Decision Matrix

| Decision | Selected option | Rejected options | Reason | Implementation consequence | Revisit trigger | Blocking status |
|---|---|---|---|---|---|---|
| Primary transaction domain | Relational Workflow core | queue/cache truth, early split | atomic invariants | one ACID adapter | capacity/residency evidence | Decided |
| Cache role | Optional read/ephemeral | durable truth | eviction safe | correctness independent | measured need | Deferred |
| Queue role | Outbox delivery | source of truth | recoverable duplicates | dispatcher + dedupe | delivery requirements | Decided |
| Outbox | same business transaction | post-commit insert | no lost event | co-located Store | domain split | Decided |
| Inbox | validate then durable insert | process-only webhook | replay/order | protected dedupe | provider lacks event ID | Conditional blocker |
| Final Result atomicity | Final + Reference + Outbox | async Reference | preserve public invariant | atomic group adapter | proven alternate gate | Decided |
| Reference atomicity | same final transaction | later issuance | Reference contract alignment | protected index | scale evidence | Decided |
| Idempotency | reserve with business domain | cache/queue only | cross-instance safety | namespace Stores | domain split | Decided |
| Claims | durable row/record claim | process lock | crash recovery | conditional claim | contention evidence | Decided |
| Lease | DB time + fencing | app clock/expiry only | stale writer safety | renewal/CAS | product constraint | Decided |
| Clock | DB UTC + process monotonic | application wall clock | skew control/testability | dual clock adapter | unavailable semantics | Decided |
| Restricted input | metadata primary, ciphertext separate | plaintext business table | minimization/encryption | staged seam | product/security ADR | Blocking product TBD |
| Auth | separate Security domain | shared Workflow transaction | clear trust boundary | projected Principal | auth architecture change | Decided |
| Billing | separate ledger via Outbox | distributed transaction | domain ownership | billing idempotency | credit reservation need | Decided/conditional |
| Audit | safe local append + export | raw snapshot | atomic evidence/privacy | audit/outbox adapter | compliance requirement | Decided |
| Multi-region | single writer home region | active-active | conflict prevention | routing/writer epoch | approved availability need | Blocking mechanism TBD |
| Migration | expand/migrate/contract gate | startup best effort | rolling safety | readiness adapter | tooling selection | Blocking tooling TBD |
| Backup | encrypted consistent backup | queue/cache backup | restore invariants | restore tests | RPO/RTO approval | Policy TBD |
| Adapter order | contract → tx → final slice → idempotency → jobs | broad Store implementation | risk-first proof | vertical foundation | dependency finding | Decided |

## 110. Readiness

- Durable Workflow Store Architecture Decision: Complete。
- Primary transaction domain decision: Complete。
- Store co-location policy: Complete。
- Final Result／Reference／Outbox atomicity: Complete。
- Idempotency、Claim／Lease、Clock、Migration ownership semantics: Complete。
- Auth／CSRF、Billing、Asset、Credential separation: Complete。
- Multi-region V1 policy: single-writer home region selected; concrete mechanism TBD。
- Durable Adapter implementation開始可能性: Contract Test HarnessとTransaction Test Adapterのみ開始可能。
- Concrete Production Adapter開始はblocking TBDのproduct/region/encryption/migration ADR解消まで不可。
- Production Connection: Not allowed。
- Production Launch: Not allowed。
- 次に実装すべきFoundationはDurable Store Contract Test Harnessである。

## Foundation Implementation

- Contract Test Foundationは`lib/server/productionWorkflowRuntime/storeContracts/**`へserver-onlyで配置する。
- Adapter Factoryはfresh environmentとshared-backend multi-instance environmentを生成する。
- test adapter descriptorは`mode: contract-test-only`、`durable: false`、`crossProcess: false`、`productionReady: false`を固定する。
- transaction staging、Final／Reference／Outbox atomic group、CAS、idempotency、claim／leaseを公開Contract APIで検証する。
- failure controllerはenvironment-local、一回消費、reset可能でありProduction recordへscenarioを追加しない。
- database clock simulationはcontrolled UTCを使用し、process monotonic clockから分離する。
- reusable suiteは`runDurableWorkflowStoreContractSuite(factory)`としてexportし、`node:test`へ依存しない。
- commit unknownはrollbackへ変換せず、protected identity lookupでcommitted／not-committed／still-unknownを分類する。
- shared backendはmulti-instance raceを模擬するがdurability/cross-process capabilityを主張しない。
- Foundation testは700,000件以上のtransaction、atomicity、revision、namespace、claim、security、version matrixを含む。
- Concrete DB、migration、queue、KMS、Production Composition Rootは実装しない。
