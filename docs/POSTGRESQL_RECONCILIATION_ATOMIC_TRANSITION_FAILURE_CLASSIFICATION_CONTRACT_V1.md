# PostgreSQL Reconciliation Atomic Transition Failure Classification Contract V1

## 1. Status

本書は、PostgreSQL Reconciliation Atomic Transitionで発生する安全なfailure classificationの所有境界を固定する正式Contractである。

本書は設計決定だけを所有する。コード、test、Migration、Driver、Durable Transaction V2、Runtime Composition、Production Connectionを変更または許可しない。

PostgreSQL Reconciliation Store Adapter Verificationは、本書のDecisionを実装する後続工程までIncompleteである。

## 2. Purpose

目的は、次のfailureをStore、Atomic Composer、Reconciliation Runtime、API／diagnostic projectionのどの層が、どの粒度で所有するかを決定することである。

- stale revision
- stale fence
- writer epoch mismatch
- wrong prior state
- terminal state
- semantic conflict
- unavailable
- corrupted

分類はretry、failover wait、stale worker停止、terminal preservation、manual repairを安全に区別できなければならない。

testがrow、SQLSTATE、revision値、fence値から分類を推測することを禁止する。

## 3. Normative Inputs

本書は次を正規入力とする。

- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_STORE_SCHEMA_ALIGNMENT_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_V000003_CONSTRAINT_METADATA_OWNERSHIP_DECISION_CONTRACT_V1.md`
- `POSTGRESQL_MANUAL_REPAIR_DELETION_STATE_VERIFICATION_OWNERSHIP_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`
- `postgresqlReconciliationStores` module
- `reconciliation` Runtime Foundation
- `durableTransaction` V2 Foundation

Reconciliation Runtimeはstale fenceをstale worker停止として扱い、terminal stateをpreserveし、CAS conflictをauthoritative reread対象とする。

Durable Transaction V2はtransaction commit／rollback ownershipを持つが、Reconciliation domain classificationを所有しない。

## 4. Current Gap

SchemaとRequest CAS predicateはexpected revision、writer epoch、fencing revision、prior state、terminal stateを照合できる。

Store capabilityのResult unionには候補として次が存在する。

- `stale-revision`
- `stale-fence`
- `stale-writer`
- `terminal`
- `conflict`
- `unavailable`
- `corrupted`

ただし現行Request Store実装はCAS UPDATEが0 rowの場合を一律`stale-revision`へ写像している。

したがって、schema上は識別可能でも、現在のStore実装がstale fenceとwriter epoch mismatchを実際に公開しているわけではない。

現行Atomic Composer公開結果は次だけである。

- `committed`
- `conflict`
- `corrupted`
- `unavailable`

ComposerはRequest CASの`unavailable`以外をDurable Transactionの`retryable-conflict`へ正規化する。

このためstale revision、stale fence、writer epoch mismatch、wrong prior state、terminal state、semantic conflictが同じfailureへ圧縮される。

callerはsafe retry、reread、failover wait、stale worker停止、terminal preservationを区別できない。

verification testだけで分類を復元することはできない。

## 5. Transaction Boundary Constraint

Atomic Transitionは次を同一transactionで扱う。

```text
Observation append
+ Request CAS
+ optional Resolution append
+ optional Outbox append
```

いずれかが失敗した場合、先行writeを含め全rollbackしなければならない。

現在のComposerはObservationをRequest CASより先にappendする。

したがって、CAS failure時に`durableTransactionSuccess({status: "conflict"})`を返すだけでは、Observationをcommitしてしまう。

詳細なconflict resultを返すためにatomicityを弱めてはならない。

Durable Transactionのgeneric failure reasonへReconciliation固有literalを無制限に追加してもならない。

## 6. Option A: Atomic Status Union Expansion

Option AはAtomic Resultのtop-level statusを次で拡張する。

```ts
type AtomicStatus =
  | "committed"
  | "stale-revision"
  | "stale-fence"
  | "writer-epoch-mismatch"
  | "terminal-preserved"
  | "conflict"
  | "corrupted"
  | "unavailable";
```

利点はcallerの分岐が直接的なことである。

欠点はauthority conflict、semantic conflict、terminal preservation、availabilityが同じtop-level namespaceへ混在することである。

status追加ごとにexhaustive consumerが破壊され、将来のconflict class追加がAtomic API version変更になりやすい。

この案はPrimaryにはしない。

## 7. Option B: Conflict Status plus Safe Conflict Class

Option Bは公開statusを`conflict`のまま維持し、boundedなsafe classを追加する。

```ts
type ReconciliationAtomicConflictClass =
  | "stale-revision"
  | "stale-fence"
  | "writer-epoch-mismatch"
  | "wrong-prior-state"
  | "semantic-conflict"
  | "terminal-preserved";

type ReconciliationAtomicConflictResult = Readonly<{
  status: "conflict";
  conflictClass: ReconciliationAtomicConflictClass;
}>;
```

利点は、top-level outcomeとsafe operational classを分離できることである。

既存の`conflict`意味を維持しつつ、Runtimeがretry policyを安全に選べる。

classはbounded enumであり、revision、fence、identity、row本文を含まない。

この案をPrimary Decisionとして採用する。

## 8. Option C: Durable Transaction Failure Reason Expansion

Option CはDurable Transaction V2のfailure reasonへReconciliation固有classを追加する。

この案は不採用とする。

Durable Transaction V2はdatabase transaction lifecycle、commit unknown、rollback、connection dispositionを所有する。

Reconciliationのstale fence、writer epoch、terminal preservationを知るべきではない。

domain literal追加はTransaction capabilityとStore semanticsを混在させる。

## 9. Option D: Diagnostic-only Classification

Option Dは公開Resultを変えず、Auditまたはdiagnosticだけへ詳細classを出す。

この案は不採用とする。

callerがsafe actionを選択できず、testがdiagnosticをbusiness resultとして解釈する必要がある。

diagnosticはcontrol flow contractではない。

## 10. Option E: Test-side Reconstruction

Option Eはtestがexpected revision、writer epoch、fence、row stateをreadして分類する。

この案は禁止する。

Production callerとtestのsemanticsが異なり、race中のauthoritative orderingも保証できない。

raw DB値の露出を誘発する。

## 11. Decision

Option Bを採用する。

公開Atomic V2 Resultは次の概念shapeを持つ。

```ts
type ReconciliationAtomicTransitionResultV2 =
  | Readonly<{
      status: "committed";
      requestRevision: string;
    }>
  | Readonly<{
      status: "conflict";
      conflictClass:
        | "stale-revision"
        | "stale-fence"
        | "writer-epoch-mismatch"
        | "wrong-prior-state"
        | "semantic-conflict"
        | "terminal-preserved";
    }>
  | Readonly<{ status: "corrupted" }>
  | Readonly<{ status: "unavailable" }>;
```

既存Atomic V1 Resultをsilentに意味変更しない。

実装工程ではversioned V2 boundaryまたは明示的なcompatible extensionとして導入する。

`conflictClass`省略を新規V2 callerに許可しない。

## 12. Store Classification Ownership

Request Storeはdatabase-authoritative failure classの最初のownerである。

CAS UPDATEが0 rowの場合、同じtransaction-bound database capabilityでauthoritative rereadを行う。

rereadは次の優先順位で分類する。

1. row不存在またはdecode不能: `corrupted`またはbounded semantic conflict
2. terminal state: `terminal`
3. writer epoch mismatch: `stale-writer`
4. fencing revision mismatch: `stale-fence`
5. revision mismatch: `stale-revision`
6. prior state不一致: `conflict`
7. その他のpredicate不一致: `conflict`

優先順位はtest都合で変更しない。

Storeの`stale-writer`はAtomic boundaryで`writer-epoch-mismatch`へ1対1変換する。

Storeはretry、failover、manual repairを決定しない。

Store Resultへexpected値、actual値、identity、digest、rowを含めない。

## 13. Atomic Composer and Executor Ownership

Atomic Composerはchild write orderingとall-or-nothing operation resultを所有する。

Atomic Executor V2はDurable Transaction Manager境界を所有し、rollback完了後にsafe Atomic Resultを返す。

Composerだけがtransaction contextを受ける現行V1 shapeでは、rollbackを要求しながらtyped domain failureをcallerへ返せない。

後続実装は次のいずれかを満たさなければならない。

- versioned Atomic Executorがmanagerの`runInTransaction`を包み、operation-local classificationをrollback後にsafe resultへ投影する
- または、transaction operation protocolへdomain-neutralなtyped abort payload capabilityを別Contractで追加する

第一候補はversioned Atomic Executorである。

classification保持にglobal variable、AsyncLocalStorage、connection locator、raw thrown errorを使用してはならない。

operation-local immutable stateだけを使用する。

Atomic ExecutorはProduction Composition Rootではない。

## 14. Failure Mapping Matrix

| Store／operation outcome | Atomic status | conflictClass | Transaction action |
|---|---|---|---|
| request updated and all child writes succeed | committed | none | commit |
| stale revision | conflict | stale-revision | rollback or safe no-write completion |
| stale fence | conflict | stale-fence | rollback |
| stale writer | conflict | writer-epoch-mismatch | rollback |
| wrong prior state | conflict | wrong-prior-state | rollback |
| terminal request | conflict | terminal-preserved | rollback or safe no-write completion |
| child semantic mismatch | conflict | semantic-conflict | rollback |
| malformed authoritative row | corrupted | none | rollback |
| database unavailable | unavailable | none | rollback |
| commit acknowledgement unknown | not an Atomic conflict | none | authoritative commit lookup |

`safe no-write completion`は、そのtransaction内でwriteが一件も実行されていないことを証明できる場合だけ許可する。

現在のObservation-first ComposerではCAS conflict時にもrollbackが必須である。

## 15. Reconciliation Runtime Ownership

RuntimeはAtomic conflictClassをpolicy actionへ変換する。

| conflictClass | Runtime action |
|---|---|
| stale-revision | authoritative reread and compare |
| stale-fence | stale worker停止、side effect禁止 |
| writer-epoch-mismatch | failover waitまたはcurrent writer再取得 |
| wrong-prior-state | reread、同一結果ならno-op、異なる結果ならconflict |
| semantic-conflict | automatic repair禁止、manual repair候補 |
| terminal-preserved | terminal truth維持、late outcomeを上書きしない |

Runtimeは`unavailable`を一回で`still-unknown`へ変換しない。

Runtimeはstale fenceをretryable Provider submitへ変換しない。

Runtimeはwriter epoch mismatchから新writer epochを推測しない。

## 16. API and Diagnostic Projection

APIは内部Atomic resultをそのまま公開しない。

Browserまたはexternal callerへ許可するのはbounded safe classまたは既存workflow-level resultだけである。

API response、Audit、Issue、test diagnosticへ次を含めない。

- expected／actual revision
- expected／actual fencing revision
- writer epoch値
- protected identity
- digest
- tenant
- SQL、SQLSTATE、constraint、table、column
- raw row、raw error、stack

内部metrics labelへ使用できる値はbounded conflictClassだけである。

`terminal-preserved`はterminal payload本文を含まない。

## 17. Compatibility and Versioning

既存Atomic V1 consumerは`status: conflict`だけを認識する。

V2導入時は次を守る。

- V1をdirect castでV2へ昇格しない
- missing conflictClassを推測しない
- versioned validatorを追加する
- Registry descriptorはV1とV2を区別する
- Runtime Bundleへ自動登録しない
- Production Readyはfalseを維持する

Store Resultの`stale-writer` literalを削除しない。

Atomic境界だけで`writer-epoch-mismatch`へ写像する。

Migration、schema、Statement parameter shapeへの影響はない。

## 18. Verification Matrix

後続Foundationは最低限次を専用fixtureで検証する。

- Store CAS miss authoritative reread
- stale revision classification
- stale fence classification
- writer epoch mismatch classification
- wrong prior state classification
- terminal-preserved classification
- semantic conflict classification
- corrupted classification
- unavailable classification
- each conflictで全child rollback
- Observation 0、Resolution 0、Outbox 0
- Request revision不変
- concurrent same revision winner 1
- loser conflictClassがstale-revision
- stale workerがProvider side effectを開始しない
- mutation isolation
- safe diagnostics
- input mutationなし
- V1 compatibility
- V2 validator and descriptor

testはdatabase rowまたはSQLSTATEからclassificationを再構成しない。

## 19. Security Boundary

Atomic failure classificationはserver-onlyである。

Classification moduleからReact、browser API、Provider credential、Production connection readerをimportしない。

AsyncLocalStorageをclassification locatorとして使用しない。

globalThis、Symbol.for、process.env、global mutable registryを使用しない。

Raw failure objectをResultへ保持しない。

Conflict classはfree-form stringではなくclosed unionとする。

## 20. Stop Conditions

次の場合は実装を停止する。

- detailed resultを返すためにpartial child writeをcommitする必要がある
- Durable Transaction V2へReconciliation固有literalを追加する必要がある
- testがrow値からclassificationを推測する必要がある
- raw thrown errorをcross-layer transportに使う必要がある
- Migrationまたはschema変更が必要になる
- Statementへraw diagnostic projectionを追加する必要がある
- Atomic ExecutorがProduction Composition Rootを所有する必要がある
- stale fence時にProvider side effectをretryする必要がある
- terminal overwriteが必要になる
- V1 Resultをdirect castする必要がある
- Runtime BundleまたはProduction Connectionへ接続する必要がある

## 21. Readiness

| Capability | Decision | Status |
|---|---|---|
| Store authority classification | authoritative reread owner | Contracted, implementation incomplete |
| Atomic public detail | conflict plus conflictClass | Contracted |
| Transaction rollback | Durable Transaction V2 | Existing |
| Typed rollback projection | versioned Atomic Executor | Not implemented |
| Runtime policy mapping | Runtime owns action | Contracted, binding incomplete |
| API projection | bounded safe projection only | Contracted, not connected |
| Migration impact | none | Ready |
| Store verification resume | after V2 classification implementation | Not yet ready |
| Runtime Durable Binding | prohibited | Not ready |
| Production Connection | prohibited | Not ready |

## 22. Implementation Sequence

後続工程は次の順序で行う。

1. versioned Atomic conflict types
2. Request Store authoritative CAS miss classifier
3. Atomic Composer classification preservation
4. versioned Atomic Executor rollback projection
5. validator and descriptor
6. pure classification tests
7. real PostgreSQL stale revision／fence／writer epoch fixtures
8. rollback visibility tests
9. Runtime mapping tests
10. existing regression
11. TypeScript、changed-scope lint、build

Production Composition、Scheduler、Worker、Provider、HTTPはこの順序に含めない。

## 23. Decision Summary

Atomic top-level statusをfailureごとに増やすOption Aではなく、`status: conflict`とbounded `conflictClass`を組み合わせるOption Bを採用する。

Storeはdatabase-authoritative classを所有する。

Atomic Composerはall-or-nothing semanticsを所有する。

Versioned Atomic Executorはrollback完了後のsafe result projectionを所有する。

Reconciliation RuntimeはconflictClassからpolicy actionを選ぶ。

APIとdiagnosticはbounded classだけを投影し、raw authority値を公開しない。

Migrationとschema変更は不要である。

## 24. Completion Statement

本Contractにより、stale revision、stale fence、writer epoch mismatch、wrong prior state、terminal state、semantic conflict、unavailable、corruptedの公開所有境界を固定した。

Store Verification Contractが要求する専用classificationはtest推測ではなくProduction同等のAtomic V2 boundaryから取得する。

PostgreSQL Reconciliation Store Adapter Foundation V1は、Atomic V2 classification実装と専用verificationが完了するまでVerification Incompleteを維持する。

Runtime Durable Binding、Production Connection、Scheduler、Worker、Provider接続は引き続き禁止する。
