# PostgreSQL Reconciliation Transition Precondition and Terminal Ownership Contract V1

## 1. Status

本書は、Reconciliation Request transition、Resolution append、Reconciliation Outbox transitionのpreconditionとterminal ownershipを固定する正式Contractである。

本書は設計決定だけを所有する。コード、test、Migration、package、Driver、Durable Transaction、Store、Runtime、Composition、Production Connectionを変更または許可しない。

本書の目的は、PostgreSQL Reconciliation Store Adapter Foundation V1の残存verification blockerを一体で解消することである。

## 2. Purpose

本書は次の三境界を決定する。

- Atomic／Request Transition V2が必須で受け取るexpected prior state
- Resolution appendが検証、lockするparent Request state
- Reconciliation Outboxの正式transition graph

これらは別々のworkaroundではなく、同じterminal-preservation原則とtransaction-bound CAS ownershipに従う。

Runtimeの事前read、test側推測、revisionだけの近似で代替してはならない。

## 3. Normative Inputs

本書は次を正規入力とする。

- `POSTGRESQL_RECONCILIATION_ATOMIC_TRANSITION_FAILURE_CLASSIFICATION_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_STORE_SCHEMA_ALIGNMENT_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_V000003_CONSTRAINT_METADATA_OWNERSHIP_DECISION_CONTRACT_V1.md`
- `POSTGRESQL_MANUAL_REPAIR_DELETION_STATE_VERIFICATION_OWNERSHIP_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`
- V000001、V000002、V000003 schema
- PostgreSQL Reconciliation Store、Runtime、Durable Transaction実装

Terminal stateはabsorbingであり、late observation、late resolution、late delivery outcomeで上書きしてはならない。

State mutation、Resolution、必要なOutbox appendは同一Durable Transactionで扱う。

## 4. Current Gap

### 4.1 Wrong Prior State

現行Atomic inputはrequest identity、expected revision、authority、next stateだけを持つ。

Expected prior stateを持たない。

Request Store transitionにもprior-state predicateがない。

現行CAS SQLはterminal stateを除外するだけである。

Revision、writer epoch、fenceが一致するnon-terminal rowは、callerが想定していないprior stateでも更新できる。

したがって`wrong-prior-state`を正式に分類できない。

### 4.2 Late Resolution

現行Resolution insertはparent RequestのFK存在だけを要求する。

Parent state、revision、writer epoch、fenceを検証またはlockしない。

そのためterminal Requestへstandalone Resolution appendが可能である。

現行Atomic順序はRequest CAS後にResolution appendするため、insertへ単純なnon-terminal predicateを加えると、正常なterminal transitionに伴うResolutionまで拒否する。

### 4.3 Outbox Transition

現行Outbox transitionは概ね`delivery_state <> delivered`をpredicateとする。

このため`reconciliation-required → delivered`が成立し得る。

`markDelivered`と`markReconciliationRequired`が競合した場合、reconciliation-requiredが先に成功してもdeliveredが後から成功できる。

Terminal overwriteとduplicate outcomeを排除できない。

## 5. Expected Prior State Options

### 5.1 Option A: Atomic Input V2だけへ追加

Atomic Executorはexpected prior stateを知るが、Request Store transitionへ渡せない。

事前readまたはcaller-side比較が必要になり、CASとの間にTOCTOUが残る。

不採用とする。

### 5.2 Option B: Request Transition V2だけへ追加

Storeはatomic predicateを持てるが、Atomic inputがintentを型付きで表現できない。

Executorがstateを推測する必要がある。

不採用とする。

### 5.3 Option C: Atomic Input V2とRequest Transition V2へ追加

Caller intent、Atomic orchestration、Store CAS、verificationが同じexpected prior stateを共有する。

Prior stateはrevision、writer epoch、fenceと同一UPDATE predicateで検証できる。

TOCTOUを防止し、wrong prior stateをauthoritativeに分類できる。

この案を採用する。

### 5.4 Option D: Runtime事前read

Runtime readとStore UPDATEの間にconcurrent transitionが入る。

Revision CASが一部raceを拒否しても、wrong prior stateというintent mismatchをStoreが所有できない。

Runtime responsibilityを過剰化するため不採用とする。

### 5.5 Option E: Revisionだけで十分とする

同じrevisionでもcallerの想定stateが異なる可能性がある。

State machine intentをrevisionへ暗黙符号化してはならない。

Failure Classification Contractの`wrong-prior-state`を失うため不採用とする。

## 6. Expected Prior State Decision

Option Cを採用する。

Atomic Input V2とRequest Transition V2の双方へexpected prior stateを必須追加する。

V1 interfaceは既存互換用に維持する。

V1 objectをdirect castでV2へ渡してはならない。

Optional fieldは禁止する。

空配列は禁止する。

Duplicate stateは禁止する。

候補型は次である。

```ts
type ReconciliationExpectedPriorState =
  | ReconciliationNonTerminalRequestState
  | readonly [
      ReconciliationNonTerminalRequestState,
      ...ReconciliationNonTerminalRequestState[]
    ];
```

複数stateを許可するのは一つのcommand semanticsが複数の明示されたnon-terminal sourceを正式所有する場合だけである。

便利な`all non-terminal`指定は禁止する。

入力validatorは配列をcopy、deduplicate検証し、順序をcanonical化する。

## 7. Terminal Expected Prior State

Terminal stateをmutation commandのexpected prior stateへ含めることは禁止する。

Terminal rowに対する同一terminal replayは、mutation transitionではなくauthoritative rereadとsemantic comparisonで処理する。

同一terminal outcomeは`terminal-preserved`またはreplayである。

異なるterminal outcomeは`terminal-preserved`またはsemantic conflictであり、overwriteしない。

Validatorはterminal stateを含むexpected prior stateをinvalid inputとして拒否する。

Storeがterminal rowをauthoritative rereadした場合は`terminal`を返し、Atomic V2は`terminal-preserved`へ写像する。

## 8. Request Transition V2 Contract

Request Transition V2は最低限次を受け取る。

- protected request identity
- expected revision
- expected prior stateまたはnon-empty state tuple
- expected writer epoch
- expected fencing revision
- next state
- safe resolution class
- safe escalation class

CAS statementは同じUPDATE predicateで次を照合する。

- identity
- revision
- prior state
- writer epoch
- fencing revision
- deletion／terminal guard

UPDATE成功時だけrevisionを一度増加する。

UPDATE 0 row時は同一transaction内でauthoritative rereadする。

## 9. Request Failure Classification Priority

Authoritative reread後の分類順は次とする。

1. row不存在またはdecode failure
2. terminal state
3. writer epoch mismatch
4. fencing revision mismatch
5. revision mismatch
6. expected prior state mismatch
7. semantic conflict

Mappingは次である。

| Condition | Store result | Atomic conflictClass |
|---|---|---|
| terminal | terminal | terminal-preserved |
| writer epoch mismatch | stale-writer | writer-epoch-mismatch |
| fence mismatch | stale-fence | stale-fence |
| revision mismatch | stale-revision | stale-revision |
| prior state mismatch | conflict | wrong-prior-state |
| semantic mismatch | conflict | semantic-conflict |

Expected値、actual値、state本文をResultへ返さない。

## 10. Resolution Ownership Options

### 10.1 Parent existenceだけを維持

Late Resolutionを拒否できないため不採用とする。

### 10.2 Runtime事前read

Resolution insertまでにparentがterminal化するTOCTOUが残るため不採用とする。

### 10.3 Insert内non-terminal predicateだけを追加

AtomicがRequestを先にterminal化する現在の順序と衝突する。

単独では不採用とする。

### 10.4 Parent precondition lockとAtomic ordering変更

Resolution append V2がparent Requestのexpected state、revision、writer epoch、fenceを同一transactionで検証し、parent rowをlockする。

AtomicはResolution append後にRequest CASを行い、全体を同一transactionでcommitする。

Late standalone ResolutionとTOCTOUを防ぎ、CAS failure時はResolutionもrollbackできる。

この案を採用する。

## 11. Resolution Parent Precondition Decision

Resolution append V2はparent preconditionを必須とする。

候補shapeは次である。

```ts
type ReconciliationResolutionParentPrecondition = Readonly<{
  requestIdentity: ProtectedIdentity<"reconciliation-request">;
  expectedRevision: string;
  expectedPriorState: ReconciliationExpectedPriorState;
  writerEpoch: string;
  fencingRevision: string;
}>;
```

Resolution Storeはparent Request state machineを決定しない。

Callerが明示したnon-terminal prior stateだけを検証する。

Standalone Resolution appendも同preconditionを必須とする。

V1 appendは互換用に維持するが、新verificationと将来Runtime bindingではV2だけを使用する。

## 12. Resolution Lock Semantics

Resolution append V2はparent Requestをtransaction-boundにlockしてpreconditionを検証する。

LockはResolution INSERTとRequest CASの間でconcurrent terminal transitionが割り込むことを防ぐ。

実装候補はfixed statement内のparent CTEとrow lockである。

Arbitrary SQL、PoolClient、ALS connection locatorを公開してはならない。

Lock timeoutはDurable Transaction optionのbounded policyに従う。

Lock取得失敗をterminalまたはnot-foundと推測しない。

Unavailableまたはretryable conflictとしてsafeに分類する。

## 13. Atomic Write Ordering Decision

Atomic V2の正式順序は次とする。

```text
1. parent preconditionを持つObservation／Resolution preparation
2. optional Resolution append V2
3. optional Outbox append
4. Request Transition V2 CAS
5. return operation success
6. transaction commit
```

Observation、Resolution、Outboxのいずれかが先にwriteされても、Request CAS failure時は全rollbackする。

Parent row lockをResolution append時に取得した場合、同transaction内のRequest CASまで保持する。

Request CAS成功後にterminal-guarded Resolutionをappendする順序は禁止する。

Atomic V1は既存互換用に維持する。

新verificationはAtomic V2 orderingだけを正とする。

## 14. Late Resolution Result Mapping

Terminal parentへのstandalone Resolution append V2はrowを作成しない。

Storeはauthoritative parent rereadにより`terminal`を返す。

Atomic V2は`conflict / terminal-preserved`へ写像する。

Parent revision mismatchは`stale-revision`である。

Parent fence mismatchは`stale-fence`である。

Parent writer mismatchは`writer-epoch-mismatch`である。

Parent prior state mismatchは`wrong-prior-state`である。

Resolution identity replayとparent terminal preservationを混同しない。

Terminal parentに既存の同一Resolutionがある場合も、new appendは行わずauthoritative existing resultを別readで扱う。

## 15. Outbox State Inventory

Reconciliation Outbox V1のdelivery stateは次である。

- `pending`
- `claimed`
- `delivered`
- `reconciliation-required`

`delivered`はterminalである。

`reconciliation-required`も通常delivery workerに対してabsorbingである。

Reconciliation-requiredはdelivery retry permissionではない。

Provider submit permissionでもない。

将来の専用Reconciliation commandだけが別Contractに基づき後続actionを決める。

## 16. Outbox Transition Graph Decision

正式graphは次である。

```text
pending
  -> claimed

claimed
  -> claimed                  renew
  -> claimed                  expired takeover, fence increment
  -> pending                  release
  -> delivered                markDelivered
  -> reconciliation-required  markReconciliationRequired

delivered
  -> no transition

reconciliation-required
  -> no delivery transition
```

Claim対象は`pending`とexpired `claimed`だけである。

`reconciliation-required`を通常claim対象へ戻してはならない。

`reconciliation-required → claimed`、`reconciliation-required → delivered`、`delivered → reconciliation-required`を禁止する。

## 17. Outbox Transition Preconditions

Renewはcurrent state `claimed`、current owner、expected fence、unexpired leaseを必須とする。

Releaseはcurrent state `claimed`、current owner、expected fence、unexpired leaseを必須とする。

Expired takeoverはcurrent state `claimed`、expired lease、new ownerを必須とし、fence、attempt、revisionを一度だけ増加する。

MarkDeliveredとmarkReconciliationRequiredはcurrent state `claimed`、expected revision、expected fence、current ownerを必須とする。

現行transition APIがownerを受け取らない場合、Outbox Transition V2へprotected claim ownerを必須追加する。

Optional ownerは禁止する。

V1は互換用に維持する。

## 18. Outbox Race Semantics

MarkDeliveredとmarkReconciliationRequiredが同じrevision、fence、ownerで競合した場合、一方だけが成功する。

Winnerはrevisionを一度増加し、claim metadataをclearする。

Loserはauthoritative rereadにより次へ分類する。

- winnerがdelivered: terminal-preserved
- winnerがreconciliation-required: terminal-preserved
- fence mismatch: stale-fence
- revision mismatchでnon-terminal: stale-revision
- owner mismatch: stale-fence

Loserが別terminalへ上書きしてはならない。

Payload、event identity、tenant bindingを変更してはならない。

## 19. Statement Ownership and Impact

Store-owned Statement CatalogがV2 statementを所有する。

必要な候補は次である。

- Request Transition V2 CAS with expected prior state
- Resolution append V2 with parent precondition and lock
- Outbox claim V2 excluding reconciliation-required
- Outbox terminal transition V2 requiring claimed state and owner

V1 statementは既存互換用に維持できる。

V1 SQLをsilentに意味変更するかV2 statement IDを追加するかは、互換testを優先して実装工程で選ぶ。

新Runtime bindingはV2だけを使用する。

SQLはparameterized、fixed、server-onlyである。

Migration、schema、constraint変更は不要である。

## 20. Backward Compatibility

Atomic V1、Request Transition V1、Resolution append V1、Outbox transition V1を既存test互換のため維持する。

V2 inputをV1へdirect castしない。

V1 inputからexpected prior stateまたはclaim ownerを推測しない。

Registry descriptorとvalidatorはV1／V2を区別する。

Production Readyはfalseを維持する。

Runtime Bundleへ自動登録しない。

V000001、V000002、V000003のchecksumは変わらない。

## 21. Validation Rules

Expected prior state validatorは次を拒否する。

- missing value
- empty array
- duplicate state
- unknown state
- terminal state
- mutable arrayの直接保持
- unbounded array

V1では最大state数をnon-terminal state inventory以下に制限する。

Inputをcopy、freezeし、caller mutationを後続commandへ伝播させない。

Outbox transition validatorはunknown target、missing owner、invalid protected owner、terminal source指定を拒否する。

Resolution parent precondition validatorはrequest identity、revision、prior state、writer epoch、fenceをすべて必須とする。

## 22. Failure Matrix

| Failure | Store classification | Atomic V2 projection | Mutation |
|---|---|---|---|
| wrong prior state | conflict | wrong-prior-state | rollback |
| stale revision | stale-revision | stale-revision | rollback |
| stale fence | stale-fence | stale-fence | rollback |
| writer epoch mismatch | stale-writer | writer-epoch-mismatch | rollback |
| terminal Request | terminal | terminal-preserved | rollback／no write |
| late Resolution | terminal | terminal-preserved | Resolution 0 |
| Resolution semantic mismatch | conflict | semantic-conflict | rollback |
| delivered overwrite | terminal | terminal-preserved | Outbox unchanged |
| reconciliation-required overwrite | terminal | terminal-preserved | Outbox unchanged |
| Outbox owner mismatch | stale-fence | stale-fence | Outbox unchanged |
| Store unavailable | unavailable | unavailable | rollback |
| malformed row | corrupted | corrupted | rollback |

## 23. Verification Matrix

後続Store Adapter verificationは最低限次を実PostgreSQLで確認する。

- Atomic V2 expected prior state validation
- single prior state CAS
- multiple explicit prior states CAS
- empty／duplicate／terminal expected state rejection
- wrong-prior-state classification
- wrong-prior-state child全rollback
- standalone late Resolution rejection
- terminal Request不変
- Resolution row 0
- Atomic terminal transition with Resolution success
- Resolution parent lock race
- Outbox pending claim
- expired claimed takeover
- reconciliation-required claim exclusion
- delivered terminal preservation
- reconciliation-required terminal preservation
- markDelivered対markReconciliationRequired winner 1
- stale owner renew／release／terminal transition rejection
- fence、revision、attemptの単調性
- V1 compatibility
- mutation isolation
- safe diagnostics

Race testをsleepまたはsetTimeout依存で成立させてはならない。

## 24. Security and Diagnostics

Result、Audit、Issue、test diagnosticへ次を含めない。

- expected／actual state本文
- revision値
- writer epoch値
- fencing revision値
- protected owner identity
- digest
- tenant
- SQL、SQLSTATE、constraint、table、column
- raw row、payload、error、stack

許可するのはbounded status、conflictClass、safe lifecycle classだけである。

StoreはPool、PoolClient、ALS connection locatorを取得しない。

Production moduleからtest helperをimportしない。

## 25. Stop Conditions

次の場合は実装を停止する。

- expected prior stateをoptionalにする必要がある
- Runtime事前readだけでCASを保証する必要がある
- terminal stateをexpected mutation sourceとして許可する必要がある
- Resolution parent lockなしでTOCTOUを許容する必要がある
- Resolutionをterminal Requestへappendする必要がある
- reconciliation-requiredを通常delivery retryへ戻す必要がある
- Outbox terminal overwriteが必要になる
- ownerなしterminal transitionが必要になる
- Migrationまたはschema変更が必要になる
- Durable Transaction V2変更が必要になる
- direct business SQLまたはarbitrary fixture SQLが必要になる
- V1をdirect castする必要がある
- Runtime CompositionまたはProduction Connectionへ接続する必要がある

## 26. Readiness Matrix

| Capability | Decision | Status |
|---|---|---|
| Expected prior state ownership | Atomic V2 + Request Transition V2 | Contracted |
| Prior state CAS predicate | Store-owned V2 statement | Ready to implement |
| Wrong prior classification | authoritative reread | Ready to implement |
| Resolution parent ownership | Resolution append V2 precondition + lock | Ready to implement |
| Atomic Resolution ordering | Resolution before final Request CAS | Ready to implement |
| Outbox transition graph | claimed-only terminal transitions | Ready to implement |
| Reconciliation-required | delivery-worker absorbing | Contracted |
| Migration impact | none | Ready |
| Store verification resume | permitted after V2 implementation | Ready |
| Runtime Durable Binding | prohibited until verification complete | Not ready |
| Production Connection | prohibited | Not ready |

## 27. Existing Contract Amendment List

既存Contractは今回変更しない。

将来改訂時は次を反映する。

- Atomic Failure Classification Contractへexpected prior state必須を追記
- Store Adapter completion gateへResolution parent lockを追記
- Outbox delivery verificationへreconciliation-required absorbing semanticsを追記
- Runtime binding readinessへV2 transition capability必須を追記

本書がこれら三blockerに対する後続の正規Decisionを所有する。

## 28. Implementation Sequence

後続工程は次の順序で行う。

1. V2 expected prior state types and validator
2. Request Transition V2 statement and Store method
3. Resolution parent precondition types
4. Resolution append V2 lock statement and Store method
5. Atomic V2 write ordering update
6. Outbox V2 transition graph types
7. Outbox claim／terminal transition V2 statements
8. Store and Executor validators
9. pure Contract tests
10. real PostgreSQL race tests
11. V1 compatibility regression
12. TypeScript、changed-scope lint、build

Migration、Runtime Composition、Scheduler、Worker、Providerはこのsequenceに含めない。

## 29. Decision Summary

Expected prior stateはAtomic Input V2とRequest Transition V2の双方へ必須追加する。

CAS SQLはprior stateをrevision、writer epoch、fenceと同じpredicateで照合する。

Runtime事前readだけでは保証しない。

Resolution append V2はparent preconditionを検証してrow lockを取得する。

Atomic V2はResolutionをparent terminal CASより前にappendし、CAS failure時は全rollbackする。

Outbox terminal transitionはclaimed state、owner、revision、fenceを必須とする。

Deliveredとreconciliation-requiredは通常delivery workerに対してabsorbingである。

Migrationとschema変更は不要である。

## 30. Completion Statement

本Contractにより、wrong-prior-state、Late Resolution、Outbox terminal overwriteの三blockerを一体で解消した。

Option Cを採用し、V1互換を維持しながら明示的なV2 capabilityへ移行する。

PostgreSQL Reconciliation Store Adapter実装とverificationは、本書に従って再開可能である。

Runtime Durable Binding、Scheduler、Worker、Provider、Production Connectionは引き続き禁止する。
