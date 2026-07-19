# PostgreSQL Manual Repair Deletion State Verification Ownership Contract V1

## 1. Status

本書は、Manual Repair approvalに対するdeleted state guardと、deleted rowを生成するlifecycle責務の所有境界を固定する正式Contractである。

本書は設計決定だけを所有する。コード、test、SQL migration、Store API、Runtime Composition、Production Connectionを変更または許可しない。

本書の決定は、PostgreSQL Reconciliation Store Adapter Foundation V1のverification再開条件を定める。

## 2. Purpose

目的は次の五つの責務を分離することである。

- deletion stateを生成、遷移させる責務
- current deletion stateをapproval時に確認する責務
- deleted repairへのapprovalをsafeに拒否する責務
- 実PostgreSQL verification用fixtureを構成する責務
- retention期限到達後にphysical purgeする責務

Approval Storeへdelete APIを追加して責務を集約してはならない。

Synthetic fixtureだけでdeleted rowの実DB verificationが完了したと扱ってはならない。

## 3. Normative Inputs

本書は次を正規入力とする。

- `POSTGRESQL_RECONCILIATION_STORE_SCHEMA_ALIGNMENT_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_V000003_CONSTRAINT_METADATA_OWNERSHIP_DECISION_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_OPERATIONAL_POLICY_DECISION_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `V000002__add_workflow_reconciliation_schema.sql`
- `V000003__align_reconciliation_store_schema.sql`
- `postgresqlReconciliationStores` server-only module

Operational Policyはretention job、physical purge、legal hold解除をOperationsおよびData Lifecycle側へ割り当てている。

Reconciliation Runtimeはretention physical purgeを所有しない。

## 4. Current Gap

V000002でManual Repair rowは`deletion_state`を保持する。

許可される値は`active`、`deletion-pending`、`deleted`である。

V000003はidentity metadata、semantic fingerprint、writer epoch、fencing metadataを補強したが、Manual Repair deletion mutation capabilityを追加していない。

現在のApproval Storeはdeleted repairを更新してはならない。

既存approval statementには`deletion_state = 'active'` predicateがあり、active以外のrowを更新対象から除外する。

一方、public `ManualRepairRecord`はdeletion stateを公開しない。

Manual Repair Storeには`markDeleted`、`delete`、`expire`、`purge` APIがない。

正規Store APIだけを使ってdeleted rowを作る実DB fixture経路は存在しない。

testからarbitrary SQLまたはdirect business SQLを発行してこのgapを隠してはならない。

Synthetic decoder fixtureはapproval guardのpure classificationを補助できるが、PostgreSQL predicateの実証にはならない。

## 5. Ownership Options

### 5.1 Option A: Manual Repair Storeへdelete APIを追加

この案は既存Storeへ`markDeleted`または`delete`を追加する。

実DB fixtureは構成しやすいが、approval、repair lifecycle、retention eligibility、physical deletionを一つのStoreへ混在させる。

Store APIが肥大化し、将来Retention Workerの責務を先取りする。

今回のFoundationでは不採用とする。

### 5.2 Option B: Manual Repair Lifecycle Storeを追加

この案はapprovalとは別のlifecycle Storeを新設する。

責務分離はOption Aより良いが、retention policy owner、legal hold、purge eligibilityが未接続のままManual Repair専用lifecycleを確定する。

将来のRetention／Deletion capabilityと二重truthになる可能性がある。

将来候補として保持するが、Primary Decisionにはしない。

### 5.3 Option C: Retention／Deletion capabilityがmutationを所有

この案では、deletion state mutationは将来のRetention／Deletion capabilityが所有する。

Approval Storeはdeletion mutationを行わない。

Retention／Deletion capabilityはrevision、writer epoch、fencing revision、legal hold、terminal lifecycle、retention eligibilityを検証して状態遷移する。

Physical purgeは状態遷移とは別のbounded operationであり、同capability内でも別commandとして扱う。

責務分離、将来Retention Workerとの整合、Production semanticsの面で最も適切である。

### 5.4 Option D: Approval guardとtest-only lifecycle fixtureを分離

この案では、Approval Storeは既存approval statementの`deletion_state = 'active'` predicateだけを所有する。

実DB verificationでは、tests/helpers配下のtest-only lifecycle fixture adapterがallowlisted deletion transitionだけを実行する。

adapterはProduction Storeではなく、Production ReadyでもRuntime Composableでもない。

Migrationは不要である。

任意SQL APIを公開しないことを条件に採用可能である。

### 5.5 Option E: Synthetic verificationへ全面委譲

この案ではdeleted guardをSynthetic fixtureだけで検証し、実DB lifecycleを将来工程へ委譲する。

decoderおよびresult mappingの検証には有効だが、PostgreSQLのactive predicateとrevision不変を証明できない。

補助verificationとしては許可するが、実DB approval verificationの代替にはしない。

## 6. Decision

Option C + Dを採用する。

優先順位は次である。

1. Retention／Deletion capabilityがdeletion mutationを所有する。
2. Manual Repair Approval Storeがapproval guardを所有する。
3. test-only lifecycle fixture adapterが実DB fixture構成だけを所有する。
4. Synthetic fixtureはdecoderおよびsafe result補助だけを所有する。

Option C + Eだけでは実DB predicate verificationが不足するためPrimaryにはしない。

Option BはRetention／Deletion ContractがManual Repair専用lifecycle分割を要求した場合だけ再評価する。

Option Aは不採用である。

## 7. Deletion Mutation Ownership

正式なdeletion mutation ownerは将来のRetention／Deletion capabilityである。

このcapabilityは少なくとも次を所有する。

- activeからdeletion-pendingへのrevision-aware遷移
- deletion-pendingからdeletedへのrevision-aware遷移
- stale revision拒否
- writer epoch検証
- fencing revision検証
- legal hold拒否
- terminal lifecycle確認
- retention eligibility確認
- bounded physical purge command
- safe audit projection

Physical purgeは`deletion_state = 'deleted'`への論理遷移と同じ操作ではない。

Approval Store、Reconciliation Runtime、Provider、Schedulerはdeletion mutationを所有しない。

今回のContractはProduction Retention／Deletion capability実装を許可しない。

## 8. Approval Guard Ownership and Result

Manual Repair Approval Storeはcurrent rowがapproval可能かをstatement predicateで確認する。

approval predicateは次を同時に要求する。

- expected protected repair identity
- expected revision
- expected prior stateが`requested`
- expected writer epoch
- expected fencing revision
- requesterとapproverのseparation
- high-risk action allowlist
- semantic fingerprint一致
- `deletion_state = 'active'`
- schemaとOperational Policyが要求するlegal hold semantics

Approval Storeはdeletion stateを変更しない。

deletedまたはdeletion-pending rowでUPDATE件数が0の場合、既存Result unionとの整合を優先する。

safe resultは`terminal`を採用する。

新しい`deleted` literalは追加しない。

理由は、callerへraw lifecycle値を公開せず、approval不能なabsorbing lifecycleを既存のsafe terminal classificationで表現できるためである。

ただし、revision、writer epoch、fenceの明確な不一致をauthoritative rereadで判定できる場合は、既存の`stale-revision`、`stale-writer`、`stale-fence`を優先してよい。

deleted rowのraw state、row本文、identity、digestをResult、Audit、diagnosticへ返してはならない。

## 9. Test Fixture Ownership

実DBfixture ownerはtests/helpers配下のtest-only lifecycle fixture adapterである。

adapter descriptorは最低限次を固定する。

```text
testOnly: true
productionReady: false
runtimeComposable: false
arbitrarySqlPermitted: false
```

adapterはProduction moduleからimportしてはならない。

adapterはruntime registry、composition root、browser bundleへ登録してはならない。

adapterが公開できる操作はallowlisted Manual Repair deletion fixture transitionだけである。

SQL文字列、table名、column名、Pool、PoolClientをtest caseへ公開してはならない。

adapter内部のstatementはtest bridge ownerであり、Production Statement Catalogへ登録しない。

transitionはexpected revision、writer epoch、fencing revision、legal holdを検証する。

constraintをdisable、defer、迂回してはならない。

adapterはactive rowをdeletedへ無条件更新しない。正式なrevision-aware fixture transitionを使用する。

adapterの存在をProduction Retention／Deletion capability完成の証拠にしてはならない。

fixture終了後はtransaction、connection、temporary registrationを確実に解放する。

## 10. Statement and Migration Impact

既存`reconciliation.repair.approve` statementは既に`deletion_state = 'active'` predicateを持つ。

したがって現時点のapproval guardについて次を決定する。

- 新approval statementは不要
- Production deletion statementは追加しない
- Migration変更は不要
- V000004は不要
- schema変更は不要

実装再開時は、既存predicateがStatement Catalog metadata、parameter count、cardinality、access modeを壊していないことを再監査する。

test-only fixture statementはProduction Statement Catalogの一部ではない。

test-only statement IDはtest bridge内でallowlistされ、arbitrary SQL executorへ昇格してはならない。

## 11. Legal Hold

Deletion stateとlegal holdは別概念である。

Legal holdはretention期限到達後の削除およびphysical purgeを禁止する。

V000002は`deleted + held`をCHECKで禁止している。

Legal holdをdeleted stateの代用にしてはならない。

Approval Storeはlegal holdを設定、解除、推測しない。

Operational Policyはlegal hold中のmutationをhold owner approvalなしに行わないと定める。

したがってapprovalがlegal hold中に常に許可されるとは決定しない。

Approval Storeのlegal hold guardを追加または変更する場合は、authorizationおよびhold owner policyを固定する別Contractが必要である。

今回のdeleted verification fixtureは`legal_hold_state = 'none'`だけを対象とする。

Legal hold rejection matrixはRetention／Deletion capability verificationへ委譲する。

## 12. Verification Separation

### 12.1 Approval Store real PostgreSQL verification

Store Adapter Foundationは次を実PostgreSQLで検証する。

- active high-risk repair approval成功
- test-only lifecycle fixtureで準備したdeleted repairのapproval拒否
- approval拒否後のrevision不変
- approval拒否後のapproved_at不変
- safe resultが`terminal`
- raw identity、digest、row、lifecycle本文の非露出
- Approval Storeがdeletion mutationを行わないこと

このverificationはApproval Storeのguardだけを証明する。

### 12.2 Deletion Lifecycle verification

次は将来のRetention／Deletion capability Foundationへ委譲する。

- Production deletion state transition
- stale revision matrix
- writer epoch matrix
- fencing revision matrix
- legal hold matrix
- retention eligibility
- terminal stateとの整合
- deletion-pending recovery
- physical purge
- bounded batch ownership

test-only fixture adapterのtestは、allowlist、revision-aware mutation、hold拒否、Production非接続というfixture boundaryだけを検証する。

## 13. Existing Contract Amendment List

既存文書は今回変更しない。

将来改訂時は次を反映する。

- Manual Repair approval invalid matrixにtest-only lifecycle fixture経由のdeleted guardを明記する。
- PostgreSQL Reconciliation Store Adapter completion gateはdeleted lifecycle完成ではなくdeleted approval guard実証を要求する。
- tests/helpersにallowlisted lifecycle fixture adapterを許可する。
- Retention／Deletion capabilityがProduction deletion mutationとpurgeを所有すると明記する。
- Runtime Durable Binding readinessはApproval Store guard完了後に再評価する。
- Production readinessはRetention／Deletion capability未実装のままCompleteにしない。

Store Adapter FoundationのCompleteはProduction retention lifecycleのCompleteを意味しない。

## 14. Failure and Stop Conditions

次の場合、本Contractまたは実装再開をIncompleteとして停止する。

- deletion mutation ownerがRetention／Deletion capability以外へ暗黙移動する
- approval guard ownerが不明になる
- arbitrary test SQLが必要になる
- direct business SQLがtest caseへ露出する
- Migration変更またはV000004が必要になる
- constraint disableまたはalternate schemaが必要になる
- Approval StoreがRetention責務を所有する必要が生じる
- legal holdをdeletedの代用にする必要が生じる
- safe Result mappingが既存unionで表現できない
- test-only fixtureをProduction capabilityとして登録する必要が生じる
- raw identity、digest、row、SQLSTATE、constraint名をdiagnosticへ出す必要が生じる

## 15. Readiness Matrix

| Item | Decision | Readiness |
|---|---|---|
| Deletion mutation owner | Future Retention／Deletion capability | Contracted, implementation not started |
| Approval guard owner | Manual Repair Approval Store | Ready |
| Approval guard predicate | `deletion_state = 'active'` | Existing |
| Safe result | `terminal` | Ready |
| Test fixture owner | test-only lifecycle fixture adapter | Ready to implement |
| Production deletion API | Not part of this Foundation | Prohibited |
| Production deletion statement | Not added | Prohibited |
| Migration impact | None | Ready |
| Legal hold deletion policy | Retention／Deletion capability | Future verification |
| Store Adapter verification | May resume | Ready |
| Runtime Durable Binding | Wait for complete Store verification | Not ready |
| Production Connection | Forbidden | Not ready |
| Production readiness | Requires Retention／Deletion Foundation and launch gates | Not ready |

## 16. Completion Statement

本Contractはdeletion mutation、approval guard、test fixture、physical purgeの所有者を分離した。

採用DecisionはOption C + Dである。

Deletion mutation ownerは将来のRetention／Deletion capabilityである。

Approval guard ownerはManual Repair Approval Storeである。

Safe resultは既存unionの`terminal`である。

実DBfixture ownerはProduction非対応のtest-only lifecycle fixture adapterである。

既存approval statementのactive predicateを維持し、Production deletion statementとMigrationは追加しない。

PostgreSQL Reconciliation Store Adapter Verificationは再開可能である。

Runtime Durable BindingとProduction Connectionは未許可である。
