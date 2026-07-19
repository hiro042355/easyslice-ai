# Workflow Reconciliation Runtime Contract V1

## 1. Status

本書はProduction Workflow Reconciliation Runtimeの責務、入力、観測、解決、停止、監査境界を定めるV1 Contractである。

本書は設計Contractであり、Production Runtime、Store、Provider、SchedulerまたはCompositionの実装を許可しない。

## 2. Purpose

Reconciliation Runtimeは、一度の処理では安全に確定できなかったWorkflow outcomeを、保護されたidentity、durable truth、bounded observation policy、CAS、manual escalationによって安全に収束させる。

Reconciliationは単なるretry loopではない。

Reconciliationは失われた応答を成功または失敗と推測しない。

## 3. Normative Sources

本書は次を前提とする。

- `WORKFLOW_PRODUCTION_READINESS_GAP_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_RUNTIME_INTERFACE_CONTRACT_V1.md`
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`
- `SLICE_A_DURABLE_STORE_CAPABILITY_POSTGRESQL_IDENTITY_STATEMENT_CONTRACT_V1.md`
- `SLICE_A_COMMIT_UNKNOWN_RESULT_OWNERSHIP_CONTRACT_V1.md`
- `SLICE_A_POSTGRESQL_CORRUPTION_VERIFICATION_CONTRACT_V1.md`

矛盾時は、より限定的で新しいownership Contractを優先する。

## 4. Current Foundation

PostgreSQL Driverはcommit acknowledgement lossを`unknown-outcome`へ分類する。

Durable Transaction V2はこれを`commit-unknown`へ変換し、connectionをdiscardする。

Slice A StoreはFinal Result、Result Reference、Outboxに対する一回のwriter-authoritative lookupを所有する。

Store lookupの実効結果は`committed`、`not-committed`、`corrupted`、`unavailable`である。

## 5. Current Gap

Production Reconciliation Runtimeは存在しない。

現行Runtime vocabularyには`reconciliation-worker`と`provider-job-lookup`が存在するが、Production implementation、Composition、durable request、scheduler、lease、policyは未実装である。

Reference Workflowには`reconciliation-required`分類があるが、Production durabilityを証明しない。

## 6. Store Non-ownership

Storeは次を所有しない。

- 時間をまたぐ再照合
- 複数source照合
- Provider Job lookup
- retry schedule
- escalation
- manual repair
- workflow-level `still-unknown`

Storeの`unavailable`をStore自身が時間経過で`still-unknown`へ昇格してはならない。

## 7. Reconciliation Definition

Reconciliationは、保護された一つのrequestについて、許可されたsourceを観測し、既知のinvariantと比較し、安全なresolution transitionまたはescalationを決定するserver-only capabilityである。

一つのattemptは一つのbounded observation planだけを実行する。

外部I/Oとdatabase transactionを同一transaction内で待機しない。

## 8. Ownership

Workflow ReliabilityがReconciliation policyを所有する。

Workflow Platformがworkflow state transitionを所有する。

Provider IntegrationがProvider lookup semanticsを所有する。

Data Platformがwriter-authoritative Store lookupを所有する。

Asset Platformがingestion truthを所有する。

Operator tooling ownerがmanual repair command surfaceを所有する。

## 9. Reconciliation Request Intake

Requestはdurableにreserveされ、同一protected reconciliation identityでidempotentに再開できなければならない。

Request intakeは生のProvider response、credential、Reference文字列、Asset ID、tenant raw value、idempotency keyを受理または保存してはならない。

同一identityかつ同一fingerprintは既存requestを返す。

同一identityかつ異なるfingerprintはconflictである。

## 10. Protected Reconciliation Identity

Identityはversioned、domain-separated、keyed protectionで生成する。

Identityからworkflow、tenant、Provider job、Asset、Referenceを復元または推測できてはならない。

新しいidentityをretryごとに生成してはならない。

## 11. Trigger Classes

V1 trigger class候補は次である。

- `database-commit-unknown`
- `provider-submit-unknown`
- `provider-poll-unknown`
- `output-ingestion-unknown`
- `cancellation-unknown`
- `webhook-scheduler-race`
- `outbox-delivery-unknown`
- `terminal-conflict`
- `manual-repair-requested`

Trigger classはsafe enumであり、raw error textではない。

## 12. Reason Classes

Reason classは観測開始理由を表し、resolution outcomeを先取りしない。

許可候補はacknowledgement loss、timeout、lookup inconsistency、late event、stale fence、CAS conflict、partial ingestion、delivery uncertainty、operator requestである。

Connection errorだけを`not-committed`または`not-submitted`のreasonにしてはならない。

## 13. Bounded Observation Plan

Planは最大attempt、最大elapsed class、source順序、sourceごとのtimeout、jitter class、backoff class、escalation thresholdを含む。

具体的な秒数、回数、Provider固有値はbinding Contractとload evidenceがない限り固定しない。

Planはbrowser retryから独立する。

Plan exhaustionはsilent abandonmentではない。

## 14. Observation Admission

各attemptはcurrent request revision、lease、owner、deadline、terminal stateを確認してから開始する。

Lease expiryはworker takeoverを許可するが、Provider submitを許可しない。

stale workerは観測結果をcommitできない。

## 15. Writer-authoritative Store Lookup

Database Commit UnknownではSlice A writer-authoritative lookupを最初のtruth sourceとする。

`committed`は三record invariant成立を意味する。

`not-committed`は三recordすべて不存在を意味する。

`corrupted`はpartial、duplicate、malformed、semantic mismatchを意味する。

`unavailable`はそのattemptで安全な観測ができないことを意味する。

## 16. Provider Job Lookup

Provider Job lookupはprotected provider job handle、provider account binding、operation binding、region bindingをserver側で解決する。

Provider responseはuntrusted inputとしてadapter validationを通す。

Provider not-foundは即座にnot-submittedを意味しない。

eventual consistency、retention、wrong binding、expired handle、deleted jobをsafe classで区別する。

## 17. Outbox and Journal Lookup

Outboxはdelivery intentのdurable truthであり、delivery acknowledgementのtruthではない。

Journalはsafe outcome classとrevisionを保持する。

Raw Provider response、payload secret、signed URLをJournalまたはOutboxへ複製してはならない。

## 18. Webhook Inbox Lookup

Webhookはvalidated inboxへ受理された後だけ観測sourceとなる。

署名未検証、binding不一致、replay window外、malformed eventはdomain truthとして扱わない。

Webhook単独をterminal truthにしない。

## 19. Terminal State Lookup

各resolution前にterminal durable truthとrevisionを再読する。

terminal stateはabsorbingである。

late poll、late webhook、late cancel response、late ingestion responseはterminal resultを上書きしない。

同一terminal replayはno-opまたはexisting resultである。

異なるterminal outcomeはconflictまたはmanual repairである。

## 20. Conflict Detection

source間でoperation、binding、identity class、revision、terminal classが一致しなければconflictである。

conflictを多数決で解決しない。

より新しいtimestampだけを理由にwinnerを決めない。

CAS conflictはreread対象であり、unconditional overwrite理由ではない。

## 21. Resolution Commit

Resolutionは専用のversioned commandとしてexpected revision付きCASでcommitする。

外部Provider I/Oはresolution transaction外で行う。

state mutationと必要なOutbox appendは同一transactionにする。

resolution commit自体がunknownなら、新しいProvider side effectを行わずauthoritative lookupへ戻す。

## 22. Safe Result Contract

概念的なV1結果は次である。

```ts
type WorkflowReconciliationResult =
  | Readonly<{
      status: "resolved";
      outcome:
        | "committed"
        | "not-committed"
        | "provider-job-found"
        | "provider-job-not-found"
        | "terminal-preserved"
        | "cancelled";
    }>
  | Readonly<{
      status: "pending";
      nextAction: "retry-later";
      retryAdvice: SafeReconciliationRetryAdvice;
    }>
  | Readonly<{
      status: "still-unknown";
      escalation: "manual-repair" | "operator-review";
    }>
  | Readonly<{
      status: "corrupted";
      escalation: "manual-repair";
    }>
  | Readonly<{
      status: "unavailable";
      retryable: boolean;
    }>;
```

このshapeは設計候補であり、コード追加を許可しない。

## 23. Safe Retry Advice

Retry adviceはdelay class、deadline class、attempt remaining class、required source classだけを含む。

絶対時刻、Provider URL、job handle、Reference、tenant、raw reasonを返さない。

Browserへ内部attempt budgetを公開しない。

## 24. still-unknown Ownership

`still-unknown`はReconciliation Runtimeだけが所有するworkflow-level outcomeである。

一回のStore `unavailable`では生成しない。

一回のProvider timeoutでは生成しない。

bounded policyを消費し、許可sourceから安全な結論が得られず、corruptionとも確定できない場合だけ生成できる。

`still-unknown`はProvider resubmit許可ではない。

## 25. unavailable Difference

`unavailable`は特定attemptまたはsourceが利用不能だった結果である。

`still-unknown`は複数attemptまたはpolicy期間を通じた上位resolution結果である。

利用不能が解消すれば同じprotected identityで観測を再開する。

## 26. Manual Repair Escalation

Manual repairはdirect SQL、DB console edit、constraint disableではない。

versioned、authorized、audited command surfaceを使用する。

repair結果はno-op、reconciled、deferred、terminal-safe failureである。

operator入力からoperation、Provider outcome、terminal stateを推測しない。

## 27. Audit

Auditはtrigger class、source class、attempt class、result class、revision class、escalation classを記録する。

AuditにReference、Asset ID、tenant raw value、Provider job handle、credential、idempotency key、raw row、raw errorを含めない。

Manual repair commandはactor class、authorization decision、before/after safe state classを監査する。

## 28. Observability

Metrics候補はintake count、pending age class、attempt count、source unavailable、resolution class、still-unknown count、manual repair backlog、terminal conflict、lease takeoverである。

labelはbounded enumだけを使用する。

Trace baggageへprotected identityまたはProvider handleを入れない。

## 29. Database Commit Unknown

対象例はFinal Result、Reference、OutboxのCOMMIT response lossである。

観測sourceはFinal Result、Result Reference、Outboxである。

`committed`は`resolved/committed`へ写像する。

`not-committed`は、同じside effectを再実行してよいことを自動的には意味しない。上位stage policyを確認する。

`corrupted`はmanual repairである。

`unavailable`はretry-laterまたはpolicy exhaustion後のstill-unknownである。

## 30. Provider Submit Unknown

送信された可能性があるrequestをblind resubmitしない。

観測sourceはGeneration Submit Idempotency、Provider Job lookup、account/operation binding、webhook inbox、safe Journalである。

Providerがformal idempotency lookupを提供する場合だけ、そのbinding Contractに従う。

Lease expiry、timeout、connection resetはnot-submittedの証明ではない。

## 31. Provider Poll Unknown

Poll response loss、contradictory state、malformed response、job lookup unavailableを区別する。

Pollはside effectを伴わないlookupに限定してbounded retry可能である。

late terminal responseはrevisionとterminal reconciliationを通す。

Provider job terminalとlocal terminalが異なる場合は上書きせずconflictにする。

## 32. Output Ingestion Unknown

Provider output existence、fetch、scan、asset storage、asset registration、Final Result commitを別stageとして観測する。

Provider URL existenceをAsset commitと同一視しない。

partial outputをcompleteと推測しない。

orphan assetの削除はAsset lifecycle policyなしに自動実行しない。

## 33. Cancellation Unknown

Workflow cancel、Provider cancel requested、Provider cancel confirmed、cleanup、billing、asset deletionを別stageにする。

一つの`cancelled` flagで全stage完了を表さない。

Providerのlate completionはterminal protectionとbilling/asset reconciliationへ送る。

Cancellation authorizationをrepair時にも再評価する。

## 34. Webhook and Scheduler Race

Webhookとscheduler pollは同じdurable job revisionを競合する。

両者は同じclaim/fence/CAS policyを使用する。

winnerだけがtransitionをcommitする。

loserはrereadし、同一結果ならno-op、異なる結果ならconflictにする。

到着順をProvider truthの優先順位にしない。

## 35. Outbox Delivery Unknown

Delivery acknowledgement loss時にOutbox rowをblindly deliveredへしない。

consumer idempotency、delivery ledger、Outbox rereadを使用する。

duplicate deliveryは想定内でありconsumerがidempotentでなければならない。

outcome不明はreconciliation-requiredまたはstill-unknownへ進む。

## 36. Terminal-state Protection

Reconciliationはterminal payload、operation、owner bindingを変更しない。

Terminal overwriteをrepair shortcutとして許可しない。

terminal conflictはmanual repair candidateであり、自動winner選択をしない。

## 37. Retry Classification

Retry classは`safe-observation`、`conditional-after-lookup`、`unsafe-side-effect`、`terminal`に分ける。

Database readとProvider formal lookupはpolicy内でsafe observationとなり得る。

Provider submit、Workflow Start、billing mutation、asset deletionはlookupなしにretryしない。

## 38. Backoff and Jitter

Backoffはsource/binding classにより決める。

Jitterを使用してpoll stormを防ぐ。

Retry-Afterはallowlisted parserで検証し、上限policyを超えて信用しない。

## 39. Budget Exhaustion

budget exhaustionは`still-unknown`、manual repair、operator reviewのいずれかへ明示的に遷移する。

requestを削除しない。

Provider side effectを再開しない。

## 40. Shutdown and Drain

worker shutdownは新attempt intakeを停止する。

active observationはbounded deadline内で完了またはlease relinquishする。

acknowledgementなしにresolvedと記録しない。

restart後はdurable requestとleaseから再開する。

## 41. Security Boundary

Moduleはserver-onlyでなければならない。

Browser、React、Hook、client bundleからimportしてはならない。

CredentialはProvider Clientへ限定されたcapabilityとして渡し、Result/Auditへ返さない。

Arbitrary SQL capabilityをReconciliationへ公開しない。

## 42. Non-responsibilities

Reconciliation Runtimeは次を行わない。

- blind Provider resubmit
- blind Workflow Start replay
- idempotency key再生成
- terminal result overwrite
- automatic corruption repair
- raw credential lookupの外部公開
- billing refundの自動決定
- asset deletionの自動決定
- authorization bypass
- arbitrary SQL execution
- raw Provider error公開

## 43. Data Minimization

Requestにはprotected identity、safe trigger、safe stage、revision、policy version、bounded timestampsだけを保持する。

Story、Lyrics、Scene、Prompt、media body、Provider response bodyを保存しない。

必要なRestricted dataは専用Vault capabilityからpurpose-boundに参照する。

## 44. Mutation Isolation

Request、plan、observation、result、audit projectionはcopy/freeze境界を持つ。

Provider adapter outputを直接Store projectionとして保持しない。

Consumer mutationが次attemptへ伝播してはならない。

## 45. Concurrency

同一reconciliation identityに対して同時active ownerは一つだけである。

異なるidentityは並行実行できる。

fenceはtakeoverごとに単調増加する。

stale ownerのresolution commit、renew、releaseを拒否する。

## 46. Idempotency

Intake、observation checkpoint、resolution commit、escalationはそれぞれidempotentである。

同一attempt replayは新しいProvider side effectを発生させない。

Manual repairも同一command identityでreplay-safeである。

## 47. Failure Matrix

| Failure | Classification | Action |
|---|---|---|
| Store committed | resolved | preserve committed truth |
| Store not-committed | resolved observation | consult stage retry safety |
| Store corrupted | corrupted | manual repair |
| Store unavailable | unavailable | bounded retry-later |
| Provider lookup timeout | unavailable | bounded lookup retry |
| Provider lookup malformed | corrupted observation | stop automatic resolution |
| CAS conflict | conflict | reread and compare |
| stale fence | conflict | stop stale owner |
| budget exhausted | still-unknown | operator/manual escalation |
| resolution commit unknown | commit-unknown | authoritative lookup only |

## 48. Test Matrix

Future Foundationは少なくとも次を検証する。

- intake replay/conflict
- plan validation
- bounded attempts and elapsed policy
- writer-authoritative Store classifications
- Provider lookup found/not-found/unavailable/malformed
- webhook/scheduler race
- stale fence and takeover
- terminal preservation
- resolution CAS conflict
- output ingestion partial state
- layered cancellation
- Outbox delivery unknown
- still-unknown only after policy exhaustion
- manual repair escalation
- mutation isolation
- safe diagnostics
- shutdown/restart

## 49. Race Matrix

Poll versus webhook、cancel versus completion、ingestion versus deletion、reconciliation versus manual repair、two reconcilers、terminal replay versus conflictを個別に検証する。

Race testを通すためにterminal protection、fencing、budgetを緩めてはならない。

## 50. Static Boundary Tests

Production moduleからReact、browser API、Reference fixture、test bridgeをimportしないことを確認する。

`process.env`直接読取、global mutable registry、raw SQL、Provider secret projectionがないことを確認する。

Provider submit methodがReconciliation observation interfaceへ混入していないことを確認する。

## 51. Readiness Matrix

| Capability | Current | Required before implementation |
|---|---|---|
| Slice A authoritative lookup | Complete | preserve |
| Durable Transaction commit-unknown | Complete | preserve |
| Reconciliation ownership | Contracted | interface foundation |
| Durable reconciliation request | Missing | separate Store Contract |
| Scheduler/lease composition | Missing | worker Contract |
| Provider job lookup binding | Reference only | provider-specific Contract |
| Webhook inbox | Missing | inbox Contract |
| Manual repair command | Missing | authorization/audit Contract |
| Production Composition | Prohibited | later launch gate |

## 52. Implementation Sequence

1. Reconciliation capability types and validator foundation
2. protected request identity Contract
3. durable reconciliation request Store Contract
4. observation source interfaces
5. pure policy reducer
6. lease/fence worker foundation
7. terminal reconciliation reducer
8. manual escalation projection
9. Reference-only fixtures
10. real Store integration tests
11. Provider binding-specific verification
12. Production Composition gate

順序を飛ばしてProduction connectionへ接続しない。

## 53. Stop Conditions

次の場合は実装を開始または継続しない。

- retry budgetを根拠なく固定する必要がある
- Provider not-found semanticsがbinding Contractから得られない
- Provider submitをlookup interfaceから再実行する必要がある
- terminal result overwriteが必要になる
- corruptionをautomatic repairする必要がある
- Store `unavailable`を一回で`still-unknown`へ変換する必要がある
- raw Provider errorまたはcredentialを永続化する必要がある
- arbitrary SQLまたはPoolClientを公開する必要がある
- Production Runtimeへtest-only branchを登録する必要がある
- billing/asset deletionをWorkflow Reconciliationが単独決定する必要がある

## 54. Prohibitions

Migration変更、schema変更、constraint disable、alternate schema、blind retry、direct DB repair、idempotency key regeneration、Provider binding推測、operation推測、terminal state推測を禁止する。

## 55. Open Decisions

V1 implementation前に次を別Contractで決定する。

- reconciliation request durability schema
- retention and deletion
- exact lease duration
- attempt and elapsed budgets
- Provider binding別not-found policy
- webhook inbox ownership
- manual repair authorization model
- billing and Asset reconciliation handoff
- multi-region writer policy

## 56. Decision Summary

Reconciliation Runtimeはuncertain outcomeの上位ownerであり、Store、Transaction、Provider、Asset、Outboxのtruthを置き換えない。

Storeは一回のwriter-authoritative lookupだけを所有する。

Durable Transaction V2はcommit acknowledgement lossを分類するだけで最終解決しない。

`still-unknown`はbounded observation policy exhaustion後にReconciliationだけが生成する。

Provider side effectのblind retry、terminal overwrite、automatic corruption repairは禁止する。

## 57. Completion Statement

本ContractによりProduction Workflow Reconciliation Runtimeの責務、非責務、結果、source、retry、escalation、security、terminal protection、`still-unknown` ownershipを固定した。

Reconciliation Runtime実装は未開始である。

Production Statement Binding、Runtime Composition、Production Connectionは未実装かつ禁止のままである。
