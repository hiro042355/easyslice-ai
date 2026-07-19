# Production Workflow Runtime Interface Contract V1

Status: Design contract

Scope: server-only Production Workflow Runtime Interface Foundation

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose

- Reference Runtimeの公開責務を維持し、Production API、Worker、Scheduler、Webhook Handlerが同じdurable state graphを共有できる境界を固定する。
- Runtime Interfaceはruntime graphの利用契約である。
- Store Interfaceはdurable stateへの操作契約である。
- Transaction Interfaceは複数のdurable mutationを原子的に束ねる契約である。
- Provider Interfaceは外部ProviderとのI/Oおよびvalidation契約である。
- Composition Rootは完全なgraphを構築し公開するserver-only ownerである。
- Concrete Product Implementationは将来選定されるDB、queue、auth等のadapterであり本Contractの対象外である。
- Runtime Interface Foundation完成はProduction実装完成を意味しない。

## 2. Current Reference Runtime

- 現在のReference Runtimeは`globalThis`、`Symbol.for`、単一Node process、in-memory Storesを使用する。
- `ReferenceWorkflowIntegrationRuntime`は`startAccepted`とoperation-specific `entryPoints`を公開する。
- API Process RuntimeはAPI Foundation、Reference Vault、API Idempotency、Authentication、CSRFを共有する。
- `ReferenceWorkflowEntryPoints`はupload poll、resume、generation poll、result query、cancelを提供する。
- Reference Runtimeはdeterministic fixture、contract test、developer UIを成立させている。
- process内の再利用とmutation isolationはReference Contractの範囲で完成している。
- current ownerはReference Workflow Maintainerである。
- Reference完成範囲はProduction移行後も回帰oracleとして維持する。

## 3. Current Production Gap

- Process restartでstateが消失し、複数instanceでstate graphが分断される。
- cross-instance idempotency、claim、lease、CAS、outbox、distributed sessionが存在しない。
- API、Worker、Scheduler、Webhook Handlerを横断するdurable transaction ownerが未実装である。
- Production authentication、credential vault、real provider bindingが未実装である。
- readiness、drain、migration compatibility、manual repairがProduction品質ではない。
- `globalThis`はdurability、exclusive ownership、rolling deploymentを保証しない。
- Production hard denyを解除できる状態ではない。
- gap ownerはProduction Runtime Foundation Leadである。

## 4. Scope

- Production Workflow Runtimeの型責務とbundle分割。
- Composition、lifecycle、capability、health、readiness、shutdown、drain。
- transaction、clock、ID、claim、lease、journal、CAS、outbox、inbox。
- durable Store bundleとStore共通semantics。
- Provider、Security、Observability依存境界。
- API、Worker、Scheduler、Webhook、Operator consumer contract。
- Reference adapter互換方針とProduction adapter移行方針。
- acceptance gates、stop conditions、open questions。

## 5. Non-goals

- PostgreSQL、Redis、SQS、Kafka、Auth0その他の製品を選定しない。
- concrete schema、migration SQL、SDK wrapperを実装しない。
- API Route、Store、UI、Provider、packageを変更しない。
- 数値TTL、lease、timeout、SLO、retentionを推測しない。
- Production Providerや最初のoperationを選定しない。
- Reference RuntimeをProduction Runtimeへ昇格しない。
- external Provider I/Oをtransaction内に入れない。
- Production UIまたはAsset Deliveryを実装しない。

## 6. Terminology

- Runtime Graph: consumerが使用する完全かつversion-compatibleな依存bundle。
- Aggregate: revisionとtransition policyを共有するdurable state単位。
- Transaction Context:一回のdurable transaction内だけで有効なopaque capability。
- Claim: work ownershipを原子的に予約するrecord。
- Lease:期限とfencing revisionを持つ一時的claim。
- Journal:安全なattempt／transition履歴。
- Protected Identity: raw identifierを露出しないlookup identity。
- Unknown Outcome: external side effectの成否を断定できない状態。

## 7. Production Runtime Definition

```ts
type ProductionWorkflowRuntime = {
  runtimeVersion: "1.0";
  core: ProductionWorkflowCoreRuntime;
  stores: ProductionWorkflowStores;
  provider: ProductionProviderRuntime;
  security: ProductionSecurityRuntime;
  observability: ProductionWorkflowObservability;
  lifecycle: ProductionWorkflowRuntimeLifecycle;
};
```

- top-levelはnavigation bundleであり、business logicを集約するGod interfaceではない。
- Coreはtransaction、clock、ID、capability、registry accessを所有する。
- Stores、Provider、Security、Observability、Lifecycleは個別interfaceとしてversion化する。
- concrete implementation classをtop-level型へ露出しない。
- runtime graphは構築後immutableとして公開する。
- accountable ownerはRuntime Architectureである。

## 8. Runtime Consumers

- ConsumersはRuntime graphをprocess起動時に受け取り、request/jobごとに参照する。
- consumerがStoreやProviderを独自生成してはならない。
- read-only consumerにもauthorization、version、health境界が必要である。
- write consumerはtransaction ownerとidempotency namespaceを宣言する。
- external I/O consumerはreserve/journal/reconcile contractを宣言する。
- worker consumerはclaim/lease/drain contractを宣言する。
- operator consumerは強いauthorizationとimmutable auditを必要とする。

### Runtime Consumer Matrix

| Consumer | Runtime dependencies | Read-only dependencies | Write dependencies | Transaction requirement | External I/O | Claim/lease requirement | Shutdown behavior |
|---|---|---|---|---|---|---|---|
| Workflow Start API | Core/Security/Stores/Provider | registries/capability | API idempotency/acceptance | reserve and journal | provider submit possible | claim, no long lease | stop admission; finish safe stage |
| Upload Poll API | Core/Security/Stores | poll/result/reference | API idempotency | query or claim transaction | no direct submit | optional short claim | return retry-safe response |
| Generation Poll API | Core/Security/Stores | job/result/reference | poll idempotency | claim/CAS | provider lookup possible | short lease | journal unknown before exit |
| Result Query API | Core/Security/Stores | final/reference | none except audit | read snapshot | none | none | finish bounded read |
| Cancel API | Core/Security/Stores/Provider | job/result | cancel/outbox | request commit/CAS | provider cancel after commit | cancellation claim | preserve pending cancellation |
| Upload Poll Worker | Core/Stores/Provider | accepted/poll | poll/journal/outbox | claim and CAS | upload lookup | required lease | stop claims; checkpoint |
| Resume Worker | Core/Stores/Provider | resume/restricted | journal/job/outbox | claim and stage commits | materialize/submit | required lease | prevent stale commit |
| Generation Poll Worker | Core/Stores/Provider | jobs | poll/ingestion/outbox | claim and CAS | provider lookup/download | required lease | journal/checkpoint |
| Webhook Handler | Core/Stores/Provider/Security | binding/job | inbox/outbox | validate and inbox commit | signature validation only | inbox dedupe claim | persist accepted event |
| Reconciliation Worker | Core/Stores/Provider | all affected records | journal/CAS/outbox | per-case transactions | lookup only by policy | required lease | leave resolvable state |
| Cleanup Worker | Core/Stores | lifecycle/hold | tombstone/outbox | batch item transaction | storage cleanup later | required lease | stop batch; retain cursor |
| Deletion Worker | Core/Security/Stores | hold/ownership | deletion/tombstone/outbox | staged transactions | provider deletion possible | required lease | persist deletion stage |
| Operator Repair Tool | Core/Security/Stores | safe repair view | repair journal/CAS | explicit command transaction | only approved action | scoped claim | abort uncommitted command |

## 9. API Process

- API Process validates HTTP projection, authentication, authorization, capability, idempotency, and command admission。
- It receives one complete runtime graph from Composition Root。
- Routes MUST NOT construct Store bundles or Reference fallback。
- API Process may initiate bounded external I/O only through standard transition pattern。
- accepted response requires durable reservation/acceptance commit。
- readiness falseならWorkflow Routeを公開しない。
- shutdown時はnew admissionを停止しin-flight requestをsafe boundaryまで進める。

## 10. Worker Process

- Worker Process executes asynchronous stages from durable due work。
- Work discovery、claim、heartbeat、journal、CAS、outboxはruntime dependencyを介する。
- Workerはlease fencingなしでcommitしない。
- Provider submit、poll、ingestion、cleanupはstage別workerに分離可能である。
- process identityはprotected owner identityへ変換する。
- crashはnormal operating conditionとしてreconciliationされる。
- ownerはWorker Platformである。

## 11. Scheduler

- Schedulerはdurable due stateまたはoutbox-backed deliveryからworkを発見する。
- Scheduler自身はProvider submitを実行しない。
- batch、fairness、jitter、concurrency、poison record policyはTBDである。
- duplicate deliveryはconsumer idempotencyで吸収する。
- next-attempt更新はclaim/CAS transactionを使用する。
- shutdown時はnew dispatchを停止しdelivery ownershipを保存する。
- ownerはWorker Platform/SREである。

## 12. Webhook Handler

- Webhook Handlerはrouting、signature、timestamp、replay、schemaを検証する。
- validated eventをInboxへdurable commitした後にacknowledgeすることを推奨する。
- 重いingestionをrequest中に完了させる方式は非推奨であり、採用には別証跡が必要である。
- duplicate/out-of-order/late eventはInboxとCASで処理する。
- webhookを唯一の真実としない。
- raw payloadをAuditやlogへ流さない。
- ownerはProvider Integration/API Platformである。

## 13. Operator Tool

- Operator Toolはrepair command APIであり、DB consoleではない。
- operator authentication、authorization、reason、preview、approval、auditを必要とする。
- same transaction、revision、claim rulesを使用する。
- restricted value accessは別権限かつauditedである。
- raw Store errorやsecretを表示しない。
- repairはidempotentでrollback/compensation可能である。
- ownerはOperationsと各domain ownerである。

## 14. Composition Root

- Production Composition RootのownerはPlatform Runtime Teamである。
- config読込、version検証、dependency生成、Store接続、migration確認を行う。
- registry、provider binding、credential resolver、health registrationを構築する。
- complete graphのvalidation成功後に一度だけcommitして公開する。
- shutdown/drain handlerを登録する。
- request単位Runtime、Route bundle単位Store、partial graph公開は禁止する。
- config failure時のReference fallbackとProduction in-memory fallbackは禁止する。

## 15. Dependency Graph

```text
Composition Root
→ Core Runtime
→ Store Bundle / Transaction Manager
→ Provider Runtime / Security Runtime
→ Observability / Health / Lifecycle
→ API, Worker, Scheduler, Webhook, Operator Consumers
```

- dependency directionはconsumerからinterfaceへ向かう。
- StoreはProvider Clientを呼ばない。
- Provider adapterはWorkflow Storeを直接更新しない。
- Security projectionはcredential secretを含まない。
- graph cycleは起動失敗とする。

## 16. Runtime Lifecycle

- lifecycle statesはconstructing、validating、ready、draining、stopped、failedである。
- constructing/validating graphをconsumerへ公開しない。
- ready transitionはatomicである。
- drainingからreadyへ自動復帰しない。
- failed graphは破棄しReferenceへfallbackしない。
- lifecycle eventはsafe observabilityを生成する。
- ownerはComposition Rootである。

## 17. Initialization

- initializationはconfig snapshotとruntime/interface versionsを固定する。
- Store接続、schema compatibility、registry integrity、credential resolver accessを検証する。
- side-effecting provider callをinitialization probeに使用しない。
- optional dependency failureとrequired dependency failureを区別する。
- concurrent initializationはsingle published graphへ収束する。
- failure reasonはsafe codeに変換する。
- retry policyはdeployment ownerが決定しTBDとする。

## 18. Configuration Validation

- configはserver-only schemaでstrict validationする。
- required binding、region、capability、Store version、security dependencyを検証する。
- secret valueではなくcredential handleの形とscopeを検証する。
- unknown fieldの扱いはconfig version policyで固定する。
- invalid configはreadiness falseかつroute非公開である。
- raw configをlog、Issue、health responseへ返さない。
- ownerはConfiguration Platformである。

## 19. Readiness

- readinessはconfig valid、required Store reachable、schema compatible、migration completeを要求する。
- credential resolver、required binding、outbox write、runtime version compatibilityを確認する。
- required capability不足はreadiness falseである。
- Workflow Routeはreadiness falseのruntimeを使用してはならない。
- Provider endpoint一時障害はbinding availabilityと全体readinessを分離して評価する。
- readiness responseはsafe aggregate statusのみ公開する。
- thresholdとcache policyはTBDである。

## 20. Liveness

- livenessはprocess event loopとinternal lifecycle progressを評価する。
- dependency outageを直ちにprocess deathと同一視しない。
- deadlock、unrecoverable initialization loop、shutdown hangを検出する。
- liveness endpointはconfig、identity、Store、provider detailを返さない。
- liveness失敗後もdurable stateは別instanceからrecovery可能でなければならない。
- ownerはSRE/Runtime Platformである。
- exact thresholdsはTBDである。

## 21. Shutdown

- shutdownはadmission停止、new claim停止、in-flight tracking、dependency closeの順で行う。
- transaction中断はrollbackし、external I/O後はunknown/journal policyを適用する。
- Provider callをshutdown開始後に新規開始しない。
- outboxはdurable commit済みなら別workerへ引継げる。
- secretsとplaintext buffersを可能な範囲で解放する。
- forced terminationを想定する。
- ownerはLifecycle Runtime/SREである。

## 22. Drain

- APIはnew requestを拒否し、in-flightをbounded safe stageまで待つ。
- Workerはnew claimを停止し、heartbeatを維持しながらcurrent attemptを完了またはcheckpointする。
- Webhook ingressは停止前にaccepted requestのInbox永続化を保証する。
- lease releaseはstale commit fencingを失わせてはならない。
- grace timeout数値はTBDである。
- drain完了不能はsafe forced-stop reasonを発行する。
- rolling deployment testがacceptance evidenceである。

## 23. In-flight Recovery

- reservation済みI/O前crashはclaim stateからretry-safe判定する。
- I/O中または後crashはunknown outcomeとしてProvider lookup/reconciliationへ送る。
- journal済みfinal CAS前crashはjournalからidempotent transitionする。
- final commit済みoutbox delivery前crashはoutbox workerが再送する。
- lease expiryだけでProvider submitを再実行しない。
- recoveryはraw payloadやReferenceをdiagnosticへ返さない。
- ownerはReconciliation Runtimeである。

## 24. Runtime Versioning

- `runtimeVersion`はgraph contract major/minor compatibilityを表す。
- consumerは必要version rangeを宣言する。
- incompatible runtimeはconsumer起動を拒否する。
- version mismatchをReference fallbackで隠さない。
- rolling deployment中のold/new graphはStore/event互換性を満たす。
- runtime versionはcapabilityと独立して評価する。
- migration ownerはRuntime Architectureである。

## 25. Interface Versioning

- Core、Store bundle、Provider、Security、Observability、Lifecycleは個別versionを持てる。
- additive fieldはoptional semanticsとreader behaviorを定義する。
- semantic breaking changeはmajor versionとadapter migrationを要求する。
- TypeScript structural compatibilityだけをruntime compatibilityとみなさない。
- serialized boundaryはruntime validatorを必要とする。
- deprecated interfaceにはremoval gateを設定する。
- ownerは各interface ownerである。

## 26. Store Versioning

- Store recordとStore interface versionを分離する。
- read pathはsupported schemaだけをdecodeする。
- unknown major、corrupt、future versionはsafe statusとして隔離する。
- expand/migrate/contractをrolling deploymentで用いる。
- migration incompleteはrequired Store readiness falseである。
- direct castやdefault値による意味推測は禁止する。
- ownerはData Platform/domain schema ownerである。

## 27. Runtime Capability

```ts
type ProductionWorkflowRuntimeCapabilities = {
  durablePersistence: true;
  crossInstanceCoordination: true;
  distributedIdempotency: true;
  durableJobs: true;
  durableReferences: true;
  productionAuthentication: true;
  transactionalOutbox: boolean;
  productionCredentials: boolean;
};
```

- `true`は対応interface存在ではなくacceptance gate証跡済みを意味する。
- optional booleanもenabled operationのdependencyならrequiredになる。
- capabilityはserver-owned immutable snapshotである。
- client/query/env overrideは禁止する。

## 28. Production Availability

- operation availabilityはruntime readiness、capability、binding、region、credential、kill switchから計算する。
- availabilityはserver-owned safe projectionである。
- dependency一部障害で無関係operationを停止するかはbinding graphで判断する。
- unknown capabilityはunavailableとしてfail closedする。
- browserはavailabilityを権限として使用しない。
- routeはauthorizationを毎command再評価する。
- ownerはRelease Management/API Platformである。

## 29. Reference Runtime Compatibility

- Reference Runtime AdapterはProduction Runtime Interfaceのsubset/test implementationとして扱う。
- unit tests、local integration、deterministic fixtures、contract tests、developer UIに保持する。
- durable、distributed、production auth/credential capabilityを宣言してはならない。
- Reference interfaceとProduction interfaceの共有はsemantic contractに限定する。
- Reference-specific global registryをProduction adapterへ持ち込まない。
- ProductionでReference fallbackは禁止する。
- compatibility ownerはReference/Production Runtime Maintainersである。

## 30. Server-only Boundary

- Production Runtime型と実装はserver-only boundary内に配置する。
- client-safe barrelからre-exportしない。
- DB、queue、KMS、`node:` SDKをclient bundleへ含めない。
- Store record shapeも内部Contractであり、型だけという理由でclient-safeにしない。
- browserへは既存safe API DTOだけを投影する。
- static import graph testを必須とする。
- candidate rootは`lib/server/productionWorkflowRuntime/**`である。

## 31. Transaction Manager

```ts
type WorkflowTransactionManager = {
  runInTransaction<T>(work: (context: WorkflowTransactionContext) => Promise<T>): Promise<WorkflowTransactionResult<T>>;
};
```

- begin/commit/rollbackはadapter内部またはadvanced APIとして表現し、DB APIを模倣しすぎない。
- transaction IDはopaqueかつ非公開である。
- isolation level、timeout、retry classはData Platform ownerでTBDとする。
- after-commit hookはoutbox notification等に限定しdurable truthにしない。
- external I/Oとcontext持出しは禁止する。

## 32. Transaction Context

- Contextは一回のcallback lexical scope内だけで有効である。
- Store transactional methodsはcontext compatibilityを検証する。
- contextをrequest state、job record、closure、global cacheへ保存しない。
- transaction終了後の使用はfail closedする。
- contextはraw transaction IDやconnectionを上位へ露出しない。
- observability correlationとは別identityである。
- test fakeはlifetime violationを検出する。

## 33. Transaction Scope

- scopeは一つのdomain transitionと必要なoutbox/audit appendに限定する。
- external Provider I/O、asset download、KMS network operationを含めない。
- authorization preconditionはtransaction直前/内で必要なstateを再検証する。
- Store間atomicity requirementを各commandで宣言する。
- co-locationされないStore間はsaga/outbox/reconciliationを使用する。
- broad long-running transactionは禁止する。
- scope ownerはdomain command ownerである。

## 34. Transaction Nesting

- V1ではimplicit nested transactionを禁止する。
- active context内のserviceはsame contextを明示的に受け取る。
- independent nested commitはatomicity錯誤を生むため禁止する。
- savepointが必要なら別Contractとcapability versionを要求する。
- nested requestはconfiguration/programming errorとしてsafe failureへ変換する。
- transaction retryはtop-level callback単位で行う。
- ownerはTransaction Managerである。

## 35. External I/O Boundary

### Standard State Transition Pattern
- validate → transaction: reserve／claim → commit → external Provider I/O → transaction: journal outcome → CAS state transition → outbox append → commitを標準とする。
- timeoutはfailure確定ではない。
- external responseはuntrustedでvalidation後にjournalする。
- I/O contextにはshort-lived credentialと必要最小payloadだけ渡す。
- transaction contextをI/Oへ渡さない。
- unknown outcomeはreconciliationへ移す。

## 36. Reservation

- Reservationはidempotency identity、semantic fingerprint、aggregate、stage、revisionを原子的に固定する。
- same key/same semanticsはexisting outcomeを返す。
- same key/different semanticsはconflictである。
- reservation後I/O前crashはretry-safe判定可能な状態を残す。
- stale reservationを時間だけで削除しない。
- raw key/fingerprintをlogしない。
- ownerはnamespace domain ownerである。

## 37. Claim

- Claimはdue workのsingle active ownerをfencing付きで定義する。
- protected owner identity、claim revision、status、attemptを持つ。
- claim取得はcreate-if-absent/CAS transactionで行う。
- business resultへhostnameやworker identityを保存しない。
- tenant、Reference、Asset IDをdiagnosticへ露出しない。
- claim conflictはnormal concurrency outcomeである。
- ownerはWorker Platformである。

## 38. Lease

- Leaseはclaim expiryとlease revision/fencing tokenを持つ。
- indefinite leaseは禁止する。
- duration ownerはtask domainとSREであり数値はTBDである。
- expiry後takeoverは許可するがstale owner commitを拒否する。
- lease expiryだけでProvider submitを再実行しない。
- clock sourceとskew policyを固定する。
- release/expiryはjournalとreconciliationに観測可能である。

## 39. Heartbeat

- Heartbeatはactive leaseをrevision-checked renewalする。
- progress truthやProvider acceptance truthの代替ではない。
- failure時はbounded retry後にworkをsafe checkpointする。
- heartbeat network callをtransaction内external I/Oと混同しない。
- frequencyとgraceはTBDである。
- heartbeat payloadはsafe identityとrevisionだけを含む。
- ownerはWorker Lifecycleである。

## 40. Journal

- Journalはattempt、stage、safe transition、outcome class、timestamp、revisionをappendする。
- raw request、Asset ID、Provider reference、credential、raw errorを含めない。
- Journal appendとstate transitionを同一transactionにするか、順序を各patternで固定する。
- appendはidempotent event identityを持つ。
- corruptionはreconciliation-requiredである。
- operator repairも同じjournalへsafe entryを追加する。
- ownerはdomain pipeline/Data Platformである。

## 41. CAS

- compare-and-setはexpected revisionとpermitted transitionを検証する。
- stale/late responseはconflictになりterminalを上書きしない。
- terminal transitionは明示したrepair以外でimmutableである。
- CAS failure後にunconditional updateしない。
- callerはrereadしduplicate、conflict、reconciliationを分類する。
- transaction内でもaggregate revisionを検証する。
- ownerはStore/domain transition ownerである。

## 42. Revision

- revisionはmonotonic aggregate versionまたは同等のfencing tokenである。
- creation revision、increment rule、terminal behaviorをStore contractで固定する。
- client DTOのversionやProvider revisionと混同しない。
- revision overflow/corruptionはsafe unavailable/corrupted statusである。
- revisionをsecurity tokenとして使用しない。
- multi-record invariantはtransaction/outboxで補完する。
- ownerはData Platformである。

## 43. Outbox

- domain mutationとoutbox appendを同一durable transactionへ含める。
- outbox deliveryはat-least-onceでconsumer dedupeを要求する。
- eventはversion、safe aggregate handle、revision、event classを持つ。
- restricted payloadをdefaultで含めない。
- delivery failureはdomain commitをrollback済みと偽らない。
- cleanup/retentionはTBDである。
- ownerはMessaging/Data Platformである。

## 44. Inbox

- Webhook/queue external eventをvalidation後Inboxへcreate-if-absentする。
- event identityはprotected formでdedupeする。
- signature proof result、binding version、received clockをsafe metadataで保持する。
- duplicateはprior acknowledgementを安全にreplayする。
- out-of-order eventはjob revisionとtransition policyで処理する。
- raw payload retentionはrestricted Store policyに従う。
- ownerはProvider Integration/Messaging Platformである。

## 45. Durable Clock

```ts
type WorkflowClock = {
  now(): string;
};
```

- Production logicで`Date.now()`、`new Date()`を直接使用しない。
- timestampはUTC canonical formatとし、`.000Z`強制要否はTBDである。
- DB timeをclaim/lease truthに使うかはStore adapter contractで固定する。
- test clockはdeterministic progressionを提供する。
- token expiry、retention、billing timestampは各policy ownerを持つ。

## 46. Monotonic Time Policy

- wall-clock timestampとelapsed durationを分離する。
- timeout/latency測定はmonotonic sourceを使用する。
- durable expiry/orderingはapproved authoritative clockを使用する。
- process monotonic clockはinstance間比較に使用しない。
- clock skew時のlease takeoverとtoken expiryを定義する。
- backward jumpでterminal stateを再開しない。
- ownerはRuntime/Data Platformである。

## 47. ID Generation

- internal primary key、public Reference、claim ID、outbox event ID、correlation、billing identityを分離する。
- Provider referenceとformal Asset IDも別domain identityである。
- Production entropy sourceはSecurity/Runtime ownerが承認する。
- Reference deterministic IDをProductionで使用しない。
- public Referenceはunguessable、opaque、versioned、revocableである。
- correlation IDをauthorizationやidempotencyに使用しない。
- concrete algorithmはTBDである。

## 48. Protected Identity

- raw idempotency key、public Reference、provider job reference、tenant valueはprotected lookup identityへ変換する。
- protection schemeはdomain separationとkey rotationを考慮する。
- protected identityも無制限にlogしない。
- equality lookupとsecurity capabilityを混同しない。
- Store APIがraw keyを受けるかserviceで変換するかはV1 Foundation実装前に固定する。
- 推奨はdedicated identity protector経由でStoreへprotected formを渡す方式である。
- ownerはSecurity/Data Platformである。

## 49. Accepted Persistence Store

- acceptance key、accepted kind、Gate/Poll state、restricted input refを保持する。
- materializer binding、provider/API binding、original input ref、expiry、revisionを保持する。
- Story、Lyrics、Scene、Prompt、adapter body本文を保存しない境界を維持する。
- create-if-absent、get、CAS、expire、deleteを提供する。
- accepted response前にdurable commitする。
- authorization ownershipとregionを持つ。
- existing Reference accepted persistenceはcontract test adapterとして再利用する。

## 50. Poll State Store

- provider upload pending、asset item mapping、explicit itemIndex/assetIndexを保持する。
- session/handleをprotected storageとして保持する。
- revision、poll claim、terminal state、expiry、duplicate poll outcomeを定義する。
- clientへinternal stateを返さない。
- pending/ready/failed/expired/cancelled transitionをCASで保護する。
- lease expiryでupload submitを再実行しない。
- ownerはUpload Pipeline/Data Platformである。

## 51. Resume Record Store

- Resume Recordはcurrent resumable state、binding identity、restricted request ref、poll revision、operationを保持する。
- one active resume claimとrevisionを持つ。
- stateはmaterialization前、submit reserved、submit unknown、job accepted等を区別する。
- raw adapter requestやprovider referenceはprotected storeへ分離する。
- get/create/CAS/claim/expire/deleteを定義する。
- terminal workflowへresumeしない。
- ownerはResume Pipelineである。

## 52. Resume Journal Store

- Resume Journalはattempt history、safe reason、transition、timestamp、outcome classを保持する。
- Recordのcurrent truthを代替しない。
- raw request、Asset ID、Provider reference、credential、fingerprintを保存しない。
- append event identityでduplicateを防ぐ。
- operator-assisted transitionを明示する。
- retention/hold policyはTBDである。
- ownerはResume Pipeline/Audit Governanceである。

## 53. Materialization Idempotency Store

- namespace ownerはMaterializerである。
- reserve、lookup、commit result、commit unknown、mark conflict、expireを提供する。
- same protected key/same fingerprintはprior safe resultをreplayする。
- different fingerprintはconflictである。
- materialized bodyそのものをidempotency recordへ保存しない。
- expired signed URLはsame semantic operationのrepair policyへ送る。
- TTLはTBDである。

## 54. Generation Idempotency Store

- generation-submit namespaceをdurableに所有する。
- submit reserved、submitted accepted、unknown、terminal-safe failureを区別する。
- acceptance unknownをretryable submitへ自動変換しない。
- provider idempotency support有無をbinding metadataで評価する。
- raw key/fingerprint/provider referenceをsafe diagnosticsへ出さない。
- operator repairとlookup結果をjournalできる。
- ownerはGeneration Pipelineである。

## 55. Generation Job Store

- statesはpending、completed、failed、cancelled、expired、unknown、reconciliation-requiredを含む。
- operation、provider binding、revision、claim、next poll eligibilityを保持する。
- webhook correlation、terminal output DTO、retry class、expiry、cancellation stateを保持する。
- job referenceはsensitive protected storageである。
- `providerSubmitMayRun`等の再実行許可は独立stage/invariantとして明示する。
- Materializer/submitはjob存在だけを理由に再実行しない。
- ownerはGeneration Pipeline/Worker Platformである。

## 56. Generation Poll Idempotency Store

- generation-poll namespaceをsubmit namespaceから分離する。
- poll attempt、job revision、provider response class、next eligibilityを関連付ける。
- duplicate pollはprior safe outcomeを返すかcurrent job truthを再読する。
- poll unknownはsubmit unknownと混同しない。
- concurrent API/worker/webhook transitionをCASで調整する。
- TTLはjob lifecycle/retention ownerがTBDとして決定する。
- ownerはGeneration Poll Pipelineである。

## 57. Output Ingestion Idempotency Store

- output identity、binding version、expected output class、ingestion stageをprotected formで保持する。
- fetch、inspect、scan、store、register、finalizeの各stageを区別する。
- duplicate download/storage writeをformal Asset commitで収束させる。
- partial multi-outputをreconciliation可能にする。
- provider URLをresultやdiagnosticsへ保存しない。
- commit resultはformal Asset identityのsafe internal referenceを返す。
- ownerはOutput Ingestion/Asset Platformである。

## 58. Final Result Store

- commit onceとCASを要求する。
- completed、degraded、partial、failed、cancelledのterminal semanticsを定義する。
- terminalはapproved repair以外immutableである。
- formal Assets、safe reasons、version、tenant/region、retention/deletionを保持する。
- Provider URLやstorage locatorを保持するclient projectionを作らない。
- Result Reference発行は同一transactionまたはoutbox-backed invariantで結合する。
- ownerはWorkflow Service/Data Platformである。

## 59. API Idempotency Store

- start、poll-upload、poll-generation、result、cancelをcommand-scoped namespaceで分離する。
- principal/tenant/region/operation scopeとsemantic fingerprintをprotected formで結合する。
- pending、terminal response、unknown、conflictを表現する。
- same key/different commandを衝突または別namespaceとして明示する。
- raw HTTP bodyやheaderを保存しない。
- replayはsafe DTOのみ返す。
- ownerはWorkflow API Platformである。

## 60. Result Reference Vault

- opaque public token、protected index、internal result identity、kind、operationを保持する。
- owner、tenant、region、expiry、revocation、deletion、legal holdを保持する。
- terminal snapshot relationをrevision付きで固定する。
- raw tokenをdatabase primary keyとして直接使わない方針を推奨する。
- unauthorized/missing/revokedはnon-enumerating safe resultへ投影する。
- Reference Vault interface semanticsをcontract testとして共有する。
- ownerはSecurity/Data Platformである。

## 61. Restricted Input Store

- encrypted payload、envelope metadata、schema、operation、adapter ID/versionを保持する。
- tenant、region、expiry、deletion、legal hold、safe fingerprint、key versionを保持する。
- plaintextは必要最小scope/時間だけ解決しStore外へ長時間保持しない。
- readはscoped authorizationとpurposeを必要とする。
- log、Audit payload、Result、Reference、browserへ本文を出さない。
- corruption/key unavailableはsafe statusとreconciliationへ送る。
- ownerはPrivacy/Data Platformである。

## 62. Original Input Store

- user-provided original inputをrestricted classificationで保持する。
- adapter request recordとは別schema/lifecycleである。
- operation、owner、tenant、region、schema、key versionを保持する。
- access purposeはresume、support、deletion等に限定し監査する。
- retention/deletion/legal holdはTBD policyに従う。
- workflow browser Sessionへ内容を複製しない。
- ownerはWorkflow Entry/Privacyである。

## 63. Auth Session Store

- Production Auth Runtimeの依存でありReference Auth Storeを再利用しない。
- session identity、principal projection source、revocation、rotation、expiryを保持する。
- account/tenant membership、MFA class、region、logout/deletion semanticsを扱う。
- token、email、provider claimsをWorkflow Runtimeへ流さない。
- Workflow transactionとのatomicityは不要をdefaultとし再authorizationで整合する案を比較する。
- identity productはTBDである。
- ownerはIdentity Platformである。

## 64. CSRF Store

- CSRF proofをauthenticated sessionへbindする。
- token digest、rotation generation、expiry、revocationを保持する。
- raw tokenをlog、Audit、Workflow Sessionへ保存しない。
- multi-tabとrotation overlap policyはSecurity ownerがTBDで決定する。
- mutation routeはinvalid/missing/expiredでfail closedする。
- Reference CSRF Storeはtest adapterに限定する。
- ownerはSecurity/Web Platformである。

## 65. Audit Store

- security、operator、policy、configuration、repair actionをsafe eventとして保持する。
- request/session/provider payloadのcopyではない。
- actor class、action、outcome class、policy version、safe aggregate handleを記録する。
- append-only semanticsとaccess controlを持つ。
- transaction参加が必要なdomain auditはoutboxと同時commitする。
- retention/legal hold/exportはTBDである。
- ownerはSecurity Audit/Data Governanceである。

## 66. Outbox Store

- domain Storeとtransaction参加できるinterfaceを持つ。
- append、claim batch、mark delivered、retry safe、dead-letter/reconciliationを定義する。
- event ID、aggregate revision、schema version、safe event typeを保持する。
- raw sensitive valuesをpayloadへ入れない。
- Store co-locationしない場合のatomicityはlaunch前に解決する。
- queue delivery modelはTBDである。
- ownerはMessaging/Data Platformである。

## 67. Provider Binding Registry

- descriptorはoperation、provider ID、API version、materializer/client/normalizer/ingestion bindingを持つ。
- availability、region、capability class、descriptor versionを持つ。
- secret、endpoint credential、tenant-specific key、selection score、mutable stateを含めない。
- arbitrary provider文字列castを禁止する。
- rolling deploymentではold/new binding versionをjob recordにpinする。
- Registry updateはimmutable snapshot交換で行う。
- ownerはProvider Integrationである。

## 68. Materializer Registry

- operation/provider bindingに対応するmaterializerをtyped descriptorで解決する。
- signed URL supportはReference Gate capabilityでありProduction Provider capabilityと同一視しない。
- binding versionはaccepted/resume/job recordへpinする。
- missing/incompatible materializerはconfiguration-invalidである。
- arbitrary string castとdefault fallbackを禁止する。
- restricted plaintext lifecycleを宣言する。
- ownerはMaterializer/Asset Platformである。

## 69. Pipeline Registry

- Vocal、Music、MVのoperation-specific resume/generation pipelineをdescriptorで登録する。
- existing `operationPipelineRegistry` semanticsをReference contract oracleとして利用する。
- supported operation、binding versions、expected outputs、capability requirementsを宣言する。
- mutable selection scoreやsecretを含めない。
- runtime configとregistry mismatchはreadiness falseである。
- jobは開始時registry versionをpinする。
- ownerはWorkflow Pipeline Teamである。

## 70. Credential Resolver Interface

- inputはcredential handle、provider、scope、tenant、region、operation、binding、baseline timeである。
- resultはresolved、expired、revoked、unauthorized、scope-mismatch、region-mismatch、unavailableである。
- resolved secretは短命execution contextでProvider Clientへ渡す。
- secretをlong-lived result、runtime singleton、job recordへ保持しない。
- resolver errorをsafe classificationへ変換する。
- rotation/revocation raceをProvider call stageで扱う。
- ownerはSecurity/Secrets Platformである。

## 71. Provider Client Factory

- operationとtyped binding descriptorから対応Clientを返す。
- arbitrary provider ID castは禁止する。
- request serializer ownerはbinding adapterである。
- Reference transport summaryをProduction request bodyに使用しない。
- Client lifetime、connection reuse、shutdownをfactory contractで定義する。
- credential execution contextをcall単位で受ける。
- ownerはProvider Client Platformである。

## 72. Provider Job Lookup

- protected job reference、binding version、credential contextを入力とする。
- lookupはsubmitを実行しない。
- completed、pending、failed、cancelled、expired、not-found、unknownをvalidation後に返す。
- not-foundをnon-acceptanceと即断しない。
- raw provider response/errorを上位へ返さない。
- timeout/unknownはreconciliation対象である。
- ownerはProvider Integrationである。

## 73. Provider Poll Client

- existing Reference Generation Job Poll Clientのsemantic interfaceを共有可能とする。
- Production Clientはreal transport、credential、timeout、rate、validationを実装する。
- pollingはidempotent read semanticsを前提としbindingで確認する。
- ClientはWorkflow Storeを直接変更しない。
- late responseはjob CAS前に再検証する。
- shutdown/abort resultをunknownまたはsafe retry classへ分類する。
- ownerはProvider Integration/Worker Platformである。

## 74. Provider Webhook Adapter

- provider routing、signature verification、event ID extraction、schema validationを所有する。
- safe normalized eventだけをInbox processorへ渡す。
- secret/signature materialをevent resultへ保持しない。
- replay windowとclock policyはbinding-specific TBDである。
- acknowledgement timingはInbox durable commit後を推奨する。
- unsupported versionはsafe reject/monitor outcomeである。
- ownerはProvider Integration/Securityである。

## 75. Asset Resolver

- logical assetをauthorized internal access capabilityへ解決する。
- owner、tenant、region、operation、lifecycle、MIME、deletionを検証する。
- storage locatorをWorkflow Resultへ返さない。
- provider-facing materialization capabilityとbrowser-facing delivery capabilityを分離する。
- Reference resolver interfaceはcontract testに利用する。
- expired capabilityはpolicyに従いrematerialization/reconciliationする。
- ownerはAsset Platformである。

## 76. Provider Upload Store

- accepted upload、pending handle、item mapping、provider binding、revisionをdurableに保持する。
- protected provider session/reference、expiry、poll eligibility、claimを管理する。
- upload submit acceptance unknownを明示する。
- duplicate poll/resumeをidempotentにする。
- provider upload clientはStoreを直接更新しない。
- cleanup/deletion stageを持つ。
- ownerはProvider Upload Platformである。

## 77. Output Ingestion

- Runtime dependencyはingestion registry/serviceとidempotency Storeをbundleする。
- provider output validation、fetch、inspect、scan、asset store、formal registrationを分離する。
- external fetchはtransaction外で行う。
- final Asset commitとoutboxをtransactionで結合する。
- partial/unknown outcomeはingestion journal/reconciliationへ送る。
- raw output referenceをsafe Resultへ出さない。
- ownerはOutput Ingestion/Asset Platformである。

## 78. Asset Delivery Dependency

- authenticated preview/download serviceへのserver-only dependencyである。
- Workflow Resultはlogical Asset DTOだけを返す。
- delivery capability発行はauthorization、expiry、revocation、MIME、scan/deletionを検証する。
- signed delivery URL採用はTBDである。
- runtime graphにbrowser URLを長期保存しない。
- provider-facing signed URLとdelivery URLを分離する。
- ownerはAsset Delivery Platformである。

## 79. Authorization Dependency

- commandごとにprincipal、tenant、region、operation、ownership、permissionを評価する。
- deletion、legal hold、account status、billing entitlementもpolicy inputである。
- Reference possessionのみでauthorizeしない。
- decisionはallow/denyとsafe policy metadataだけを返す。
- token/email/raw claimsをWorkflow Runtimeへ渡さない。
- stale decisionをlong-running jobの権限証明に使わない。
- ownerはAuthorization Platformである。

## 80. Billing Dependency

- estimate、reservation、provider accepted/completed、ingested、cancel、unknown、refundを別eventとして扱う。
- billing identityをidempotency keyと分離する。
- external billing callをworkflow transactionへ入れない。
- outbox/sagaでledgerへ連携しreconciliationする。
- entitlement checkとfinancial settlementを分離する。
- product/ledger implementationはTBDである。
- ownerはBilling Platformである。

## 81. Rate Limit Dependency

- command、operation、principal/tenant protected scopeに基づくdistributed decisionを返す。
- raw identifierをmetrics/logへ出さない。
- limit unavailable時のfail-open/closedはcommand risk別にTBDである。
- rate limitはauthorization/idempotencyの代替ではない。
- retry adviceはsafe bounded classである。
- worker/provider concurrency controlとは別dependencyである。
- ownerはAPI Platform/Abuse Preventionである。

## 82. Observability Dependency

- metrics、trace、safe audit、health、structured safe eventを分割する。
- operation、stage、status class、provider class等のbounded dimensionsだけを許可する。
- Reference、Asset ID、tenant raw、Story、Lyrics、Scene、Prompt、Credentialを禁止する。
- provider output reference、fingerprint、idempotency key、raw errorも禁止する。
- observability failureがdomain transactionを不正にrollbackしないようoutbox等で扱う。
- high-cardinality budgetを持つ。
- ownerはObservability/Securityである。

## 83. Health Dependency

- dependency healthをrequired/optional、read/write、operation/binding scopeで評価する。
- health probeはside effectを起こさない。
- raw endpoint、secret、schema detailをpublic health responseへ出さない。
- degraded providerとruntime-wide unavailableを区別する。
- cached healthのageとfallback policyはTBDである。
- readiness/liveness decisionへsafe aggregateを提供する。
- ownerはSRE/Runtime Platformである。

## 84. Runtime Consumer Contracts

- 各consumerはrequired bundle、capability、transaction、idempotency、claim、external I/O、shutdownを宣言する。
- undeclared dependency accessは禁止する。
- read/write Store methodをleast-privilege viewに分割可能とする。
- consumer versionとruntime versionを起動時に検証する。
- operator consumerは通常consumerより強いaudit requirementを持つ。
- contract testsはconsumer fake runtimeで不足依存を検出する。
- ownerは各consumer teamである。

## 85. API Request Lifecycle

- parse/bounds → authenticate → CSRF → authorize → rate/capability → validateの順で進む。
- API idempotency reserve transactionを行う。
- external I/Oが必要ならcommit後に実行する。
- outcome validation後journal/CAS/outbox transactionを行う。
- safe DTOへ投影しraw errorを隠す。
- timeout/abort後もdurable stateをreconcileできる。
- shutdownはnew I/O前に拒否する。

## 86. Upload Poll Lifecycle

- Referenceをauthorize/resolutionしPoll Stateをreadする。
- due/pending/terminal/expiredを分類する。
- WorkerまたはAPIがpollする場合はclaim/leaseを取得する。
- provider lookupはtransaction外で行う。
- journalとCASでready/pending/failureをcommitする。
- ready assetはResume workをoutboxへ発行する。
- duplicate/late resultはterminalを上書きしない。

## 87. Resume Lifecycle

- Resume RecordとJournalからcurrent stageを読みclaimする。
- restricted requestをauthorized short-lived plaintextとして解決する。
- materialization idempotencyをreserveしてtransactionをcommitする。
- materialize/Provider submitはtransaction外で行う。
- unknown acceptanceをjournalしlookup/reconciliationへ送る。
- accepted jobをGeneration Job StoreへCAS/outbox commitする。
- lease expiryだけでmaterialize/submitを再実行しない。

## 88. Generation Poll Lifecycle

- Job ReferenceをauthorizeしGeneration Jobをreadする。
- terminalならsafe replayする。
- dueならpoll idempotencyとleaseをreserveする。
- Provider lookupをtransaction外で実行しvalidateする。
- pendingはnext eligibility、terminalはingestion stageをCASする。
- completed output ingestionは別idempotent stageである。
- webhook/late poll raceはrevisionで収束する。

## 89. Webhook Lifecycle

- route binding → signature/replay/schema validationを行う。
- Inbox create-if-absent transactionをcommitする。
- duplicateはsafe acknowledgementを返す。
- async processorがjobをresolve/authorizeしclaimする。
- normalized eventをCAS/journal/outboxへ適用する。
- heavy ingestionはrequest thread外で行う。
- missing job/out-of-orderはreconciliationへ送る。

## 90. Reconciliation Lifecycle

- due reconciliation caseをdurable queryしleaseする。
- submit unknown、poll unknown、webhook missing、commit unknown等を分類する。
- safe provider lookupやStore comparisonを行う。
- resultはresolved、still-pending、manual-repair、terminal-failed、conflictである。
- transition/journal/outboxをCAS transactionでcommitする。
- guessによるresubmit/terminal overwriteは禁止する。
- ownerとbudgetはcase typeごとに定義する。

## 91. Cancellation Lifecycle

- workflow cancellation requestをauthorize/idempotency/CASでcommitする。
- provider cancellation requestをoutboxで別stageへ送る。
- external provider cancelはtransaction外で行う。
- confirmation、cleanup、billing adjustment、final resultを別stateでcommitする。
- late provider completionとcancel raceをreconcileする。
- one `cancelled`で全stage完了を意味させない。
- duplicate cancelはprior safe stateを返す。

## 92. Deletion Lifecycle

- deletion requestをauthorizeしlegal hold/ownershipを確認する。
- deletion-pending tombstoneをtransactionでcommitしnew work/deliveryを停止する。
- restricted records、assets、references、indexes、provider copiesをstaged cleanupする。
- billing/audit/legal evidenceはpolicyに従う。
- concurrent poll/reconciliationはtombstoneを尊重する。
- partial deletionはdurable journalからresumeする。
- completion SLA/retentionはTBDである。

## 93. Error Model

```text
configuration | unavailable | timeout | conflict | unauthorized
invalid | corrupted | unknown-outcome | reconciliation-required
```

- Runtime Interfaceはraw DB、queue、KMS、provider errorを返さない。
- errorはsafe code、retry class、stage class、owner classへmapする。
- timeoutとunknown outcomeを区別する。
- programming invariant violationはinternal safe errorとalertを生成する。
- client projectionはさらにAPI safe DTOへ変換する。

## 94. Unknown Outcome

- external side effect、transaction commit、delivery acknowledgementの成否不明を表す。
- failureやretryableと同義ではない。
- idempotency claimとjournalを保持しblind retryを禁止する。
- provider lookup、Store reread、outbox/inbox確認で解決する。
- unresolvedはreconciliation-requiredまたはmanual-repairへ移る。
- userにはsafe pending verificationとして投影する。
- ownerはcausing stage domainである。

## 95. Retry Model

- safe retry、lookup後conditional retry、unsafe retry、terminalを明示する。
- transaction serialization retryとexternal I/O retryを分離する。
- top-level transaction callback retryは副作用を含まない場合だけ許可する。
- Provider submit retryはidempotent provider guaranteeまたはnon-acceptance証明が必要である。
- budget/backoff/jitter数値はTBDである。
- exhaustionはreconciliation/terminal-safe resultへ移る。
- retry reasonをsafe metricsで観測する。

## 96. Conflict Model

- reservation fingerprint conflict、revision conflict、lease conflict、binding/version conflictを区別する。
- conflictは必ずしもsystem errorではない。
- same command duplicateはexisting outcomeへ収束できる。
- stale writerはrereadしterminal truthを尊重する。
- conflict解消のunconditional writeは禁止する。
- unresolved invariant conflictはreconciliation/manual repairである。
- raw compared valuesをIssueへ返さない。

## 97. Duplicate Model

- HTTP retry、queue redelivery、webhook replay、scheduler overlap、multi-tabを通常のduplicate sourceとする。
- namespace idempotencyとInbox/Outbox identityで収束する。
- same semantic duplicateは同じsafe resultまたはcurrent truthを返す。
- different semantic inputはconflictである。
- duplicate external responseもCASでterminalを保護する。
- billing/delivery consumerも独自dedupeを持つ。
- duplicate countはbounded metricで観測する。

## 98. Partial Failure

- reserve commit成功/I/O未実行、I/O成功/journal失敗、journal成功/final CAS conflict等を別caseとする。
- outbox commit/delivery partial、multi-output ingestion partial、deletion partialも対象である。
- durable stage markerとjournalから再開する。
- compensationは明示された場合だけ行う。
- partial stateをcompletedと投影しない。
- repair pathがないpartial stateはstop conditionである。
- failure injection testを必須とする。

## 99. Security

- Runtimeはserver-only、least privilege、fail closed、explicit authorizationを原則とする。
- secret、restricted payload、raw identityをbundle propertyとして公開しない。
- consumerごとにStore/Provider capabilityを最小化する。
- runtime configとregistry changeをaudited/versionedにする。
- Reference fallback、in-memory fallback、client overrideは禁止する。
- dependency responseはuntrustedとしてvalidateする。
- ownerはProduct Security/Runtime Architectureである。

## 100. Sensitive Data

- Story、Lyrics、Scene、Prompt、credential、Provider output Reference、raw identifiersをrestrictedとする。
- plaintextはauthorized purposeとshort lifetimeに限定する。
- Storeはencryption/key version/region/deletion policyを持つ。
- Runtime error、health、log、metric、trace、Audit payloadへ流さない。
- deep-copy/serialization boundaryでunintended aliasingを防ぐ。
- test fixtureもproduction secretと識別可能にする。
- static/dynamic leakage scanをacceptanceに含める。

## 101. Logging

- allowed dimensionsはoperation、stage、status class、provider class、duration class、retry class、region class、safe reason codeである。
- Reference、Asset ID、tenant raw、payload、credential、provider reference、fingerprint、idempotency key、raw errorを禁止する。
- structured loggerはallowlist projectionを要求する。
- Store/SDK error objectをspreadしない。
- correlationはapproved safe handleを使用する。
- high-cardinality budgetを設定する。
- retention/samplingはTBDである。

## 102. Audit

- lifecycle、security decision、operator repair、configuration、binding rolloutをsafe auditする。
- domain transactionと必要なaudit/outboxのatomicityを定義する。
- Auditはraw request/session/provider responseのcopyではない。
- actor class、action、outcome class、policy version、safe aggregate handleを保持する。
- audit unavailable時のcommand fail policyはrisk別にTBDである。
- access/retention/legal holdはgovernance ownerが決定する。
- audit failureもsafe observabilityへ出す。

## 103. Metrics

- runtime initialization、readiness、transactions、claims、leases、outbox、inbox、reconciliationを計測する。
- operation/stage/status/provider class等のbounded labelsだけを使用する。
- raw identifiersとdynamic errorsをlabelにしない。
- backlog、oldest due、unknown outcome ageを観測する。
- histogram bucketsとthresholdはTBDである。
- Reference/staging/productionをsafe environment classで区別する。
- ownerはSRE/Observabilityである。

## 104. Tracing

- API、transaction、worker、provider、ingestion、outboxをapproved contextで関連付ける。
- transaction ID、credential、payload、Reference、Asset ID、raw provider detailをspanへ入れない。
- Provider headersをallowlistせずcopyしない。
- trace contextはauthorization/idempotency identityではない。
- samplingはTBDかつprivacy-reviewedである。
- async delivery linkを安全に表現する。
- accessはleast privilege/auditedである。

## 105. Testing

- runtime composition contractでcomplete graphとpartial publish禁止を検証する。
- Store interface contract、transaction fake、claim/lease、idempotency、CAS、outboxを検証する。
- shutdown、corruption、version mismatch、unknown outcomeをfailure injectionする。
- Reference adapter compatibilityをshared contract suiteで維持する。
- static server-only boundaryでclient importを拒否する。
- concrete DB integrationは次工程であり本Contractでは実行しない。
- multi-process testsはProduction adapter acceptanceに必須である。

## 106. Reference Adapter

- Reference Adapterはsubset/test implementationとしてProduction interface semanticsを実装できる。
- durable/distributed/production security capabilityをfalse/unsupportedとして表現する。
- globalThis、Symbol.for、in-memory StoreはReference adapter内部に隔離する。
- unit、local integration、fixture、contract、developer UIで保持する。
- Production Composition Rootからimport/fallbackしない。
- deterministic clock/IDをProduction entropyとして使用しない。
- ownerはReference Workflow Maintainerである。

## 107. Production Adapter

- Production Adapterはexternal durable implementation、distributed coordination、production securityを提供する。
- concrete productは本ContractではTBDである。
- 各adapterはshared Store/runtime contract suiteとproduct-specific integration testを通す。
- raw SDK errorをsafe Runtime errorへmapする。
- lifecycle、health、shutdown、version migrationを実装する。
- in-memory fallbackは禁止する。
- ownerは各Platform teamである。

## 108. Migration Strategy

- Phase A: server-only pure interface/typesとstatic boundaryを確定する。
- Phase B: Reference Adapterをshared contractへ適合させ既存behaviorを維持する。
- Phase C: transaction/clock/ID fakeとStore conformance suiteを実装する。
- Phase D: Production Store/transaction adaptersを製品選定後に実装する。
- Phase E: API consumerをProduction Runtime injectionへ移す。
- Phase F: Worker/Scheduler/Webhook/Reconciliation consumerを追加する。
- Phase G: Production auth/provider/asset deliveryをbindingする。
- 各phaseはReference fallbackなしでrollback/stop可能にする。

### Interface Placement Plan

| Option | Benefit | Risk | Decision |
|---|---|---|---|
| all under `lib/server/productionWorkflowRuntime/**` | strongest server-only boundary | pure fakes also server-only | Recommended for V1 |
| pure types under `lib/productionWorkflowRuntime/**` | easier isolated imports | accidental client exposure of internal shapes | Not recommended by default |
| split types and concrete adapters | modular | barrel discipline required | only after static proof |

- Candidate files are `types.ts`、`storeTypes.ts`、`providerTypes.ts`、`createProductionWorkflowRuntime.ts` under server-only root。
- exact placement is Foundation implementation decision gated by import tests。

## 109. Acceptance Gates

- Runtime graph型がCore、Stores、Provider、Security、Observability、Lifecycleに分割される。
- Store bundleと各Store owner/version/error semanticsが確定する。
- Transaction Manager、Context lifetime、nesting禁止、external I/O boundaryが確定する。
- standard reserve/I/O/journal/CAS/outbox patternが確定する。
- claim、lease、heartbeat、clock、ID、protected identityが確定する。
- Reference Adapter方針とProduction fallback禁止が確定する。
- capability/readiness/lifecycle/shutdown/drainが確定する。
- Provider/Credential/Auth/Observabilityのserver-only境界が確定する。
- static client import prohibitionとcontract test strategyが確定する。
- open decisionがTBDとしてowner/stop impactを持つ。

## 110. Stop Conditions

- transaction ownerまたはStore間atomicityが不明なら停止する。
- external Provider I/Oをtransaction内に含める設計なら停止する。
- cross-instance idempotencyが未定義なら停止する。
- lease expiry後にProvider submitを再実行できるなら停止する。
- stale/late responseがterminalを上書きできるなら停止する。
- Result ReferenceとFinal Resultの整合方法が不明なら停止する。
- Restricted Input暗号化ownerまたはCredential secret lifetimeが不明なら停止する。
- Reference Runtimeまたはin-memory StoreへProduction fallbackするなら停止する。
- readinessがrequired Store/schema/migration/capabilityを検証しないなら停止する。
- version mismatchで起動継続するなら停止する。
- client bundleへRuntime型、Store shape、DB/queue/KMS SDKが露出するなら停止する。
- raw database/queue/provider errorをAPIへ返すなら停止する。
- concrete製品選定がinterface semanticsを不当に先行決定するなら停止する。
- repair不能なunknown/partial outcomeが存在するなら停止する。

## 111. Open Questions

- Runtimeを現在のbundle案で確定するか、さらにleast-privilege consumer viewsへ分けるか。
- Transaction Managerの最終ownerはData PlatformかWorkflow Platformか。
- どのStoresを同一transaction domainへco-locateするか。
- Outboxはdomain DBと共有するか。
- Queue delivery modelは何か。
- Lease duration/policy ownerは誰か。
- DB authoritative timeを使用するか。
- Public Reference entropy/protection方式は何か。
- Schema migration approval/operations ownerは誰か。
- Multi-region write modelはsingle-writerか別方式か。
- Auth StoreとWorkflow Storeにtransaction関係が必要か。
- Billing ledgerとのtransaction/saga関係は何か。
- Deletionをprovider/asset/backupへどう伝播するか。
- Provider binding rolloutとrollback policyは何か。
- Runtime config sourceとsecret handle sourceは何か。
- Worker process topologyとstage separationは何か。
- Readiness dependency thresholdは何か。
- Graceful shutdown timeoutは何か。
- すべてTBDであり、製品や数値を推測して決めない。

## 112. Final Readiness

| Area | Interface defined | Reference implementation available | Production implementation available | Contract tests available | Concrete integration selected | Blocking issue | Next step |
|---|---:|---:|---:|---:|---:|---|---|
| Composition Root | Yes, design | Reference only | No | Partial | No | product graph not implemented | server-only types |
| Runtime Lifecycle | Yes, design | Process-local partial | No | Partial | No | durable drain absent | lifecycle contract tests |
| Transaction | Yes, design | No durable | No | No | No | transaction product/adapter | fake and conformance |
| Clock | Yes, design | deterministic fixtures | No | Partial | No | authoritative clock TBD | clock interface |
| ID generation | Yes, design | deterministic | No | Partial | No | entropy/protection TBD | ID interfaces |
| Accepted Store | Yes, design | Yes, memory | No | Partial | No | durable adapter | shared Store contract |
| Poll Store | Yes, design | Yes, memory | No | Partial | No | claim/lease adapter | shared Store contract |
| Resume Store | Yes, design | Yes, memory | No | Partial | No | Record/Journal durability | split interfaces |
| Idempotency Stores | Yes, design | Yes, memory | No | Partial | No | cross-instance claims | namespace contracts |
| Job Store | Yes, design | Yes, memory | No | Partial | No | durable job/lease | Store contract |
| Final Store | Yes, design | Yes, memory | No | Partial | No | final/vault atomicity | invariant contract |
| Reference Vault | Yes, design | Yes, memory | No | Partial | No | durable protected index | vault contract |
| Restricted Store | Yes, design | fixture/memory | No | Partial | No | encryption/KMS owner | restricted interface |
| Auth/CSRF | Yes, design | fixtures | No | Partial | No | provider/session Store | Security Runtime |
| Provider Runtime | Yes, design | Reference clients | No | Partial | No | real binding selection | registry/factory types |
| Credentials | Yes, design | fixture handles | No | Partial | No | vault/resolver | resolver contract |
| Scheduler | Yes, design | No production | No | No | No | queue/topology | consumer interface |
| Webhook | Yes, design | No production | No | No | No | provider support/inbox | adapter interface |
| Reconciliation | Yes, design | Reference paths | No | Partial | No | durable cases/worker | result union/tests |
| Asset Delivery | dependency defined | presentation only | No | No | No | authenticated delivery | separate Contract/adapter |
| Observability | Yes, design | safe diagnostics | No | Partial | No | backend/policy | safe interfaces |
| Shutdown | Yes, design | process reset only | No | Partial | No | drain/lease handoff | lifecycle tests |

- Production Runtime Interface design is defined by this Contract, but implementation is not started。
- Reference Foundation remains complete within its declared scope。
- Production Runtime、Real Provider、Production UI remain not ready。
- 次に実装すべきFoundationはserver-only Runtime interface/types、transaction fake、Store contract suiteである。
- Production実装開始可能性はInterface Foundation着手のみYes、Production connection/launchはNoである。
- Concrete product selectionはInterface acceptance後の別Contract/ADRで行う。
- Section 110のstop conditionが一つでも成立する間はProduction adapter接続を禁止する。

## Foundation Implementation

- Foundation MVPは`lib/server/productionWorkflowRuntime/**`へserver-only型として配置する。
- Runtime bundle、capability、consumer、transaction、Store、Provider、Security、Observability、Lifecycleを責務別moduleへ分割する。
- Reference transaction managerはcontract test専用であり、durable／cross-instance／production-readyをすべてfalseとする。
- Reference compatibility adapterは必須Production capabilityを`unavailable`として公開し、Production fallbackを禁止する。
- external Provider I/Oはtransaction contextから静的に分離し、contextは`externalIoAllowed: false`を持つ。
- Store interfaceはprotected identity、named revision、CAS、claim／lease fencing、terminal overwrite拒否を固定する。
- Runtime validatorはversion、bundle、required capability、Store method shape、duplicate Store reference、lifecycle/provider shapeをsafe resultで監査する。
- Foundation testは500,000件以上のconsumer、capability、claim kind、revision、replay matrixを含む。
- このFoundationはconcrete durable Store、Production Composition Root、real Provider、Production接続を実装しない。
