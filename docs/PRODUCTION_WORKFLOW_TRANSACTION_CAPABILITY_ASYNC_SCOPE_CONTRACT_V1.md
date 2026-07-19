# Production Workflow Transaction Capability / Async Scope Contract V1

Status: Design contract

Scope: server-only durable transaction capability and async lineage ownership

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose

- Production durable Storeが一つの物理connection上でatomic mutationを実行できる正式境界を定める。
- Reference Transaction Manager V1を変更せず、Production database capabilityを別versionとして定義する。
- independent concurrent transactionとsame async lineage nested transactionを区別する。
- AsyncLocalStorageの利用目的をnested scope detectionだけに限定する。
- PostgreSQL Driver、Transaction Adapter、Store Adapterの責務を分離する。
- commit unknown、rollback、connection discard、context expiryをfail closedで扱う。
- 本Contract完成はConcrete Store AdapterまたはProduction接続完成を意味しない。

## 2. Decision Summary

- Reference Transaction Manager V1は既存のまま維持する。
- Production Durable Transaction Manager V2を新しいserver-only interfaceとして追加する。
- V2 callbackはexplicit transaction-bound query capabilityを受け取る。
- AsyncLocalStorageはsame async lineageのnested transaction検出だけを所有する。
- AsyncLocalStorageをDB connection locatorとして使用してはならない。
- Production Runtime bundleへの接続は別Foundationでversioned migrationとして行う。
- Production接続とProduction launchは引き続き禁止する。

## 3. Normative Sources

- `PRODUCTION_WORKFLOW_RUNTIME_INTERFACE_CONTRACT_V1.md`をRuntime責務の上位Contractとする。
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`をStore atomicityの上位Contractとする。
- `POSTGRESQL_VERSION_DRIVER_MIGRATION_TOOL_SELECTION_ADR_V1.md`を製品とDriverの決定根拠とする。
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`をSlice A schema semanticsの根拠とする。
- 本Contractは上位文書のReference V1 semanticsを遡及変更しない。
- 文書間で矛盾が見つかった場合は実装を進めずContract ownerへ戻す。

## 4. Current Implementation Evidence

- `transactionTypes.ts`の`WorkflowTransactionContext`はReference専用literal scopeを持つ。
- 同Contextはquery executorを持たない。
- `referenceWorkflowTransactionManager.ts`はcallback orchestrationとafter-commitだけを提供する。
- Reference managerのinstance-local `active`はparallelとnestedを区別しない。
- `runtimeTypes.ts`はCoreにV1 `WorkflowTransactionManager`を直接保持する。
- PostgreSQL Driverはdedicated checked-out Clientとtransaction connectionを既に提供する。
- Store Contractはdurable atomicityを要求するがConcrete SQL adapterは未実装である。

## 5. Current Gap

- Reference callback ContextからPostgreSQL transaction connectionへ到達できない。
- Store Adapterが同一transaction connectionを明示的に受け取る型がない。
- Reference scope literalをProduction scopeとして偽装できない。
- V1 managerは同一instanceの独立並行実行とnested実行を識別できない。
- completion後にqueryを拒否するdatabase capability lifecycleがV1にない。
- commit acknowledgement lossをV1 result unionだけでは精密に表現できない。
- このgapをcast、global flag、implicit connection lookupで埋めてはならない。

## 6. Reference Transaction Contract V1

- V1はReference Runtimeのcallback orchestration用である。
- scopeは`opaque-reference-transaction-scope`である。
- durable database transaction connectionを表現しない。
- query capabilityを公開しない。
- process-local test double semanticsを提供する。
- durable、cross-instance、production-readyを宣言しない。
- V1の成功はPostgreSQL commit成功の証拠ではない。

## 7. V1 Parallel and Nested Limitation

- V1 `runInTransaction(operation)`は親Contextを入力に持たない。
- V1 callbackからmanagerを再呼出しした場合のlineage markerがない。
- instance-level active flagは全concurrencyをnestedと誤認する。
- active flagを外すとsame lineage nested transactionを許してしまう。
- module-global flagはmulti-runtime instance isolationを壊す。
- `globalThis`または`Symbol.for`によるscope共有は禁止する。
- V1 limitationはReference semanticsとして維持し、Productionへ昇格しない。

## 8. PostgreSQL Transaction Requirements

- 一transactionにつき一つのdedicated physical connectionを使用する。
- BEGINからCOMMITまたはROLLBACKまで同じconnectionを使用する。
- callbackへtransaction-bound query executorを明示的に渡す。
- Context completion後のqueryとhook登録を拒否する。
- PostgreSQL failed transaction stateでは通常query継続を拒否する。
- commit unknownをrollback成功として扱わない。
- rollback failureまたはconnection lossではconnectionをdiscardする。

## 9. Responsibility Separation

- Driver AdapterはPool、connection、query、codec、SQLSTATE分類を所有する。
- Transaction Adapterはcallback lifecycle、BEGIN options、commit、rollback、hooksを所有する。
- Async Scope Ownerはnested lineage detectionだけを所有する。
- Store Adapterはapproved statementとrow mappingを所有する。
- Runtime Composition Rootはversion-compatible bundle構築を所有する。
- Provider Adapterはtransaction Contextを受け取らない。
- 各ownerは他ownerのraw resourceを公開境界へ漏らしてはならない。

## 10. Why V1 Must Not Gain PostgreSQL Query Directly

- V1 Contextへqueryを追加するとReferenceとProduction database capabilityが混在する。
- optional queryは利用側にcapability分岐を強制する。
- Reference testがProduction atomicityを誤って証明したように見える。
- client-safe import graphへdatabase型が流出する危険が増える。
- V1 scope literalの意味が曖昧になる。
- V1 consumersへsemantic breaking changeを隠すことになる。
- よってdirect additionは採用しない。

## 11. Design Goals

- explicit capability ownershipを型で表現する。
- transaction connectionをcallback lexical lifetimeへ閉じ込める。
- independent concurrencyを許可する。
- same async lineage nested transactionを確実に拒否する。
- failure phaseからdefinite rollbackとunknown outcomeを区別する。
- external I/Oをtransaction外へ維持する。
- Concrete Store Contract suiteから再利用可能にする。

## 12. Non-goals

- Slice A Store SQLは定義しない。
- RepositoryまたはBusiness transitionは定義しない。
- Provider I/Oを実装しない。
- Production connection stringまたはcredentialを扱わない。
- retry loop、savepoint、distributed transactionを導入しない。
- migration、schema、indexを変更しない。
- V1 Runtime Composition Rootをこの文書だけで変更しない。

## 13. Terminology

- Durable Transaction: database commit semanticsを持つtransaction。
- Transaction Capability: callback中だけ有効な操作能力。
- Query Capability: approved parameterized statementを同一connectionで実行する能力。
- Async Lineage:一つのtop-level transaction callbackから派生したasync execution chain。
- Scope Owner: lineage markerの生成、参照、終了を管理するserver-only component。
- Context Escape: callback完了後に保持されたcapabilityを使用すること。
- Commit Unknown: COMMIT送信後の結果を確定できない状態。

## 14. Option A Overview

- Option Aは既存`WorkflowTransactionContext`を拡張する案である。
- optional database capability追加を一つのvariantとする。
- generic capability parameter追加を一つのvariantとする。
- scope literalのunion化を一つのvariantとする。
- 単一interfaceを維持できる利点がある。
- 一方でV1 semantic boundaryを曖昧にする。
- 本ContractではPrimaryとして採用しない。

## 15. Option A Backward Compatibility

- optional field追加はTypeScript上additiveでもsemanticにはbreakingになり得る。
- consumerがfield有無をruntime capability判定へ誤用する危険がある。
- generic parameterは既存型引数なし利用のdefault semanticsを必要とする。
- scope unionはReference-only literalを前提とするtestを変える。
- serialized boundaryではないためcompile成功だけで互換性を証明できない。
- V1 descriptor versionを据え置くことは不適切である。
- version migrationを伴わないOption Aは拒否する。

## 16. Option A Reference Impact

- Reference実装にdatabase-shaped no-op capabilityを持たせてはならない。
- optional executorを常にundefinedにするとconsumer分岐が増える。
- fake executorを提供するとdurability claimが過剰になる。
- Reference test reuseとProduction conformanceの境界が曖昧になる。
- after-commit semanticsだけのV1がdatabase lifecycleを背負う。
- V1 regressionの意味が変わる。
- Reference implementation維持の観点から不利である。

## 17. Option A Boundary and Misuse

- database capabilityがshared transaction type barrelから再exportされる危険がある。
- client bundleへのraw database contract流入を追加static testで防ぐ必要がある。
- optional capabilityをnon-null assertionで使用する誘惑が生じる。
- Store Adapter typingがcapability refinementへ依存する。
- serviceがProduction専用fieldへ依存するとReference testが利用不能になる。
- capability misuseの検出が実行時へ遅れる。
- separation of concernsの観点から採用しない。

## 18. Option A Versioning Assessment

- generic V2として完全に別名を付けるならOption Bに近づく。
- V1名のままfieldを追加する案は拒否する。
- scope unionだけの変更ではquery ownershipを解決しない。
- optional database capabilityは正式Store requirementを弱める。
- mandatory capabilityはReference実装を壊す。
- adapter overloadによる隠れた拡張はpublic contractを不透明にする。
- 総合評価は非推奨である。

## 19. Option B Overview

- Option BはProduction用の拡張Transaction Manager interfaceを新設する。
- 候補名は`ProductionWorkflowTransactionManagerV2`である。
- 別名候補に`DurableWorkflowTransactionManager`がある。
- database product名はinterface名へ含めない。
- PostgreSQLはこのinterfaceの一Concrete Adapterとなる。
- Reference V1はそのまま維持できる。
- 本ContractはOption BをPrimary Decisionとする。

## 20. Option B Capability Separation

- V2 Contextはdurable query capabilityを必須とする。
- V1 ContextとV2 Contextをunionにしない。
- V2 managerはserver-only rootからだけexportする。
- Store AdapterはV2 Contextだけを受け取る。
- Reference helperはV1 Contextだけを受け取る。
- shared business codeが両者を暗黙に交換してはならない。
- compatibilityは明示adapterまたは別contractで評価する。

## 21. Option B Migration Path

- Phase 1でV2型とcontract testsを追加する。
- Phase 2でPostgreSQL Transaction AdapterをV2へ適合させる。
- Phase 3でConcrete Store AdapterをV2 Context対応にする。
- Phase 4でRuntime bundleへversioned transaction slotを追加する。
- Phase 5でconsumer単位にV1からV2へ移行する。
- V1とV2の同時存在期間を許可する。
- V1をV2へdirect castしてはならない。

## 22. Option B Runtime Bundle Impact

- 現行`runtimeTypes.ts`のV1 slotは即時変更しない。
- 将来のRuntime interface minorまたはmajor contractでV2 slotを定義する。
- V2 slotはdurable capabilityをrequiredとして検証する。
- Reference Runtime bundleはV2 production capabilityを宣言しない。
- Production bundleはV1 fakeへfallbackしない。
- Composition validationはdescriptor versionとcapabilityを確認する。
- bundle migrationは本Contractの実装範囲外である。

## 23. Option B Store Adapter Fit

- Store transactional methodはV2 query capabilityをexplicit引数として受け取れる。
- 一つのContextでFinal Result、Reference、Outboxを結合できる。
- StoreはPoolまたはraw Clientを受け取らない。
- Storeはtransaction開始、commit、rollbackを呼ばない。
- Context compatibilityはopaque capability identityで検証可能である。
- Store単体testはbounded fake query capabilityを注入できる。
- PostgreSQL integration testは実dedicated connectionを使用できる。

## 24. Option B Test Reuse

- V1 Reference testsは変更せず維持する。
- V2 generic lifecycle suiteを新設する。
- PostgreSQL AdapterはV2 suiteとDriver suiteを通す。
- Store Contract harnessはV2 Context fakeを利用する。
- commit unknownとrollback failureはcontrolled faultで検証する。
- async lineageはscope owner単体testとadapter integration testで検証する。
- test reuseのためにProduction capabilityをoptional化しない。

## 25. Option C Overview

- Option CはContextとは別にexecutorをcallback引数へ渡す案である。
- 例は`operation(context, executor)`である。
- ownershipが明示される利点がある。
- callback signatureが二つのlifecycle objectを持つ。
- Contextとexecutorのexpiry同期が必要になる。
- nested detection問題は単独では解決しない。
- Secondary alternativeとして評価する。

## 26. Option C Explicit Ownership

- executorがdatabase capabilityであることは明確である。
- Contextはorchestration metadataに限定できる。
- Storeへexecutorだけを渡すleast privilegeが可能である。
- 一方でhook登録とqueryのlifetime ownerが分裂する。
- transaction identity consistencyを二object間で検証する必要がある。
- callbackが片方だけをclosureへ保持するescape pathが増える。
- correctness proofがOption Bより複雑になる。

## 27. Option C API and Typing

- 全callbackが二引数となりAPIの冗長性が増える。
- executorとContextの組合せ違いを型だけで完全に防げない。
- Store method signaturesはexecutorを受け取るため明快である。
- after-commit registrationには別Contextが必要である。
- future capability追加で引数が増える危険がある。
- capability objectへ集約したOption Bの方がversioningしやすい。
- Option Cは採用しない。

## 28. Option C Context Escape

- executorはcallback終了時に必ずexpireさせる必要がある。
- Contextも同時にexpireさせる必要がある。
- 二つのclose順序にraceが生じ得る。
- executorだけのlate queryをfail closedにする必要がある。
- hookだけのlate registrationも拒否する必要がある。
- atomic close ownerを別途導入するとOption B Contextへ収束する。
- lifecycle simplicityの観点から不利である。

## 29. Option D Overview

- Option Dは既存interfaceを変えずAsyncLocalStorageからconnectionを暗黙取得する案である。
- Store methodはambient connection locatorへ依存する。
- callback signatureを維持できるように見える。
- しかしdependencyとownershipがコード上不可視になる。
- Store単体testがambient setupへ依存する。
- multi-runtime instance isolationが難しくなる。
- Primaryとして明確に拒否する。

## 30. Option D Implicit Dependency Risk

- Store呼出しだけからtransaction参加有無を判別できない。
- transaction外呼出しがdefault Pool queryへ落ちる危険がある。
- async taskのforkにconnection capabilityが自動伝播する。
- callback完了後のdetached taskへstoreが漏れる可能性がある。
- libraryがhidden singletonに依存しやすい。
- test orderとscope setupが結果へ影響する。
- explicit capability原則に反する。

## 31. Option D Worker and Scheduler Risk

- long-lived worker loopへambient scopeが残ると誤transaction参加を起こす。
- scheduler dispatch間でscope isolationを証明しにくい。
- timer callbackへのcontext propagationを意図せず許す。
- multi-tenant business identityとscopeを混同する危険がある。
- shutdown中のdetached taskがconnectionへ触れ得る。
- worker concurrencyのconnection ownershipが不透明になる。
- Production運用上の監査可能性が低い。

## 32. Option D Multi-runtime Risk

- 一processに複数Runtime graphが存在し得る。
- module-level AsyncLocalStorageはgraph ownershipを曖昧にする。
- instance別storageでもStore import先とのbindingが必要になる。
- ambient locatorは誤ったPoolのconnectionを返す危険がある。
- hot reloadまたはtest isolationでstore instanceが分断される。
- registryにconnectionを保持することは禁止される。
- DB connection locator用途は採用しない。

## 33. Option Comparison Matrix

| Criterion | Option A | Option B | Option C | Option D |
|---|---|---|---|---|
| V1維持 | 弱い | 強い | 中 | 表面上強い |
| explicit query capability | 条件付き | 強い | 強い | 弱い |
| Store typing | optional化しやすい | 明確 | 明確 | ambient |
| context escape control | 中 | 強い | 複雑 | 弱い |
| nested detection | 別途必要 | scope owner併用 | 別途必要 | 可能 |
| independent concurrency | 設計次第 | 強い | 設計次第 | 隠れ依存 |
| 推奨 | 不採用 | Primary | 不採用 | nested検出限定 |

## 34. Formal Decision

- `Reference Transaction Manager V1`を変更しない。
- `Production Durable Transaction Manager V2`を新設する。
- V2 Contextはexplicit query capabilityを含む。
- V2 ContextはPostgreSQL raw typeを含まない。
- AsyncLocalStorageはnested markerの読書きだけを行う。
- connectionはAdapter instanceのinvocation-owned closureに保持する。
- StoreはContextから明示的executorを受け取る。

## 35. Proposed Manager Name

- 正式候補名は`ProductionWorkflowTransactionManagerV2`とする。
- semantic aliasとして`DurableWorkflowTransactionManager`を検討できる。
- `PostgreSQLTransactionManager`を上位interface名にしない。
- product固有名はConcrete Adapterへ限定する。
- `V2`はV1と互換でないcapability境界を明示する。
- final namingはimplementation Contractで固定する。
- naming変更でsemantic requirementsを弱めてはならない。

## 36. Proposed Manager Shape

```ts
type ProductionWorkflowTransactionManagerV2 = Readonly<{
  descriptor: ProductionWorkflowTransactionManagerDescriptorV2;
  runInTransaction<T>(
    options: ProductionWorkflowTransactionOptionsV2,
    operation: ProductionWorkflowTransactionOperationV2<T>,
  ): Promise<ProductionWorkflowTransactionExecutionResultV2<T>>;
  stop(): "stopped" | "already-stopped";
}>;
```

- optionsはstrict allowlistで検証する。
- callbackだけがContextを受け取る。
- raw Driver connectionはmanager外へ出さない。

## 37. Proposed Descriptor

```ts
type ProductionWorkflowTransactionManagerDescriptorV2 = Readonly<{
  descriptorVersion: "2.0";
  id: "production-workflow-transaction-manager-v2";
  mode: "production-durable";
  durable: true;
  crossInstance: true;
  nestedTransactions: false;
  savepoints: false;
  externalIoInsideTransaction: false;
  commitUnknownSupported: true;
  productionReady: false;
}>;
```

- Foundation中は`productionReady: false`を維持する。

## 38. Proposed PostgreSQL Adapter Descriptor

```ts
type PostgreSQLTransactionAdapterDescriptor = Readonly<{
  descriptorVersion: "1.0";
  adapterId: "postgresql-workflow-transaction-v1";
  driver: "pg";
  nestedTransactions: false;
  savepoints: false;
  externalIoAllowed: false;
  commitUnknownSupported: true;
  productionReady: false;
}>;
```

- Manager descriptorとAdapter descriptorを混同しない。

## 39. Proposed Context Shape

```ts
type ProductionWorkflowTransactionContextV2 = Readonly<{
  contextVersion: "2.0";
  scope: "opaque-production-durable-transaction-scope";
  externalIoAllowed: false;
  startedAt: WorkflowUtcTimestamp;
  deadline: ProductionWorkflowTransactionDeadline;
  query: ProductionWorkflowTransactionQueryCapability;
  registerAfterCommit(hook: ProductionAfterCommitHook): AfterCommitRegistrationResult;
}>;
```

- Contextはraw Pool、Client、credentialを含まない。

## 40. Opaque Identity Policy

- Context内部にはinvocation-owned opaque identityを持てる。
- public transaction IDにbusiness identityを含めない。
- tenant、Reference、Asset ID、idempotency keyを含めない。
- random generation方法はID Contractと整合させる。
- transaction IDをlogまたはtraceへ出さない。
- Store recordへtransaction scope identityを保存しない。
- equality tokenはmodule-private closureに保持する。

## 41. Query Capability Shape

```ts
type ProductionWorkflowTransactionQueryCapability = Readonly<{
  capabilityVersion: "1.0";
  execute(request: WorkflowDatabaseQueryRequest): Promise<WorkflowDatabaseQueryResult>;
}>;
```

- requestとresultはDriver非依存safe型を使用する。
- raw SQLをbusiness serviceから受け取る形にはしない。
- Concrete Store Adapter内のapproved statementだけを渡す。
- capability自体にcommit、rollback、releaseを持たせない。

## 42. Query Request Ownership

- statement textはConcrete Store Adapter内のconstantとして所有する。
- business inputからSQL fragmentを組み立てない。
- parameterはDriverのvalidated parameter unionへmappingする。
- statement IDはsafe allowlisted identifierとする。
- result cardinalityを明示する。
- raw query resultをContext外へ返さない。
- Store row mapperがsafe domain resultへ変換する。

## 43. Driver Type Boundary

- V2 public typeから`pg`型をexportしない。
- raw `PoolClient`をContextへ入れない。
- Transaction AdapterはPostgreSQL Driver公開interfaceだけを利用する。
- Driverがquery codecとSQLSTATE safe classificationを所有する。
- Transaction Adapterがraw Errorを再公開しない。
- Store AdapterがDriver connection lifecycleを操作しない。
- product-neutral V2 interfaceはPostgreSQL以外にも実装可能である。

## 44. Connection Ownership

- top-level invocationが一connectionをcheckoutする。
- checked-out connectionはinvocation closureだけが保持する。
- BEGIN後にtransaction-bound Driver connectionをContext executorへ閉じ込める。
- callbackへPoolを渡さない。
- callbackへconnection release capabilityを渡さない。
- completion時に必ずreleaseまたはdiscardを決定する。
- registryへlive connectionを保存しない。

## 45. Same Physical Connection Rule

- BEGIN、option setup、Store query、COMMIT／ROLLBACKは同じClientで実行する。
- transaction中に`pool.query`を使用してはならない。
- Storeごとに別connectionをcheckoutしてはならない。
- Final Result、Reference、Outboxのatomic composerは同じContextを渡す。
- connection identityは外部へ公開しない。
- integration testはbackend PID等をdiagnosticへ残さず同一性を検証する。
- rule違反はFoundation停止条件である。

## 46. Context Lifecycle

- ContextはBEGIN成功後にopenとなる。
- callback invocation中だけactiveである。
- callback result確定時にquery admissionを閉じる。
- commit開始前にContextをcloseする。
- rollback開始前にContextをcloseする。
- completion後はdisposedとなる。
- closeは同期的かつ一方向でなければならない。

## 47. Context Escape Protection

- callbackがContext参照を保持してもcompletion後queryを拒否する。
- late queryはDBへ到達してはならない。
- late hook registrationを拒否する。
- rejected resultはraw stateまたはidentityを含めない。
- detached promiseがContextを使用してもfail closedする。
- Context object凍結だけに依存せずclosure stateを検証する。
- real PostgreSQL testでclient call 0を確認する。

## 48. Async Scope Owner Purpose

- Async Scope Ownerはnested transaction検出だけを行う。
- connection locatorではない。
- Store lookup serviceではない。
- transaction Context transportではない。
- business identity transportではない。
- observability baggageではない。
- deadlineまたはcredential storageではない。

## 49. AsyncLocalStorage Adoption

- Node server-only `AsyncLocalStorage`の採用を推奨する。
- 導入はV2 implementation file内へ隔離する。
- browser/client barrelからexportしない。
- storage valueはminimal opaque scope markerだけとする。
- connection、Context、callback、resultをstorageへ入れない。
- module-global shared storageを避けmanager instance ownershipとする。
- Node version compatibilityをimplementation gateで確認する。

## 50. Async Scope Marker

```ts
type TransactionAsyncScopeMarker = Readonly<{
  markerVersion: "1.0";
  managerInstance: object;
  lineage: object;
}>;
```

- 実装ではobject identityをmodule-privateに保つ。
- markerを公開resultやdiagnosticへ含めない。
- markerをserializeしない。
- markerへbusiness dataを追加しない。

## 51. Nested Detection Algorithm

- `runInTransaction`入口でinstance-owned storageのcurrent markerを読む。
- same manager instance markerが存在すればnestedとして拒否する。
- markerがなければ新しいinvocation lineageを生成する。
- callback全体をstorage `run` scope内で実行する。
- connection checkout前にnested拒否を確定する。
- nested rejectionでDriver callは0回である。
- callback終了後にscopeは自動的に親へ戻る。

## 52. Independent Concurrency

- storageにmarkerがない別top-level async chainは独立transactionを開始できる。
- 同一manager instanceでも独立transactionを並行実行できる。
- 各invocationは別connectionをcheckoutする。
- 一方のrollbackが他方のcommitを変えてはならない。
- 一方のdeadlineが他方へ伝播してはならない。
- hook listとContext stateを共有してはならない。
- concurrency上限はDriver Pool policyに従う。

## 53. Same Lineage Nested Rejection

- callbackから同じmanagerを呼ぶ場合は拒否する。
- callback内のawait後に呼んでも拒否する。
- callbackから派生したPromise chainでも拒否する。
- nested invocationはsavepointへ変換しない。
- nested invocationをsame transactionへ暗黙joinしない。
- rejected resultは`nested-transaction` safe codeを返す。
- outer transactionの継続方針はcallerが明示的に処理する。

## 54. Cross-manager Behavior

- 別manager instance間のnested-like呼出しは自動的に同一transactionではない。
- cross-manager atomicityを推測しない。
- 別database transaction開始はservice design上原則禁止する。
- Runtime Compositionは一authority scopeに一managerを推奨する。
- cross-manager callが必要なら別Contractでsaga semanticsを定義する。
- storage markerをprocess-globalにして一律拒否してはならない。
- acceptance testはinstance isolationを確認する。

## 55. Detached Async Work

- callback内でfire-and-forget taskを開始してはならない。
- AsyncLocalStorage markerがdetached taskへ伝播してもDB capabilityはContext expiryで拒否される。
- Context close後のtaskはqueryできない。
- after-commit workは登録hookまたはdurable outboxへ移す。
- Provider callをdetached transaction taskとして開始しない。
- adapterは任意taskの完了を追跡できると捏造しない。
- violation責任はcallback ownerとstatic Contractに置く。

## 56. Transaction Options

```ts
type ProductionWorkflowTransactionOptionsV2 = Readonly<{
  isolation: "read-committed" | "serializable";
  accessMode: "read-write" | "read-only";
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  idleTransactionTimeoutMs?: number;
  deadline: ProductionWorkflowTransactionDeadline;
}>;
```

- unknown fieldはvalidatorで拒否する。
- arbitrary SQL optionを受け取らない。

## 57. Isolation Mapping

- `read-committed`を固定SQL `READ COMMITTED`へmappingする。
- `serializable`を固定SQL `SERIALIZABLE`へmappingする。
- arbitrary isolation stringをSQLへ埋め込まない。
- Storeがisolation levelを途中変更してはならない。
- default任せにせずoptionを明示する。
- 全transactionを自動的にserializableへ昇格しない。
- isolation選択ownerはcommand／Store Contractとする。

## 58. Access Mode Mapping

- `read-write`を固定SQL `READ WRITE`へmappingする。
- `read-only`を固定SQL `READ ONLY`へmappingする。
- query textからaccess modeを推測しない。
- read-only write violationはSQLSTATE `25006`としてsafe mappingする。
- read-only violationをschema mismatchにしない。
- violation後はfailed transactionとしてrollbackする。
- rollback成功後はconnection再利用を許可できる。

## 59. BEGIN Sequence

- connection checkout成功後にBEGINを実行する。
- isolationとaccess modeはallowlisted fixed mappingで設定する。
- timeout settingsはBEGIN直後にtransaction-localで設定する。
- option setup完了前にcallbackを呼ばない。
- setup failureではcallback call 0とする。
- setup failure後にrollback可能ならrollbackする。
- state不明ならconnectionをdiscardする。

## 60. Timeout Settings

- `statement_timeout`をtransaction-localに設定できる。
- `lock_timeout`をtransaction-localに設定できる。
- `idle_in_transaction_session_timeout`をtransaction-localに設定できる。
- PostgreSQL parameter binding可否を実装時に実証する。
- binding不可ならstrict safe integerからだけfixed fragmentを生成する。
- 負数、非整数、unsafe integer、上限超過を拒否する。
- raw option値をdiagnosticへ含めない。

## 61. Deadline Model

- deadline評価はinjected clockを使用する。
- `Date.now()`を直接使用しない。
- deadlineはabsolute canonical UTCまたはclock-compatible opaque valueとする。
- callback開始前、各query admission前、commit admission前に評価する。
- deadline policy数値をFoundationで推測しない。
- statement timeoutとcallback deadlineを混同しない。
- pool checkout timeoutはDriver configuration ownerに置く。

## 62. Deadline Exceeded

- deadline後の新規queryをDriver call前に拒否する。
- pg AbortSignal未対応のためactive statement cancelを捏造しない。
- callbackがdeadline failureを返したらrollbackする。
- callback success後commit前にdeadline超過した場合はrollbackを試みる。
- rollback成功ならdefinitely rolled backとする。
- connection状態不明ならdiscardする。
- safe resultは`deadline-exceeded`を返す。

## 63. Application Cancellation

- application cancellationとstatement timeoutを区別する。
- V1 FoundationでAbortSignal対応を宣言しない。
- cancellation request後の新規query admissionを閉じる設計は将来Contractとする。
- active PostgreSQL statement強制cancelは別Driver capabilityが必要である。
- cancellationをcommit成功またはrollback成功と推測しない。
- commit送信後cancellationはcommit unknownになり得る。
- unsupported capabilityはdescriptorへ明記する。

## 64. Callback Operation Shape

```ts
type ProductionWorkflowTransactionOperationV2<T> = (
  context: ProductionWorkflowTransactionContextV2,
) => Promise<ProductionWorkflowTransactionOperationResultV2<T>>
  | ProductionWorkflowTransactionOperationResultV2<T>;
```

- callbackはsafe successまたはsafe failure unionを返す。
- raw Errorをresultに含めない。
- callback valueはcommit成功時だけ公開する。
- callbackはContextを保存してはならない。

## 65. Callback Success

- callback success後にContext query admissionを閉じる。
- COMMITを一度だけ送る。
- commit成功後にconnectionをreleaseする。
- その後にafter-commit hooksを登録順で実行する。
- committed resultだけがcallback valueを返す。
- valueは必要ならmutation isolation boundaryを通す。
- commit前にvalueを外部へpublishしない。

## 66. Callback Safe Failure

- callback safe failure時にCOMMITを送らない。
- ROLLBACKを一度だけ試みる。
- rollback成功ならsafe rolled-back resultを返す。
- callback failure codeをallowlist mappingする。
- callback valueは存在しない。
- after-commit hookは0回である。
- connectionはrollback成功後にreleaseする。

## 67. Callback Throw or Reject

- sync throwとasync rejectionを同じsafe callback failureへmappingする。
- raw message、stack、causeを保持または返却しない。
- Contextを直ちにcloseする。
- rollbackを試みる。
- rollback成功なら`callback-failed`を返す。
- rollback失敗ならrollback failureを優先する。
- after-commit hookは0回である。

## 68. Failed Transaction Protection

- query failure後のDriver transaction stateを確認する。
- invalid request以外のstatement errorはtransaction abortedになり得る。
- failed state後の通常queryを拒否する。
- callbackがsuccessを返してもfailed stateではcommitしない。
- 必ずrollbackを試みる。
- constraint、deadlock、serialization、read-onlyで検証する。
- rollback成功後だけconnectionをreleaseする。

## 69. Commit State Machine

- callback successとlocal validation成功後だけ`committing`へ進む。
- COMMIT送信前failureと送信後failureを区別する。
- commit成功はserver acknowledgementを受けた場合だけ断定する。
- commit methodを複数回呼ばない。
- Contextへcommit capabilityを公開しない。
- commit中のqueryを拒否する。
- commit result mappingはDriver resultを正とする。

## 70. Commit Success

- Driver `committed`だけをbusiness committedへmappingする。
- connectionはsafe releaseする。
- callback valueをcommitted resultへ含める。
- after-commit hooksを実行する。
- hook failureでもDB commitを撤回したと表現しない。
- commit metricとhook metricを分離する。
- outbox durable truthは既にtransaction内に書かれている前提とする。

## 71. Commit Unknown

- COMMIT送信後のconnection failureまたはresponse lossはunknown outcomeである。
- unknownをrolled-backへmappingしない。
- callback valueをcommitted valueとして返さない。
- after-commit hookを実行しない。
- connectionをdiscardする。
- automatic retryを行わない。
- 上位reconciliationがprotected identity lookupで解決する。

## 72. Commit Pre-send Failure

- COMMIT未送信をadapterが証明できるlocal failureだけをpre-sendとする。
- pre-send failure後にrollbackを試みる。
- rollback成功時だけdefinitely rolled backと断定する。
- network errorをpre-sendと推測しない。
- Driverがphaseを証明できない場合はunknownを選ぶ。
- callback valueを返さない。
- connection reuseはrollback resultに従う。

## 73. Definitely Rolled Back

- BEGIN前failureはtransaction未開始として扱える。
- callback failure後ROLLBACK成功はdefinite rollbackである。
- callback throw後ROLLBACK成功はdefinite rollbackである。
- COMMIT前local validation failure後ROLLBACK成功はdefinite rollbackである。
- COMMIT送信後failureを含めない。
- rollback acknowledgement lossを含めない。
- evidenceが不足する場合はunknownまたはunavailableを選ぶ。

## 74. Rollback State Machine

- rollback admission時にContextをcloseする。
- activeまたはfailed transactionだけがrollback対象である。
- rollbackを一度だけ送る。
- 成功時はrolled-backとなる。
- connection loss時はconnection-lostとなる。
- その他failureはrollback-failedとなる。
- rollback resultからreleaseまたはdiscardを決める。

## 75. Rollback Failure

- rollback failure後にconnectionをPoolへ通常releaseしない。
- connectionをdiscardする。
- original callback raw errorを返さない。
- callback success valueを返さない。
- after-commit hookは0回である。
- resultはsafe `rollback-failed`または`connection-lost`とする。
- transaction stateをunknownとして閉じる。

## 76. Connection Reuse Matrix

| Outcome | Connection action |
|---|---|
| commit success | release |
| rollback success | release |
| constraint + rollback success | release |
| serialization/deadlock + rollback success | release |
| read-only violation + rollback success | release |
| commit unknown | discard |
| rollback failure | discard |
| connection lost | discard |
| deadline with unknown state | discard |

## 77. Retry Policy

- Transaction Adapter内部で自動retryしない。
- `40001`を自動再実行しない。
- `40P01`を自動再実行しない。
- connection failureを自動再実行しない。
- commit unknownを自動再実行しない。
- retryable safe projectionだけを上位へ返せる。
- command ownerがsame logical identityとside-effect evidenceを確認する。

## 78. External I/O Boundary

- Contextは`externalIoAllowed: false`を持つ。
- Contextにfetch、Provider Client、credentialを含めない。
- transaction moduleからProvider moduleをimportしない。
- callback helperへProvider dependencyを渡さない。
- runtimeで任意user codeのnetwork accessを完全防止できるとは主張しない。
- static import Contractとcode reviewが責任境界を補完する。
- Provider I/Oはreserve commit後の別stageで行う。

## 79. After-commit Registration

- active callback中だけ登録できる。
- Context close後は`context-closed`を返す。
- hookは引数なしのserver-only closureとする。
- hookへContextまたはquery capabilityを渡さない。
- registration順を保存する。
- duplicate object identityは登録ごとに一回実行する方針とする。
- durable side effectの唯一のtruthにしてはならない。

## 80. After-commit Execution

- commit成功後だけ実行する。
- rollback時は0回である。
- commit unknown時は0回である。
- hooksをregistration順に逐次実行する。
- 各hookを最大一回呼ぶ。
- hook failure後の継続方針はfail-fastをV1 defaultとする。
- hooksRunは成功完了数だけを表す。

## 81. After-commit Failure

- hook throw/rejectをsafe `after-commit-failed`へmappingする。
- DB business stateはcommittedのままである。
- transaction failureまたはrollback済みと表現しない。
- callback valueはcommitted resultに保持できる。
- raw hook errorを返さない。
- secondary failureとしてobservabilityへsafe codeだけを送る。
- Reference V1 semanticsとの共通部分を維持する。

## 82. Outbox Relationship

- Outbox row writeは同一DB transaction内でStore Adapterが行う。
- Outbox delivery自体をafter-commit hookへ置かない。
- hookはbounded wake-up hint等に限定できる。
- hook failureでもdurable Outbox rowは残る。
- delivery workerがOutbox truthを処理する。
- notification lossをdomain rollbackとしない。
- Concrete Outbox Adapterは別Foundationで実装する。

## 83. Safe Execution Result

```ts
type ProductionWorkflowTransactionExecutionResultV2<T> =
  | Readonly<{ status: "committed"; value: T; afterCommit: WorkflowAfterCommitResult }>
  | Readonly<{ status: "rolled-back"; failure: ProductionTransactionFailureCode }>
  | Readonly<{ status: "commit-unknown"; failure: "unknown-outcome" }>
  | Readonly<{ status: "rejected"; failure: ProductionTransactionRejectionCode }>;
```

- exact unionはimplementation Contractでvalidatorと共に固定する。
- rollback branchにvalueを含めない。

## 84. Safe Failure Codes

- `pool-unavailable`はPool readinessまたはcheckout failureを表す。
- `checkout-timeout`はbounded checkout timeoutを表す。
- `begin-failed`はBEGIN failureを表す。
- `option-setup-failed`はtransaction-local option failureを表す。
- `callback-failed`はthrow/rejectまたはsafe callback failure mappingを表す。
- `transaction-aborted`はfailed transaction保護を表す。
- `commit-unknown`、`rollback-failed`、`deadline-exceeded`を区別する。

## 85. Additional Failure Codes

- `read-only-violation`をschema mismatchと区別する。
- `retryable-conflict`はserialization/deadlock projectionに使用できる。
- `schema-mismatch`はundefined table/column等を表す。
- `disposed`はmanagerまたはContext終了後利用を表す。
- `nested-transaction`はsame lineage rejectionを表す。
- `invalid-options`はallowlist validation failureを表す。
- `internal-failure`はraw detailを伴わない最終safe fallbackである。

## 86. Diagnostic Policy

- diagnosticはstage、safe issue、retryable、connection actionだけを含める。
- raw SQLを含めない。
- query parameterを含めない。
- raw SQLSTATE detail、message、hint、stackを含めない。
- constraint名はsafe allowlist classへmappingする。
- transaction markerまたはconnection identityを含めない。
- tenant、Reference、Asset ID、idempotency keyを含めない。

## 87. SQLSTATE Projection

- `23505`、`23503`、`23514`はconstraint conflictとして扱う。
- `40001`と`40P01`はretryable conflictとして投影する。
- class `08`はphaseによりunavailableまたはcommit unknownとなる。
- `57014`はquery cancelled／timeout policyへmappingする。
- `25006`はread-only violationである。
- `42P01`と`42703`はschema mismatchである。
- raw SQLSTATE全文を上位public DTOへ出す必要はない。

## 88. Registry Contract

- V2 manager、PostgreSQL adapter、scope ownerのdescriptorを登録できる。
- Registryはlookup-onlyとする。
- lookupごとにfresh frozen descriptor copyを返す。
- unknown IDは`undefined`を返す。
- live Pool、connection、Context、callbackを保持しない。
- SQL、credential、result、business identityを保持しない。
- registry discoveryはproduction readinessを意味しない。

## 89. Server-only Boundary

- V2 interfaceと実装は`lib/server`配下に置く。
- `"use client"`を含めない。
- React、app、components、hooksからimportしない。
- window、document、fetch、XMLHttpRequestを使用しない。
- client-safe barrelからre-exportしない。
- Node AsyncLocalStorage importはscope owner implementationへ限定する。
- static import graph testを必須とする。

## 90. Static Prohibitions

- `process.env`をTransaction Adapter内で読まない。
- `globalThis`、`Symbol.for`を使用しない。
- `Date.now`、`Math.random`を使用しない。
- `setInterval`、`console`を使用しない。
- ORMまたはQuery Builderを追加しない。
- `as any`または`unknown as`を使用しない。
- raw Errorまたはraw pg typeをpublic exportしない。

## 91. Security Boundary

- credentialはDriver connection construction ownerだけが扱う。
- Transaction Contextはconnection configを含めない。
- callbackはpassword、host、portを取得できない。
- query diagnosticからparameter valueを除外する。
- protected identityもtransaction metadataへ複製しない。
- Contextをserialization対象にしない。
- safe failureはattacker-controlled raw fieldを反射しない。

## 92. Mutation Isolation

- descriptorはimmutable snapshotとして返す。
- optionsをcaller mutationから分離する。
- hook listをContext外へ返さない。
- query resultはDriver codecのowned copiesを利用する。
- byteaとJSONのowned copy semanticsを維持する。
- callback resultをcommit前に外部共有しない。
- diagnostic objectをfreezeまたはcopyする。

## 93. Lifecycle States

- adapter lifecycleは`created`から開始する。
- transaction invocationは`acquiring-connection`へ進む。
- その後`starting`、`active`へ進む。
- failure時は`callback-failed`または`rolling-back`へ進む。
- success時は`committing`、`committed`へ進む。
- unknown時は`commit-unknown`へ進む。
- 最終的に`completed`または`disposed`となる。

## 94. Lifecycle Invariants

- 一invocationを重複実行しない。
- begin前にcallbackを呼ばない。
- active中だけqueryを許可する。
- callback完了後queryを許可しない。
- commit／rollback開始後queryを許可しない。
- completion後hook登録を許可しない。
- state transitionは一方向である。

## 95. Manager Stop Semantics

- stop後のnew transactionを拒否する。
- stopを二回呼ぶと`already-stopped`を返す。
- in-flight transactionを即時commit成功とみなさない。
- bounded drain semanticsはRuntime Lifecycle Contractで追加定義する。
- stop時にContext escapeを再開可能にしない。
- stopped managerをReferenceへfallbackしない。
- stop resultへconnection detailを含めない。

## 96. Runtime Interface Versioning

- V1 manager slotを直接V2へ置換しない。
- V2 capability用のRuntime interface revisionを別Contractで定義する。
- structural compatibilityだけでV2適合とみなさない。
- descriptor majorとruntime validatorを確認する。
- V1 consumerはV2 database queryを利用できない。
- V2-required consumerをV1 Runtimeで起動しない。
- rolling deployment compatibilityをComposition Contractで扱う。

## 97. Reference Compatibility

- Reference V1の型、manager、testsを変更しない。
- V1 fakeをProduction Durable Managerとして登録しない。
- V1 result semanticsをV2 commit evidenceとして使用しない。
- shared after-commit behaviorはcontract test conceptとして再利用できる。
- database query testはReference V1へ要求しない。
- V1 active flag limitationをProductionへ持ち込まない。
- Reference fallbackは禁止を維持する。

## 98. Store Adapter Contract

- transactional Store methodはV2 Contextまたはquery capabilityをexplicitに受け取る。
- capabilityなしでwrite methodを呼べない型を推奨する。
- Storeはtransactionを開始しない。
- Storeはcommitまたはrollbackしない。
- StoreはProvider I/Oを行わない。
- Storeはapproved SQLとsafe row mappingだけを所有する。
- Store SQLの具体化は次Foundationへ延期する。

## 99. Slice A Atomic Composer

- 将来のcomposerが一つのV2 Contextを三Storeへ渡す。
- Final Result insert、Reference issue、Outbox appendを同一transactionに含める。
- transaction timeとconstraint semanticsはschema Contractに従う。
- 一書込みfailureで三書込みすべてをrollbackする。
- commit unknownはprotected lookup reconciliationへ送る。
- Provider I/Oをcomposer callback内に含めない。
- 本Contractではcomposerを実装しない。

## 100. Testing Layers

- pure testはoption、state、result mappingを検証する。
- scope owner testはnestedとindependent concurrencyを検証する。
- static testはserver-only boundaryと禁止importを検証する。
- Driver wrapper testはcontrolled faultを注入する。
- real PostgreSQL testはphysical transaction behaviorを検証する。
- Store Contract harnessはexplicit capability受渡しを検証する。
- Runtime regressionはV1 semanticsが不変であることを確認する。

## 101. Async Scope Test Matrix

- top-level transactionは受理される。
- same callback直下のnested callは拒否される。
- await後のsame lineage nested callは拒否される。
- derived Promiseのnested callは拒否される。
- independent Promise rootsは並行実行できる。
- 別manager instanceのmarkerは混線しない。
- nested rejection時はcheckout call 0である。

## 102. Context Escape Test Matrix

- callback中queryは成功できる。
- callback success後queryは拒否される。
- callback failure後queryは拒否される。
- commit開始後queryは拒否される。
- rollback開始後queryは拒否される。
- completion後hook registrationは拒否される。
- late operationでDriver call 0を確認する。

## 103. Real PostgreSQL Test Matrix

- successful commitとrollback visibilityを確認する。
- read-only SELECT成功とwrite failureを確認する。
- unique、FK、CHECK violationを確認する。
- failed transaction後query拒否を確認する。
- deadlockとserialization conflictを確認する。
- independent transaction isolationを確認する。
- connection release／discardを確認する。

## 104. Commit and Rollback Test Matrix

- callback safe failureでrollbackする。
- sync throwとasync rejectionでrollbackする。
- commit successでvalueを返す。
- commit response lossでunknownを返す。
- commit unknownでhook call 0を確認する。
- rollback failureでdiscardする。
- callback valueがrollback branchへ漏れないことを確認する。

## 105. After-commit Test Matrix

- commit成功後にregistration順で実行する。
- rollback時は0回である。
- commit unknown時は0回である。
- duplicate hook registrationを各一回実行する。
- hook throwをcommitted-after-commit-failedへmappingする。
- hook rejectも同じsafe classificationへmappingする。
- raw hook errorがresultへ出ないことを確認する。

## 106. Controlled Fault Injection

- test-only Driver wrapperでcheckout failureを注入する。
- BEGIN failureとoption setup failureを注入する。
- COMMIT pre-send failureを注入する。
- COMMIT response-loss相当を注入する。
- ROLLBACK failureとrelease failureを注入する。
- after-commit throw/rejectを注入する。
- Production schemaやAPIへscenario fieldを追加しない。

## 107. Concurrency Test Matrix

- 二つのtop-level transactionを同時にactiveにする。
- 一方のcommit visibilityを他方から確認する。
- rollback rowが他connectionから見えないことを確認する。
- deadlock victimだけがsafe conflictとなることを確認する。
- serializable conflictでautomatic retry 0を確認する。
- 各transactionが独立Context stateを持つことを確認する。
- test runner自体は`--test-concurrency=1`を維持する。

## 108. Static Contract Test Matrix

- client directiveとReact importがないことを確認する。
- app、components、hooks importがないことを確認する。
- fetch、window、document、XMLHttpRequestがないことを確認する。
- process.env、globalThis、Symbol.forがないことを確認する。
- Date.now、Math.random、setInterval、consoleがないことを確認する。
- `as any`、`unknown as`、raw pg exportがないことを確認する。
- Provider／Workflow API importがないことを確認する。

## 109. Assertion Quality

- large assertion countはstateとinput組合せの意味あるmatrixに使用する。
- 同一assertの無意味な反復を禁止する。
- option validation、deadline、lifecycle、outcomeを組み合わせる。
- mutation isolationとsafe diagnostic field集合を検証する。
- registry lookup isolationを検証する。
- real behaviorをpure assertion数で代替しない。
- Foundation implementationでは最低700,000件を目標とする。

## 110. Observability Boundary

- transaction stageをsafe metricとして記録できる。
- committed、rolled-back、commit-unknownを区別する。
- retryable conflictとread-only violationを区別する。
- hook secondary failureをcommit failureと分離する。
- transaction ID、SQL、parameterをmetric labelへ入れない。
- raw connection errorをlogしない。
- cardinalityが高いbusiness identityをlabelへ入れない。

## 111. Performance Boundary

- transactionはshort-livedでなければならない。
- Provider I/O待機を含めない。
- broad table scanをTransaction Adapterで許可するContractではない。
- Pool上限とcheckout timeoutはDriver config ownerが決める。
- timeout数値をFoundationで推測しない。
- hook実行はcommit後でconnection release後を推奨する。
- performance tuningでsafety invariantを弱めない。

## 112. Shutdown and Drain

- draining開始後のnew transaction admissionを停止する。
- in-flight transactionはbounded safe completionへ進める。
- forced shutdownでcommit resultを捏造しない。
- commit phase interruptionはunknownになり得る。
- rollback failure時はdiscardする。
- Async scope markerをshutdown後に再利用しない。
- exact drain timeoutはRuntime Lifecycle Contractで定める。

## 113. Implementation Placement

- 候補rootは`lib/server/productionWorkflowRuntime/postgresqlTransaction/`である。
- product-neutral V2 typesの配置は別versioned server-only moduleを検討する。
- Async scope ownerはTransaction Adapter内部または隣接moduleへ置く。
- Driverへのimportは公開barrelを優先する。
- testは`tests/postgresqlTransaction/`へ置く。
- client-safe indexからexportしない。
- package追加は認めない。

## 114. Implementation Sequence

1. V2 product-neutral typesとruntime validatorsを定義する。
2. Async scope ownerとnested contract testsを実装する。
3. PostgreSQL Context lifecycleを実装する。
4. BEGIN options、deadline、failure mappingを実装する。
5. commit、rollback、after-commitを実装する。
6. real PostgreSQL matrixとstatic testsを実行する。
7. Runtime bundle接続は別Foundationまで保留する。

## 115. Migration Strategy

- V1とV2を別interfaceとして共存させる。
- existing V1 call siteを一括置換しない。
- V2-required StoreをV1 managerへ接続しない。
- consumer migrationはcapability宣言単位で行う。
- V1 resultをV2 resultへdirect castしない。
- rollback可能なcomposition changeとして段階導入する。
- Production hard deny解除とは独立に進める。

## 116. Acceptance Gates

- V1 Reference型とtestsが無変更で通る。
- V2 Contextがexplicit query capabilityを持つ。
- raw PoolClientが公開されない。
- independent concurrencyとnested rejectionが両立する。
- AsyncLocalStorageがconnection locatorでない。
- commit unknownとrollback failureがsafeに分離される。
- context escape testでDriver call 0が確認される。

## 117. Additional Acceptance Gates

- after-commit failureをrollback扱いしない。
- automatic retryが存在しない。
- Provider I/O importが存在しない。
- migrationとStore SQLを変更しない。
- no new dependencyを維持する。
- real PostgreSQL testsをskipしない。
- productionReady falseを維持する。

## 118. Stop Conditions

- V1 interfaceの破壊変更が必要なら停止する。
- raw PoolClientをContextへ出す必要があるなら停止する。
- pool.queryをtransaction途中で使う必要があるなら停止する。
- AsyncLocalStorageをconnection locatorにする必要があるなら停止する。
- module-global mutable nesting flagが必要なら停止する。
- commit unknownをrollback扱いする必要があるなら停止する。
- rollback failure後connection reuseが必要なら停止する。

## 119. Additional Stop Conditions

- callback valueをrollback branchで返す必要があるなら停止する。
- after-commit failureをrollback扱いする必要があるなら停止する。
- automatic retryが必要なら停止する。
- Provider I/Oをtransaction内へ入れる必要があるなら停止する。
- Store SQLまたはmigration変更が必要なら停止する。
- new dependency、cast、process.env connectionが必要なら停止する。
- real PostgreSQL testをskipする必要があるなら停止する。

## 120. Open Questions

- V2 product-neutral query requestをstatement object型にするかStore-owned function型にするか。
- Runtime bundleのV2 slotをmajorまたはadditive capabilityとして導入するか。
- manager instance ownershipをComposition Rootでどう一意化するか。
- deadline absolute型を既存Clock Contractへどう追加するか。
- after-commit fail-fast後に未実行hook数を公開するか。
- release failureをcommitted secondary issueとしてどう観測するか。
- production timeout数値とPool sizingのownerを誰にするか。

## 121. Risks and Mitigations

- Async context propagation過剰のriskはContext expiryで緩和する。
- hidden connection dependencyのriskはexplicit query capabilityで除去する。
- V1/V2混同riskは別名、別descriptor、別barrelで緩和する。
- commit ambiguity riskはdedicated unknown resultで扱う。
- hook misuse riskはOutbox durable truthを明記して緩和する。
- diagnostic leakage riskはsafe allowlist mapperで緩和する。
- concurrency regression riskはreal multi-connection testで緩和する。

## 122. Decision Consequences

- 新しいversioned interfaceが増える。
- Runtime composition migrationが別工程として必要になる。
- Store Adapterは明示的Contextを受け取るためsignatureが増える。
- 一方でReference V1の安定性を維持できる。
- database capability ownershipが明確になる。
- nested detectionとconnection transportを分離できる。
- Production atomicityのtest evidenceを構築可能になる。

## 123. Rejected Shortcuts

- V1 Contextへoptional `query`を追加しない。
- V1 scopeをstringへ広げない。
- structural castでV2 ContextをV1として渡さない。
- singleton current connectionを作らない。
- StoreがPoolから自分でconnectionを取得しない。
- nested transactionをsavepointへ暗黙変換しない。
- all concurrencyをnestedとして拒否しない。

## 124. Foundation Boundary

- 本Contractは設計Decisionだけを完成させる。
- PostgreSQL Transaction Adapter実装は次Foundationである。
- Final Result／Reference／Outbox Adapterはその次である。
- Runtime Composition接続はStore Adapter完成後の別Foundationである。
- Production connectionは許可しない。
- Production launchは許可しない。
- Reference Runtimeは回帰oracleとして維持する。

## 125. Final Decision Matrix

| Decision | Selected | Rejected alternative | Reason |
|---|---|---|---|
| V1 handling | unchanged | direct extension | Reference semantics保護 |
| Production manager | V2 server-only | V1 optional capability | explicit durable boundary |
| query transport | explicit Context capability | ambient lookup | ownershipとtestability |
| async scope | nested detection only | connection locator | hidden dependency防止 |
| concurrency | independent top-level許可 | instance active flag | throughputと正確なnesting |
| nested | same lineage拒否 | savepoint／implicit join | V1 Contract維持 |
| commit failure | unknown保護 | rollback推測 | acknowledgement ambiguity |

## 126. Next Foundation

- 次は`PostgreSQL Transaction Adapter Foundation V1`を再開する。
- 実装前にV2型配置とRuntime bundle未接続方針を確認する。
- AsyncLocalStorageはinstance-owned scope markerだけに使用する。
- PostgreSQL Driverの公開connection interfaceだけを再利用する。
- Context query capabilityとexpiryを最初にtestする。
- その後commit、rollback、after-commit、fault matrixを実装する。
- Concrete Store SQLにはまだ進まない。

## 127. Completion Statement

- Current connection gapをReference V1の欠陥として遡及修正しない。
- V1はcallback orchestration contractとして有効である。
- Production durabilityには別V2 capabilityが必要である。
- Option Bと限定的AsyncLocalStorage利用を正式推奨とする。
- DB connectionは常にexplicit Context capabilityの背後に置く。
- nested scope detectionとDB resource locationを分離する。
- 本DecisionによりTransaction Adapter Foundationを安全に再開できる。
