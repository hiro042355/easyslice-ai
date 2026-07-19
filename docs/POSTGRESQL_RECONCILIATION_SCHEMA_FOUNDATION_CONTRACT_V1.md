# PostgreSQL Reconciliation Schema Foundation Contract V1

## 1. Status

本書はWorkflow Reconciliation Runtime V1のdurable truthをPostgreSQLへ保存するV000002候補schemaの設計Contractである。

本書はSQL migrationではない。

本書はMigration、Store、Runtime、Production ConnectionまたはCompositionの実装を許可しない。

## 2. Purpose

Reconciliation Request、Observation Journal、claim／lease／fence、temporal policy、resolution、manual repair escalation、Outbox integrationを、V000001のSlice A truthから分離して永続化する。

## 3. Normative Sources

- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `WORKFLOW_PRODUCTION_READINESS_GAP_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_RUNTIME_INTERFACE_CONTRACT_V1.md`
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `SLICE_A_COMMIT_UNKNOWN_RESULT_OWNERSHIP_CONTRACT_V1.md`
- `SLICE_A_POSTGRESQL_CORRUPTION_VERIFICATION_CONTRACT_V1.md`
- `V000001__initialize_slice_a_workflow_schema.sql`

## 4. Current Completion

PostgreSQL Test Environment、V000001、Driver、Durable Transaction V2、Slice A Store V2はCompleteである。

Reconciliation Runtime Contract V1はCompleteである。

Reconciliation Runtime implementation、durable schema、Scheduler、Worker、Webhook、Production Compositionは未開始である。

## 5. V000001 Ownership

V000001は次を所有する。

- Final Result
- Result Reference
- Outbox Event
- schema metadata
- writer epoch

## 6. V000001 Non-ownership

V000001は次を所有しない。

- Reconciliation request
- bounded observation policy
- observation journal
- reconciliation claim／lease／fence
- resolution history
- manual repair escalation
- Provider lookup evidence summary
- temporal `still-unknown` state

## 7. Prohibited Storage Shortcuts

Reconciliation stateをGeneration Jobへ詰め込まない。

Reconciliation stateをSlice A Outbox payloadへ詰め込まない。

Reconciliation stateをAuditへ詰め込まない。

Reconciliation stateをFinal Result terminal payloadへ詰め込まない。

Raw Provider responseをJSONBへ保存してschema設計を回避しない。

## 8. Schema Namespace Decision

V000002候補は既存の`workflow` schemaを継続利用する。

ReconciliationはWorkflow durable truthと同じtransaction domainに属する。

別schemaは権限分離上の利点があるが、V1ではcross-schema ownership、migration順序、transaction boundaryを増やす。

table名とrole privilegeで責務を分離する。

## 9. Namespace Alternatives

`workflow_reconciliation`別schemaは将来の独立service化候補である。

V1で別schemaを採用しない理由は、writer epoch、schema metadata、Workflow CAS、Outboxとの整合を一つのmigration domainで管理するためである。

## 10. Candidate Migration

候補migration identifierは`V000002`である。

候補nameは`V000002__add_workflow_reconciliation_foundation.sql`である。

本書ではSQL fileを作成しない。

V000002はforward-only、transactional、additiveでなければならない。

## 11. Candidate Tables

候補tableは次の5つである。

1. `workflow.workflow_reconciliation_requests`
2. `workflow.workflow_reconciliation_observations`
3. `workflow.workflow_reconciliation_resolutions`
4. `workflow.workflow_reconciliation_manual_repairs`
5. `workflow.workflow_reconciliation_outbox_events`

## 12. Separation Rationale

Requestはcurrent mutable coordination stateである。

Observationはappend-only evidence summaryである。

Resolutionはappend-only decision historyである。

Manual Repairはauthorized operator command metadataである。

Reconciliation OutboxはReconciliation state transitionと同一transactionでappendするdelivery intentである。

## 13. Reconciliation Request Purpose

`workflow_reconciliation_requests`は一つのprotected reconciliation identityに対するcurrent durable stateを所有する。

一つのrequest rowは一つのlogical uncertaintyを表す。

attemptごとにrequest rowを増やさない。

## 14. Request Primary Identity

`reconciliation_request_id`はinternal UUID primary key候補である。

UUIDはinjected generatorが所有し、protected identityから導出しない。

public ReferenceまたはProvider job handleとして使用しない。

## 15. Protected Request Identity

次の列候補を持つ。

- `identity_digest_algorithm`
- `identity_digest_version`
- `identity_digest`
- `identity_domain`

V1 algorithmは`sha256`、versionは`1`、digest lengthは32 bytes候補である。

digestはkeyed、domain-separated factoryだけが生成する。

## 16. Identity Uniqueness

`identity_digest_algorithm`、`identity_digest_version`、`identity_domain`、`identity_digest`にUNIQUE候補を置く。

同一identityかつ同一semantic fingerprintはreplayである。

同一identityかつ異なるfingerprintはconflictである。

## 17. Semantic Fingerprint

Requestはprotected semantic fingerprint候補を持つ。

- `fingerprint_digest_algorithm`
- `fingerprint_digest_version`
- `fingerprint_digest`

fingerprintへraw inputを保存しない。

## 18. Tenant and Ownership Binding

候補列は次である。

- `tenant_digest`
- `owner_digest`
- `region`
- `operation`

raw tenant、email、account ID、Provider credentialを保存しない。

tenant／owner digestは32 bytes CHECK候補である。

## 19. Operation

V1 operation候補は`generate-vocal`、`generate-music`、`generate-mv`である。

operation不明のrequestを作成しない。

Reference kindまたはProvider handleからoperationを推測しない。

## 20. Trigger Class

`trigger_class`候補は次である。

- `database-commit-unknown`
- `provider-submit-unknown`
- `provider-poll-unknown`
- `output-ingestion-unknown`
- `cancellation-unknown`
- `webhook-scheduler-race`
- `outbox-delivery-unknown`
- `terminal-conflict`
- `manual-repair-requested`

CHECKはallowlist候補とする。

## 21. Reason Class

`reason_class`はsafe bounded enumである。

候補はacknowledgement loss、timeout、lookup inconsistency、late event、stale fence、CAS conflict、partial ingestion、delivery uncertainty、operator requestである。

raw error、SQLSTATE、constraint名、Provider messageを保存しない。

## 22. Request State

`request_state`候補は次である。

- `pending`
- `claimed`
- `retry-wait`
- `resolved`
- `still-unknown`
- `corrupted`
- `manual-repair-required`
- `closed`

`unavailable`はattempt observationであり、永続terminal stateとして直ちに使用しない。

## 23. Request Lifecycle

基本遷移候補は次である。

```text
pending
→ claimed
→ retry-wait | resolved | corrupted | still-unknown | manual-repair-required

retry-wait
→ claimed

corrupted | still-unknown
→ manual-repair-required | closed

resolved
→ closed
```

`closed`から自動復帰しない。

## 24. Revision

`revision bigint NOT NULL`候補を持つ。

初期値は0候補である。

すべてのmutable transitionはexpected revision CASを要求する。

revisionは単調増加し、negativeをCHECKで拒否する。

## 25. Record Versions

候補列は次である。

- `record_version`
- `schema_version`
- `policy_version`

V000002初期値候補はすべて1である。

version CHECKを持つ。

## 26. Temporal Policy State

Requestはbounded observation policyのcurrent stateを正規化列で保持する。

候補列は次である。

- `attempt_count`
- `first_observed_at`
- `last_observed_at`
- `next_eligible_at`
- `policy_deadline_at`
- `last_source_class`
- `last_outcome_class`

arbitrary retry plan JSONを保存しない。

## 27. Attempt Count

`attempt_count integer NOT NULL`候補で、0以上のCHECKを持つ。

attempt reservation時にtransaction内で増加する。

Browser retry countと共有しない。

## 28. Database-authoritative Time

created、updated、claim、lease、observation、resolution timestampはdatabase timeを正とする。

request supplied timestampをauthorityにしない。

`transaction_timestamp()`またはContractで選定するdatabase clockを使用する。

## 29. still-unknown Persistence

`still-unknown`はRequest stateとしてReconciliationだけが設定できる。

単一Store `unavailable`で設定しない。

policy deadlineとbounded attempt exhaustionの両方またはversioned policy条件を満たす必要がある。

`still-unknown`はProvider resubmit permissionではない。

## 30. Claim Columns

Request候補列は次を持つ。

- `claim_owner_digest`
- `fencing_revision`
- `lease_acquired_at`
- `lease_expires_at`

claim ownerはprotected worker identityである。

raw hostname、process ID、pod nameを保存しない。

## 31. Claim Invariant

`claimed`ではowner、fence、acquired、expiryがすべてNOT NULL相当である。

非claimed stateでは原則すべてNULLである。

CHECKで組合せを固定する。

## 32. Lease

lease expiryはtakeoverを許可する。

lease expiryだけではProvider submit、Workflow Start、billing mutation、Asset deletionを許可しない。

renewはcurrent owner、fence、non-terminal state、unexpired leaseを要求する。

## 33. Fencing

`fencing_revision bigint`候補はtakeoverごとに単調増加する。

negative fenceを拒否する。

stale ownerのobservation checkpoint、resolution、releaseを拒否する。

## 34. Due Work Index

候補partial indexは`request_state IN ('pending','retry-wait','claimed')`を対象とする。

key候補は`next_eligible_at`、`lease_expires_at`、`reconciliation_request_id`である。

Schedulerはこのindexからbounded batchをclaimする。

## 35. Active Identity Index

同一protected identityに複数active requestを許可しない。

identity UNIQUEが全lifecycleで一意性を保持する案を第一候補とする。

再openは同じrowのversioned transitionまたは新Contractを要求する。

## 36. Observation Journal Purpose

`workflow_reconciliation_observations`は各source observationのsafe summaryをappend-onlyで保持する。

Observationはauthoritative raw evidenceのコピーではない。

Request current stateをObservation rowから無条件に再構築しない。

## 37. Observation Identity

`observation_id`はinternal UUID primary key候補である。

`reconciliation_request_id`はRequestへのimmediate FKである。

`observation_sequence bigint`をrequest単位で単調増加させる。

request IDとsequenceにUNIQUE候補を置く。

## 38. Observation Attempt Binding

候補列は次である。

- `attempt_number`
- `request_revision_observed`
- `fencing_revision_observed`
- `source_class`
- `outcome_class`
- `observed_at`

stale fenceからのappendを許可しない。

## 39. Observation Source Class

候補allowlistは次である。

- `slice-a-store`
- `generation-submit-idempotency`
- `provider-job-lookup`
- `safe-journal`
- `webhook-inbox`
- `terminal-store`
- `output-ingestion-store`
- `outbox-delivery-ledger`
- `cancellation-store`

Provider名をsource classへ埋め込まない。

## 40. Observation Outcome Class

候補allowlistは次である。

- `committed`
- `not-committed`
- `found`
- `not-found`
- `pending`
- `terminal`
- `unavailable`
- `conflict`
- `corrupted`
- `malformed`
- `stale`

`still-unknown`は単一Observation outcomeではない。

## 41. Observation Summary

最小の`safe_summary jsonb`候補を許可できる。

用途はbounded safe flagsおよびversioned enum projectionだけである。

最大size CHECK、object type CHECK、summary versionを要求する。

正規化可能なpredicateをJSONBだけへ隠さない。

## 42. Observation Prohibitions

Observationへ次を保存しない。

- raw database row
- SQLまたはSQLSTATE
- constraint名
- Provider response body
- Provider URL
- Provider job handle
- credential
- Reference
- Asset ID
- tenant raw value
- idempotency key
- raw error

## 43. Observation Immutability

Observation rowはUPDATEしない。

訂正は新しいObservation rowとResolution decisionで表現する。

DELETEはretention ownerによるlifecycle processだけに限定する。

## 44. Observation Indexes

候補indexは次である。

- `(reconciliation_request_id, observation_sequence)` UNIQUE
- `(reconciliation_request_id, observed_at)`
- `(source_class, outcome_class, observed_at)`のbounded operational index

tenant digestをmetrics query indexへ無条件に含めない。

## 45. Resolution History Purpose

`workflow_reconciliation_resolutions`は各resolution decisionをappend-onlyで保持する。

Request current stateとResolution historyを分離する。

同一decision replayでduplicate historyを作成しない。

## 46. Resolution Identity

`resolution_id`はinternal UUID primary key候補である。

`resolution_identity_digest`はversioned protected idempotency identity候補である。

Request FKとresolution identityにUNIQUE候補を置く。

## 47. Resolution Columns

候補列は次である。

- `reconciliation_request_id`
- `resolution_sequence`
- `resolution_status`
- `resolution_outcome`
- `escalation_class`
- `request_revision_before`
- `request_revision_after`
- `fencing_revision`
- `policy_version`
- `resolved_at`
- `record_version`
- `schema_version`

## 48. Resolution Status

候補は`resolved`、`pending`、`still-unknown`、`corrupted`、`unavailable`である。

`unavailable` resolutionはattempt結果のprojectionであり、Request terminal transitionを必須としない。

## 49. Resolution Outcome

候補は次である。

- `committed`
- `not-committed`
- `provider-job-found`
- `provider-job-not-found`
- `terminal-preserved`
- `cancelled`
- `retry-later`
- `manual-repair`
- `operator-review`

OutcomeからProvider resubmit permissionを推測しない。

## 50. Resolution Atomicity

Request CAS、Resolution append、必要なReconciliation Outbox appendを同一transactionで行う。

Observation外部I/Oはこのtransaction外で完了している必要がある。

Resolution commit unknownはprotected resolution identityでauthoritative lookupする。

## 51. Resolution Immutability

Resolution historyはUPDATEしない。

後続decisionは新しいsequenceでappendする。

Terminal ResultをResolution historyから上書きしない。

## 52. Manual Repair Purpose

`workflow_reconciliation_manual_repairs`はauthorized operator commandのmetadataを保持する。

direct DB editの代替command boundaryである。

repair payloadの自由形式保存場所ではない。

## 53. Manual Repair Identity

候補列は次である。

- `manual_repair_id` internal UUID
- `command_identity_digest`
- `reconciliation_request_id` FK
- `actor_identity_digest`
- `authorization_decision_class`

command identityはidempotent replayに使用する。

## 54. Manual Repair State

候補は`requested`、`authorized`、`rejected`、`executing`、`reconciled`、`deferred`、`terminal-safe-failure`である。

`authorized`なしに`executing`へ進まない。

repairもexpected revisionとfenceを要求する。

## 55. Manual Repair Metadata

候補列は次である。

- `repair_action_class`
- `safe_reason_class`
- `request_revision_expected`
- `request_revision_result`
- `requested_at`
- `authorized_at`
- `completed_at`
- `revision`
- `record_version`
- `schema_version`

自由記述operator noteはV1 schemaへ保存しない。

## 56. Manual Repair Prohibitions

Credential、Provider handle、Reference、Asset ID、raw tenant、raw evidence、SQLを保存しない。

Manual Repair tableからarbitrary SQL executionを構築しない。

terminal overwrite action classを定義しない。

automatic corruption repair actionを定義しない。

## 57. Manual Repair Uniqueness

protected command identityにUNIQUE候補を置く。

同一command replayは同じresultを返す。

同じRequestに複数pending/executing repairを許可しないpartial UNIQUE候補を評価する。

## 58. Reconciliation Outbox Need

V000001の`workflow_outbox_events`は`result_id NOT NULL`でFinal Resultへ結合される。

Provider submit unknown、cancel unknown、manual repair requestはFinal Resultが存在しない場合がある。

したがってV000001 Outbox payloadへの詰込みまたはfake result作成を禁止する。

## 59. Reconciliation Outbox Decision

専用`workflow_reconciliation_outbox_events` tableをV000002候補とする。

Request state transitionと同一transactionでappendする。

既存Slice A Outbox tableを変更しない。

## 60. Reconciliation Outbox Identity

候補列は次である。

- `event_id` internal UUID
- `event_identity_digest`
- `reconciliation_request_id` FK
- `event_type`
- `payload_version`
- `schema_version`

event protected identityにUNIQUE候補を置く。

## 61. Reconciliation Outbox Payload

`safe_payload jsonb`候補はbounded safe projectionだけを含む。

候補内容はrequest state class、resolution class、escalation class、policy versionである。

Observation raw summary、Provider response、manual repair detailsを含めない。

object typeとsize CHECKを持つ。

## 62. Reconciliation Outbox Delivery

候補列はV000001 Outboxと同型の安全なdelivery coordinationを採用する。

- `delivery_state`
- `attempt`
- `next_eligible_at`
- `claim_owner_digest`
- `fencing_revision`
- `lease_expires_at`
- `delivered_at`
- `safe_failure_class`
- `revision`

## 63. Outbox Delivery States

候補は`pending`、`claimed`、`delivered`、`reconciliation-required`である。

stateとnullable delivery columnsの組合せをCHECKで固定する。

delivery acknowledgement unknownをblindly deliveredにしない。

## 64. Outbox Event Types

event typeはlowercase bounded patternを要求する。

候補例は`workflow.reconciliation.requested`、`workflow.reconciliation.resolved`、`workflow.reconciliation.escalated`である。

具体的event catalogは別Contractで固定する。

## 65. Foreign Keys

Observation、Resolution、Manual Repair、Reconciliation OutboxはRequestへimmediate FKを持つ。

FKは`ON DELETE RESTRICT`候補である。

Reconciliation RequestからFinal Resultへの必須FKは置かない。

全trigger classでFinal Resultが存在するとは限らないためである。

## 66. Optional Slice A Binding

Database Commit UnknownではFinal Result identity classとのprotected bindingをRequestに持てる。

internal Final Result UUIDをnullable FKとして持つ案は、commit unknownでrow不存在の場合を表現できないためprimary lookupにしない。

protected aggregate digestとbinding classを使用する。

## 67. Provider Binding Summary

Provider observation summaryには`provider_binding_class`、`provider_api_version_class`、`provider_operation_class`のsafe projection候補を持てる。

Provider account ID、job ID、credential IDを保存しない。

opaque protected handleの所有は専用Vault Contractへ残す。

## 68. Store Observation Summary

Slice A観測は`all-present`、`all-absent`、`partial`、`duplicate`、`unavailable`のsafe class候補で表す。

Final／Reference／Outbox row本文を複製しない。

Store resultの`still-unknown`を保存しない。

## 69. Webhook Summary

Webhook observationはvalidated inbox eventのsafe statusとrevision classだけを参照する。

Webhook payloadをObservation Journalへコピーしない。

Webhook Inbox schemaは本Contractの対象外である。

## 70. Temporal Invariants

候補invariantは次である。

- `created_at <= updated_at`
- `first_observed_at <= last_observed_at`
- `last_observed_at <= policy_deadline_at`
- `lease_acquired_at < lease_expires_at`
- `next_eligible_at <= policy_deadline_at`はpending policyで要求可能
- resolution timestampはrequest creation以後

NULL可能列の組合せをstate CHECKと合わせる。

## 71. still-unknown Invariant

`request_state = 'still-unknown'`ではclaim columnsはNULLである。

policy version、attempt count、first observed、last observed、deadline、escalation classを要求する。

`still-unknown`からProvider submit permissionを表す列を持たない。

## 72. Corrupted Invariant

`corrupted`はpartialまたはinconsistent authoritative observationのsafe classificationである。

raw invalid valueを保存しない。

corrupted requestはautomatic retry対象にしない。

manual repairまたはclosedへだけ遷移可能とする。

## 73. Resolution Invariant

`resolved`ではresolution outcomeとresolved timestampを要求する。

claim columnsはNULLである。

terminal result payloadをRequestへコピーしない。

## 74. Lifecycle Columns

RequestとManual Repairは`deletion_state`、`legal_hold_state`、`retention_class`候補を持つ。

Observation、Resolution、Outboxのretentionはparent Request lifecycleまたは明示ownerに従う。

retention durationはTBDでありmigrationへ数値を埋め込まない。

## 75. Deletion

active、claimed、retry-wait、manual-repair-required、still-unknown requestを自動削除しない。

child rowsが存在するRequestのphysical deleteはRESTRICTする。

deletionはmark、eligibility、child cleanup、final deleteの段階処理とする。

## 76. Legal Hold

legal hold中のRequest、Observation、Resolution、Manual Repair、Outboxを削除しない。

hold detailsをbrowserまたはProviderへ公開しない。

`deleted + held`をCHECKで拒否する。

## 77. Retention

retention classはbounded lowercase patternを要求する。

duration、archive、backup purgeはLegal、Security、Data Lifecycleの未決定事項である。

V000002候補はdurationを推測しない。

## 78. Region

Requestはhome regionまたはwriter regionを明示する。

region patternはV000001と互換にする。

cross-region takeoverはwriter epoch Contractなしに許可しない。

## 79. Writer Epoch

既存`workflow_writer_epochs`をauthority sourceとして利用する。

Reconciliation Requestへobserved writer epochを保持する候補を評価する。

stale epoch workerのclaim／resolutionを拒否する。

writer epochを独自tableで重複管理しない。

## 80. Schema Metadata Compatibility

既存`workflow_schema_metadata` singletonを継続利用する。

V000002成功時に`migration_head_identifier`を`V000002`へ更新する候補とする。

schema contract majorは1を維持する。

additive変更としてminorを1へ進める候補とする。

## 81. Metadata Update CAS

metadata更新はmigration transaction内で行う。

current headが`V000001`であることをWHERE条件またはmigration preconditionで確認する。

unexpected headでは停止する。

Flyway historyをapplicationが捏造しない。

## 82. Reader Compatibility

V000001 readerは新tableを知らなくても既存Slice A readを継続できる。

V000002 Reconciliation readerはschema minorとtable／constraint fingerprintを検証する。

新readerをdeployする前にmigrationを適用するexpand-firstを採用する。

## 83. Writer Compatibility

V000001 Slice A writerを変更しない。

Reconciliation writerはV000002確認後だけ有効化する。

Production feature flagや`process.env`だけでschema validationを回避しない。

## 84. Expand／Contract

V000002はtable、index、constraint追加だけのexpand migration候補である。

V000001列のrename、drop、type change、constraint weakeningを行わない。

将来のcontract migrationは別versionで行う。

## 85. Constraint Strategy

PostgreSQL constraintはidentity length、enum、version、revision、time、state/nullability、FK、UNIQUEを守る。

Application validatorはcross-row semantic policy、authorization、Provider binding、bounded planを守る。

すべてのDTO validationをCHECKへ複製しない。

## 86. Candidate CHECK Matrix

| Table | Candidate CHECK |
|---|---|
| Request | digest length、operation、trigger、state、version、revision、attempt、time、claim lifecycle |
| Observation | source、outcome、version、sequence、attempt、summary object/size |
| Resolution | status、outcome、escalation、version、revision ordering |
| Manual Repair | state、authorization、action、version、revision、time |
| Reconciliation Outbox | digest、event type、version、payload、delivery lifecycle、revision |

## 87. Candidate UNIQUE Matrix

| Table | Candidate UNIQUE |
|---|---|
| Request | protected reconciliation identity |
| Observation | request + observation sequence |
| Resolution | request + resolution sequence、protected resolution identity |
| Manual Repair | protected command identity、one active repair per request |
| Reconciliation Outbox | protected event identity |

## 88. Candidate FK Matrix

| Child | Parent | Action |
|---|---|---|
| Observation | Request | immediate、ON DELETE RESTRICT |
| Resolution | Request | immediate、ON DELETE RESTRICT |
| Manual Repair | Request | immediate、ON DELETE RESTRICT |
| Reconciliation Outbox | Request | immediate、ON DELETE RESTRICT |

deferred FKを採用しない。

## 89. Candidate Index Matrix

候補indexは次である。

- Request due/claim index
- Request lifecycle/updated index
- Request protected identity UNIQUE
- Observation request/sequence UNIQUE
- Observation request/time index
- Resolution request/sequence UNIQUE
- Manual Repair active request partial UNIQUE
- Manual Repair queue index
- Reconciliation Outbox claim poll index
- Reconciliation Outbox request FK index

使用queryが未定のindexを過剰追加しない。

## 90. CAS Columns

Request CASは`reconciliation_request_id`、expected `revision`、expected state、必要時expected fenceを使用する。

Manual Repair CASはcommand identity、expected revision、authorization stateを使用する。

Outbox delivery CASはevent identity、expected fence、owner digestを使用する。

Resolution history自体はappend-onlyでCAS updateしない。

## 91. Claim Query Semantics

database-authoritative timeでdue pending／retry-waitとexpired claimedを選択する。

`FOR UPDATE SKIP LOCKED`候補を複数worker claimへ使用する。

takeover時にfenceとrequest revisionを単調増加する。

queryはbounded limitを要求する。

## 92. Lease Renewal Semantics

current owner、current fence、claimed state、unexpired lease、expected revisionを条件とする。

renewはlease expiryとrevisionを更新する。

zero-row resultはstale fence、lost ownership、expired lease、terminal stateをsafe conflictへ分類する。

## 93. Release Semantics

releaseはcurrent ownerとfenceを要求する。

claim fieldsをNULLへ戻し、next eligibleをdatabase policyで設定する。

release failure時にownership解放を推測しない。

## 94. Observation Append Atomicity

Observation append、Request attempt checkpoint、next eligibleまたはresolution transitionを一transactionで処理する。

Provider lookup自体はtransaction外で行う。

stale fence Observationをappendしない。

## 95. Manual Repair Atomicity

Manual Repair command state、Request state、Resolution append、必要なOutbox appendを一transactionで処理する。

authorization checkをtransaction前後で必要に応じ再検証する。

direct terminal overwriteを含めない。

## 96. Reconciliation Outbox Atomicity

Request resolutionまたはescalationとOutbox appendを同一transactionにする。

Outbox deliveryはtransaction後のworker責務である。

after-commit hookをdurable delivery truthとして使用しない。

## 97. Commit Unknown

Request mutation transactionがcommit unknownならprotected request／resolution／event identityをlookupする。

blind retryしない。

rollbackと報告しない。

partial invariantはcorruptedでありautomatic completionしない。

## 98. Safe Diagnostics

許可するのはtable capability class、operation class、safe issue、state class、retryable class、connection actionである。

禁止するのはidentity digest bytes、tenant、owner、Provider handle、Reference、Asset ID、raw row、SQL、constraint名、raw errorである。

## 99. Security Roles

Migration role、Reconciliation application role、read-only operator projection roleを分離する。

application roleへDDL、constraint disable、pg_catalog update権限を与えない。

operator roleへraw table update権限を与えない。

## 100. Row-level Security

RLS採用はtenant modelとconnection role Contractが未決定のため本書では固定しない。

RLS未決定を理由にtenant digest predicateを省略しない。

Production readiness前に別Security Contractで決定する。

## 101. Partitioning

V1でpartitioningを必須にしない。

ObservationとOutboxのvolume evidence、retention、vacuum計測後に評価する。

premature partitioningでFK／UNIQUE semanticsを弱めない。

## 102. JSONB Policy

JSONBはsafe summaryとsafe Outbox payloadに限定する。

state、revision、identity、claim、lease、source、outcome、policy predicateを正規化列に置く。

JSONB pathをauthorizationまたはCASの唯一の根拠にしない。

## 103. Payload Size

safe summaryとOutbox payloadは明示上限を持つ。

上限値は既存1 MiB以下のより小さいbounded候補を負荷試験で決める。

根拠なくV000001上限をそのまま採用しない。

## 104. Retention Open Decision

Request、Observation、Resolution、Manual Repair、Outboxの保持期間は未決定である。

active uncertainty、dispute、legal hold、security incident、billing reconciliationを考慮する。

retention決定前にProduction migrationを承認しない。

## 105. Backup and Restore

Reconciliation truthはWorkflow database backup／restore対象である。

Requestとchild historyのpoint-in-time consistencyを要求する。

restore後にold worker fenceを再利用しない。

DR policyはProduction readinessの別Contractである。

## 106. Migration Validation

将来のV000002 testはfresh DB migrate、V000001→V000002 upgrade、Flyway validate、replay、duplicate version rejectionを含む。

schema metadata headとFlyway historyの整合を確認する。

V000001 table／constraint fingerprintが不変であることを確認する。

## 107. Real PostgreSQL Test Matrix

将来testは次を含む。

- request reserve/replay/conflict
- protected identity UNIQUE
- request CAS
- claim concurrency
- lease renewal and expiry takeover
- stale fence rejection
- Observation append ordering
- duplicate sequence rejection
- Resolution append and atomic Request CAS
- Manual Repair authorization transition
- Reconciliation Outbox atomic append/claim/delivery
- FK／CHECK／UNIQUE rejection
- database-authoritative time
- multi-connection visibility
- rollback and commit unknown lookup

## 108. Corruption Verification

DB constraintで生成不能なcorruptionはconstraint rejectionで証明する。

partial snapshot、duplicate authoritative source、malformed projectionはSynthetic Safe Fixtureで検証する。

constraint disable、alternate schema、pg_catalog update、raw page manipulationを禁止する。

## 109. Concurrency Matrix

二worker claim、expired lease takeover、Webhook／Scheduler race、automation／manual repair race、resolution／cancel raceを検証する。

winnerはfenceとCASで一つに限定する。

loserはsafe conflictとなりraw rowを受け取らない。

## 110. Mutation Isolation

decoder、Store result、Observation summary、Resolution、Outbox payload、Registry projectionはdeep copy/freezeする。

caller mutationがDB parameter、next read、sibling resultへ伝播しない。

bytea digestをcopy boundaryなしで返さない。

## 111. Performance Boundary

claim batchはboundedである。

Observation history全件scanをdue claim pathへ含めない。

Request current stateをJournal foldだけで毎回再構築しない。

index effectivenessを実データ分布で測定する。

## 112. Vacuum and Growth

ObservationとResolutionはappend-onlyであるためgrowth ownerを必要とする。

autovacuum、index bloat、oldest unresolved ageを計測する。

retention未決定のままProduction trafficを開始しない。

## 113. Production Prohibitions

本Contract完了だけでProduction connectionを許可しない。

Production credentials、connection reader、Runtime Composition、Scheduler bindingを追加しない。

`process.env`だけでReconciliation Storeを有効化しない。

## 114. Migration Prohibitions

今回はSQLを作成しない。

V000001を変更しない。

V000002を作成しない。

schema、constraint、indexを実DBへ適用しない。

packageまたはdependencyを変更しない。

## 115. Stop Conditions

次の場合はMigration Foundationを開始しない。

- retention／deletion ownerが決まらない
- manual repair authorization metadataが決まらない
- Provider lookup safe summaryをraw handleなしで表現できない
- `still-unknown`を単一Store resultとして保存する必要がある
- existing Slice A OutboxへReconciliation payloadを詰め込む必要がある
- Final Result fake rowが必要になる
- V000001 constraint weakeningが必要になる
- deferred FKまたはconstraint disableが必要になる
- Production connectionが必要になる

## 116. Open Decisions

- exact safe reason allowlist
- exact temporal policy column bounds
- exact JSONB size limit
- retention durations
- deletion/archive procedure
- RLS
- multi-region writer behavior
- Provider binding summary vocabulary
- Manual Repair authorization classes
- Reconciliation event catalog
- operational index finalization

これらはSQL作成前に解決する。

## 117. Readiness Matrix

| Area | Status after this Contract |
|---|---|
| Namespace | `workflow` selected |
| Candidate tables | defined |
| Request identity | defined |
| Observation Journal | defined |
| Claim／Lease／Fence | defined |
| Temporal policy state | defined |
| Resolution history | defined |
| Manual Repair metadata | defined |
| Reconciliation Outbox | dedicated candidate defined |
| Schema metadata compatibility | defined |
| Retention durations | blocking TBD |
| SQL migration | not started |
| Store Adapter | not started |
| Runtime Composition | prohibited |
| Production Connection | prohibited |

## 118. Implementation Sequence

1. Open decision resolution
2. Migration SQL Contract review
3. V000002 SQL-first migration
4. fresh/upgrade/replay validation
5. Reconciliation Store capability Contract
6. PostgreSQL Store Adapter Foundation
7. Reconciliation Runtime Foundation
8. Scheduler／Worker Foundation
9. Webhook Inbox Foundation
10. Manual Repair command Contract
11. Production Composition gate

順序を飛ばさない。

## 119. Decision Summary

V000002候補は既存`workflow` schemaへadditiveに5 tableを追加する。

Request current state、Observation、Resolution、Manual Repair、Reconciliation Outboxを分離する。

claim／lease／fenceとtemporal policyはRequestの正規化列で所有する。

`still-unknown`はReconciliation Request stateであり、Store observation outcomeではない。

V000001 Slice A table、Outbox、schema semanticsを変更しない。

## 120. Completion Statement

本ContractによりWorkflow Reconciliation Runtime V1のPostgreSQL durable truth候補を定義した。

SQL migration、tests、Store Adapter、Runtime implementation、Scheduler、Webhook、Production Composition、Production Connectionは未開始である。
