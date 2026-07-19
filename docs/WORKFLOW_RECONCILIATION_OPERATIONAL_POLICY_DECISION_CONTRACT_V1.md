# Workflow Reconciliation Operational Policy Decision Contract V1

## 1. Status

本書はV000002 Reconciliation Migration候補に先行するOperational Policy Decision Contract V1である。

本書はSchema構造そのものではなく、CHECK、default、size limit、retention class、role、index、readinessを決定する上位Policy Contractである。

## 2. Scope

対象は保持、削除、認可、容量、地域、retry、claim、lease、evidence、audit、backup、securityである。

今回はMarkdown以外を変更しない。

## 3. Normative Sources

- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `WORKFLOW_PRODUCTION_READINESS_GAP_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_RUNTIME_INTERFACE_CONTRACT_V1.md`
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `SLICE_A_COMMIT_UNKNOWN_RESULT_OWNERSHIP_CONTRACT_V1.md`
- `V000001__initialize_slice_a_workflow_schema.sql`

## 4. Current Open Decisions

本書は次を決定または明示的TBDへ分類する。

- Request retention
- Observation retention
- Resolution retention
- Manual Repair retention
- Outbox retention
- Legal Hold behavior
- Logical deletion grace period
- Physical purge owner
- Manual Repair permission classes
- Approval requirement
- Separation of duties
- Safe reason code allowlist
- Safe observation payload fields
- JSONB maximum bytes
- Observation count maximum
- Temporal policy limits
- Claim lease duration
- Heartbeat interval
- Retry schedule
- Manual escalation threshold
- RLS adoption
- Database role permissions
- Region writer policy
- Failover writer epoch
- Capacity assumptions
- Index growth
- Backup／restore retention
- Audit evidence retention

## 5. Policy Enforcement Classes

PolicyはSchema-enforced、Runtime-enforced、Operations-enforced、Deployment-enforcedへ分離する。

一つの層だけで全Policyを表現しない。

## 6. Schema-enforced Policy

SchemaはNOT NULL、CHECK、FK、UNIQUE、revision、state/nullability、bounded size、digest lengthを強制する。

SchemaはProvider consistency判断、authorization判断、retry schedule、legal interpretationを行わない。

## 7. Runtime-enforced Policy

Runtimeはretry budget、elapsed window、authorization decision、Provider lookup policy、CAS、fence、safe projectionを強制する。

Runtimeはphysical purge、backup expiry、role grantを所有しない。

## 8. Operations-enforced Policy

Operationsはretention job、physical purge、backup、restore drill、legal hold解除、manual repair workflowを所有する。

Operationsはdirect SQL repairを行わない。

## 9. Deployment-enforced Policy

Deploymentはregion、database role、network、migration readiness、writer epoch、schema compatibilityを強制する。

Deployment configurationだけでterminal protectionを無効化しない。

## 10. Decision Matrix Format

各PolicyはOwner、Decision、Rationale、Schema impact、Runtime impact、Deferred parameters、Stop conditionを持つ。

Owner不在のPolicyはProduction readiness falseである。

## 11. Retention Class Allowlist

V1候補literalは次である。

- `reconciliation-standard`
- `reconciliation-extended`
- `reconciliation-manual-repair`
- `reconciliation-legal-hold`
- `reconciliation-corrupted`
- `reconciliation-security-review`

自由形式retention classを禁止する。

## 12. Standard Retention

OwnerはData Lifecycle、Privacy、Workflow Reliabilityである。

resolved Request、Observationは90日候補とする。

Resolution evidenceは365日候補とする。

Delivered Outboxは30日候補とする。

Product、privacy、billing、support要件承認前はProduction値ではない。

## 13. Extended Retention

OwnerはWorkflow ReliabilityとData Lifecycleである。

long-provider、cancellation、output-ingestionのunresolved evidenceに使用する。

Request、Observationは180日候補、Resolutionは365日候補とする。

利用はpolicy class allowlistに限定する。

## 14. Manual Repair Retention

OwnerはOperator Tooling、Security、Auditである。

Request、Observation、Resolution、Manual Repair metadataは365日候補とする。

関連Outboxのfailed／reconciliation-requiredは180日候補とする。

free-form operator commentはこのretention domainへ保存しない。

## 15. Legal Hold Retention

OwnerはLegal／Privacyである。

automatic purgeを行わない。

hold解除はauthorized、audited operationである。

期限literalをSchema defaultにしない。

## 16. Corrupted Retention

OwnerはWorkflow Reliability、Security、Data Platformである。

corrupted Request、Observation、Resolutionは365日候補とする。

automatic repairまたはevidence truncationを行わない。

security incidentへ昇格した場合はsecurity-review classへ移す。

## 17. Security Review Retention

OwnerはSecurity Incident ResponseとLegalである。

候補保持は730日だが、incident policy承認前はTBD blockingである。

automatic purgeを禁止する。

## 18. Retention Class Matrix

| Class | Request | Observation | Resolution | Manual Repair | Delivered Outbox | Failed Outbox | Purge eligibility | Hold override | Audit |
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
| standard | 90d | 90d | 365d | N/A | 30d | 180d | resolved and grace elapsed | hold blocks | 365d |
| extended | 180d | 180d | 365d | N/A | 30d | 180d | closed and grace elapsed | hold blocks | 365d |
| manual-repair | 365d | 365d | 365d | 365d | 30d | 180d | repair closed and grace elapsed | hold blocks | 365d |
| legal-hold | no automatic purge | no automatic purge | no automatic purge | no automatic purge | no automatic purge | no automatic purge | none | explicit release only | no automatic purge |
| corrupted | 365d | 365d | 365d | 365d if created | 30d | 180d | reviewed and closed | hold blocks | 365d |
| security-review | TBD candidate 730d | TBD candidate 730d | TBD candidate 730d | TBD candidate 730d | TBD | TBD | incident owner only | hold blocks | TBD candidate 730d |

## 19. Retention Blocking Classification

Class literal、relative ordering、legal hold prohibitionはV000002 blocking decisionである。

具体durationはRuntime／Operations policy tableへ延期可能だが、Production launch前に承認必須である。

Migrationへ90日等をhard-coded defaultとして埋め込まない。

## 20. Expiry

Expiryはautomatic work eligibility終了を意味し、physical deletionを意味しない。

expired Requestはclaim対象から外し、resolutionまたはretention reviewへ進める。

expiryだけでevidenceを削除しない。

## 21. Logical Deletion

logical deletionは`deletion-pending`を経由する。

OwnerはData Lifecycleである。

Request revision、legal hold、active claim、manual repair stateをCASで確認する。

## 22. Logical Deletion Grace

V1候補は30日である。

OwnerはPrivacy／Data Lifecycleである。

Production確定はuser deletion SLA、backup policy、dispute policy待ちである。

grace未承認はProduction purge blockerだがV000002 additive schema blockerではない。

## 23. Physical Purge

physical purge ownerは専用Retention Workerとする。

Reconciliation Worker、database scheduled job、manual operatorをprimary ownerにしない。

Purgeはclaim、bounded batch、writer-authoritative execution、hold確認、deletion revision、audit、retry safetyを要求する。

## 24. Purge Worker Decision

Application-managed dedicated Retention Workerを採用候補とする。

DB scheduled jobはauthorization、cross-table audit、deployment drainが弱いためprimaryにしない。

Operator commandはexceptional controlだけに限定する。

## 25. Purge Order

delivery済みOutbox、closed Manual Repair、Resolution、Observation、Requestの順を候補とする。

FK `ON DELETE RESTRICT`を維持する。

CASとchild existence checkなしにparentを削除しない。

## 26. User and Tenant Deletion

user deletion、tenant deletion、workflow retentionを別trigger classとして扱う。

legal hold、security hold、billing disputeを先に確認する。

raw tenant IDをpurge queueへ保存しない。

## 27. Backup Expiry

primary purgeとbackup expiryを分離する。

backup内dataはapproved backup lifecycleで期限到来後に失効する。

individual rowの即時backup書換えを約束しない。

## 28. Manual Repair Authorization Model

Production Auth providerはTBDである。

V1ではpermission class、scope、approval count、separation of dutiesだけを固定する。

operator subject digestはauthorization proofではない。

## 29. Manual Repair Actions

V1候補actionは次である。

- `inspect-only`
- `attach-evidence`
- `mark-resolved-without-mutation`
- `retry-observation`
- `transition-business-state`
- `revoke-reference`
- `reissue-outbox`
- `terminal-repair`
- `cancel-repair`

## 30. Permission Classes

候補permissionは次である。

- `reconciliation.inspect`
- `reconciliation.evidence.attach`
- `reconciliation.resolve.noop`
- `reconciliation.observe.retry`
- `reconciliation.state.transition`
- `reconciliation.reference.revoke`
- `reconciliation.outbox.reissue`
- `reconciliation.terminal.repair`
- `reconciliation.cancel.repair`
- `reconciliation.approve.high-risk`

## 31. Manual Repair Action Matrix

| Action | Permission | Scope | Approvals | Separation | V1 disposition | Audit | Idempotency |
|---|---|---|---:|---|---|---|---|
| inspect-only | inspect | tenant/region/operation | 1 | none | allowed candidate | required | query replay safe |
| attach-evidence | evidence.attach | tenant/region/request | 1 | moderated evidence owner | external restricted evidence only | required | command identity |
| mark-resolved-without-mutation | resolve.noop | tenant/region/request | 1 | requester recorded | allowed after authoritative proof | required | required |
| retry-observation | observe.retry | tenant/region/source | 1 | none | safe lookup only | required | required |
| transition-business-state | state.transition | tenant/region/operation | 2 | requester != approver | high-risk candidate | required | required |
| revoke-reference | reference.revoke | tenant/region/reference class | 2 | requester != approver | high-risk candidate | required | required |
| reissue-outbox | outbox.reissue | tenant/region/event class | 2 | requester != approver | high-risk candidate | required | required |
| terminal-repair | terminal.repair | tenant/region/operation | 2 | requester != approver | prohibited until separate Contract | required | required |
| cancel-repair | cancel.repair | tenant/region/operation | 2 | requester != approver | high-risk candidate | required | required |

## 32. Separation of Duties Options

Aは一人で全操作可能、Bはhigh-riskだけtwo-person、Cは全repairで分離、Dはexternal incident system承認である。

V1はBを採用する。

inspect、safe observation retry、proved no-opはsingle authorized operator候補である。

business mutation、Reference revoke、Outbox reissue、cancel repairはtwo-person approvalを要求する。

## 33. External Incident Approval

Security-review classではDを追加要求できる。

external incident system vendorとproof formatはTBDである。

外部ticket番号をauthorization proofそのものとして信用しない。

## 34. Operator Identity

DBへraw email、display name、provider claimsを保存しない。

候補列はprotected operator subject digest、authorization decision reference、approval decision reference、policy version、role classである。

authorization proof本文は専用Security domainが所有する。

## 35. Forbidden Repair Combinations

requesterとapproverが同一protected subjectであってはならない。

terminal repairとReference revokeを一commandにまとめない。

billing、Asset deletion、Credential accessをWorkflow repairへ含めない。

legal hold中のmutationはhold owner approvalなしに行わない。

## 36. Safe Reason Code Union

V1 allowlist候補は次である。

- `database-commit-acknowledgement-lost`
- `authoritative-store-unavailable`
- `provider-submit-acknowledgement-lost`
- `provider-job-not-yet-visible`
- `provider-job-not-found-authoritative`
- `provider-job-conflict`
- `webhook-poll-race`
- `output-ingestion-status-unknown`
- `cancellation-status-unknown`
- `outbox-delivery-status-unknown`
- `terminal-state-preserved`
- `invariant-conflict-detected`
- `observation-window-exhausted`
- `manual-repair-required`
- `authorization-required`
- `legal-hold-active`
- `record-expired`
- `record-deleted`
- `failover-wait`
- `stale-writer-epoch`
- `retry-budget-exhausted`

## 37. Reason Code Prohibitions

Provider名、raw SQLSTATE、exception message、endpoint、Reference、Asset ID、tenant、subject、raw job ID、credential具体値を含めない。

Reason codeはlowercase bounded literalである。

safe message keyと分離する。

## 38. Safe Message Policy

DBへ自由文messageを保存しない。

`safe_message_key`とoptional bounded safe parametersだけを候補とする。

localizationはUI ownerである。

raw errorをmessageまたはparameterへ埋め込まない。

## 39. Free-form Evidence

Manual Repair commentが必要な場合はRestricted Storageまたはmoderated evidence capabilityへ分離する。

Reconciliation DBにはopaque protected evidence handleとsafe classだけを保存する。

handleからraw storage locationを推測できてはならない。

## 40. Observation Payload Global Allowlist

許可候補fieldは次である。

- `observedStatusClass`
- `authoritative`
- `retryable`
- `terminal`
- `observationSequence`
- `providerConsistencyClass`
- `safeCount`
- `safeVersion`
- `safeTimeBucket`
- `resolutionCandidateClass`

field追加はpayload version変更を要求する。

## 41. Store Observation Fields

許可はauthoritative、observedStatusClass、safeCount、safeVersion、resolutionCandidateClassである。

row本文、digest bytes、constraint名を禁止する。

## 42. Provider Observation Fields

許可はobservedStatusClass、retryable、terminal、providerConsistencyClass、safeTimeBucket、safeVersionである。

Provider response、job ID、HTTP body/header、endpoint、URLを禁止する。

## 43. Webhook Observation Fields

許可はobservedStatusClass、authoritative、terminal、safeVersion、safeTimeBucketである。

signature、header、payload、event raw IDを禁止する。

## 44. Outbox Observation Fields

許可はobservedStatusClass、retryable、safeCount、safeVersion、resolutionCandidateClassである。

consumer payloadまたはdelivery endpointを禁止する。

## 45. Observation Payload Prohibitions

raw Provider response、raw job ID、HTTP body/header、SQL error、URL、signed URL、Prompt、Lyrics、Scene、Credential、Asset locator、raw identityを禁止する。

Auditへ禁止fieldをコピーしない。

## 46. JSONB Size Decisions

V1 candidate最大UTF-8 byteは次である。

| Payload | Maximum |
|---|---:|
| observation safe payload | 16 KiB |
| resolution summary | 16 KiB |
| policy supplemental snapshot | 8 KiB |
| manual repair safe metadata | 16 KiB |
| reconciliation outbox safe payload | 32 KiB |

1 MiB汎用上限を流用しない。

## 47. JSONB Enforcement

Schemaは`octet_length(jsonb::text)`相当のCHECK候補を持つ。

Runtimeはserialization後UTF-8 bytesを事前検証する。

decoderもbyte、depth、field allowlistを検証する。

JSONB payloadをindex対象にしない。

## 48. JSONB Operational Rationale

小さい上限によりrow bloat、TOAST依存、memory amplification、diagnostic leakageを抑える。

serialization overheadを上限計算に含める。

fieldの高cardinality化を禁止する。

## 49. Observation Count Limits

V1候補はRequest lifetime最大64、source classごと16、attemptごと8である。

最大attemptは32である。

Observation sequenceは64を超えてappendしない。

## 50. Count Limit Outcome

上限到達時はautomatic mutationを停止する。

authoritative resolution済みならresolvedを維持する。

未解決なら`still-unknown`または`manual-repair-required`へ進む。

上限到達をterminal business failureと推測しない。

## 51. Count Limit Ownership

Workflow Reliabilityが上限を所有する。

Provider Integrationはbinding consistency windowの入力を提供する。

Scheduler頻度だけを理由に上限を増やさない。

64／32はinitial candidateであり、load evidence後にversioned policyで調整可能である。

## 52. Temporal Policy Classes

V1候補は次である。

- `immediate-database`
- `short-provider`
- `standard-provider`
- `long-provider`
- `cancellation`
- `output-ingestion`
- `outbox-delivery`

## 53. Temporal Policy Matrix

| Class | Immediate observations | Max observations | Min delay | Max delay | Max elapsed | Consistency window | Escalation threshold | Retryable sources |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| immediate-database | 2 | 4 | 1s | 10s | 2m | 0 | 4 | writer Store unavailable |
| short-provider | 2 | 16 | 5s | 2m | 30m | 10m | 16 | formal provider lookup unavailable/not-yet-visible |
| standard-provider | 1 | 32 | 15s | 15m | 24h | 6h | 32 | formal lookup, validated inbox |
| long-provider | 1 | 64 | 1m | 1h | 7d | 72h | 64 | binding-approved lookup only |
| cancellation | 2 | 32 | 10s | 15m | 24h | 6h | 32 | cancel lookup, terminal Store |
| output-ingestion | 2 | 32 | 10s | 30m | 48h | 24h | 32 | ingestion Store, Asset status lookup |
| outbox-delivery | 2 | 64 | 5s | 1h | 7d | 24h | 64 | delivery ledger, consumer idempotency lookup |

## 54. Temporal Candidate Status

Matrix値はReference／initial production candidateである。

Provider固有windowはbinding Contract承認までTBDである。

Schemaは値をCHECK upper boundとして固定せず、policy versionとsnapshotを保持する。

Runtime validatorはglobal hard ceilingを持つ。

## 55. Retry Schedule Decision

bounded exponential backoff、capped delay、deterministic injected jitterを採用候補とする。

fixed intervalはthundering herd riskが高いため標準にしない。

unbounded loopを禁止する。

## 56. Retry-After

Provider Retry-Afterはbinding allowlist parserで検証する。

policy maximum delayを超えて信用しない。

missingまたはinvalidならlocal bounded policyへ戻る。

Retry-AfterはProvider submit permissionではない。

## 57. Jitter Ownership

Jitterはinjected retry policy capabilityが生成する。

`Math.random()`をProduction policyで直接使用しない。

record identity、tenant digest、Provider job handleをseedにしない。

testはdeterministic injected sequenceを使用する。

## 58. Claim Lease Candidate

初期候補はlease 60秒、heartbeat 20秒、maximum observation execution 45秒である。

takeover eligibilityはwriter DB clockによるlease expiry後である。

heartbeatはexecution deadlineより短く、leaseの3分の1候補とする。

## 59. Claim Policy Snapshot

durationをSchema defaultへ固定しない。

Requestにpolicy version、lease class、observation deadline classをsnapshotする。

具体expiry timestampはclaim transactionでwriter DB clockから計算する。

## 60. Lease Safety

Provider lookup timeoutは45秒未満候補とし、cleanup marginを確保する。

45秒を超えるProvider lookupが必要ならlease renewal capabilityとbinding Contractを先に設計する。

lease expiryだけでProvider submitを再実行しない。

## 61. Deadline Classes

次を分離する。

- DB transaction deadline: 5秒候補
- Store lookup deadline: 10秒候補
- Provider lookup deadline: 30秒候補
- total observation deadline: 45秒候補
- total reconciliation deadline: temporal policy class依存
- manual repair deadline: automatic expiryなし、operational SLA候補24時間

## 62. Deadline Semantics

deadline超過でProvider submitを行わない。

active statement cancellation能力とapplication deadlineを混同しない。

timeout後のcommit acknowledgementはunknownになり得る。

manual repair SLA超過はauthorizationを自動承認しない。

## 63. Manual Escalation Threshold

各Policy classのmax observations、max attempts、max elapsedの最初に到達した境界でautomatic mutationを停止する。

corrupted、terminal conflict、authorization conflictはbudgetを待たずmanual repairへ進める。

single unavailableはmanual escalationではない。

## 64. RLS Options

AはV1全面採用、Bはapplication predicate＋DB roles、Cはread-only operatorだけ、Dはmanaged provider決定後延期である。

V1 Migration候補はBを採用する。

RLSはAuth、pooling、session-variable policy確定後の別Contractへ延期する。

## 65. RLS Deferral Risk

application predicate omissionがcross-tenant accessにつながる。

補償controlはprotected tenant predicate、statement catalog static review、least-privilege roles、cross-tenant negative tests、no arbitrary SQLである。

RLS延期をtenant predicate省略理由にしない。

## 66. Tenant Isolation

全Requestにprotected tenant digestを要求する。

every read/write predicateへtenant scopeを含める。

UNIQUE identityへtenant scopeを含める。

Manual Repair permissionもtenant／region／operation scopeを要求する。

tenant digestだけでauthorization済みと扱わない。

## 67. Database Role Principles

Runtimeで`SUPERUSER`またはschema ownerを使用しない。

roleはtableとoperation単位でleast privilegeにする。

raw table updateではなくapproved Statement capabilityを使用する。

## 68. Migration Role

DDL、schema metadata更新、Flyway history所有に限定する。

Runtime credentialとして使用しない。

Production secret ownerはDatabase Platformである。

## 69. Reconciliation Runtime Writer Role

Request reserve/read、Observation append、Resolution append、Request CAS、Outbox appendに限定する。

Manual Repair approval、retention purge、DDLを許可しない。

Provider Credential tableへアクセスしない。

## 70. Scheduler Role

due Request discoveryとclaim Statementに限定する。

Resolution、Manual Repair、Provider mutationを許可しない。

claim batchとregion predicateを強制する。

## 71. Worker Role

claimed Request read、heartbeat、Observation append、safe resolution CASに限定する。

arbitrary claim ownership変更、DDL、manual approvalを許可しない。

Provider lookup capabilityはDB role外のserver-side bindingである。

## 72. Webhook Inbox Role

validated Inbox appendとread handoffに限定する。

Reconciliation Request mutationを直接許可しない。

Webhook payloadをReconciliation tableへ直接insertしない。

## 73. Manual Repair Requester Role

inspect、request作成、safe evidence handle attachに限定する。

approval、high-risk execution、raw DB updateを許可しない。

tenant／region scopeを必須にする。

## 74. Manual Repair Approver Role

pending requestのapprove/rejectに限定する。

自分がrequesterのcommandをapproveできない。

executionはseparate worker capabilityが行う。

## 75. Audit Reader Role

safe projection viewまたはapproved read Statementだけを使用する。

digest bytes、raw JSONB、restricted handleを直接返さない。

cross-tenant queryはexplicit security approvalを要求する。

## 76. Retention Worker Role

eligible row claim、legal hold確認、bounded purge、audit appendに限定する。

active／held／unresolved rowを削除できないStatement境界を要求する。

Manual Repair approvalを持たない。

## 77. Backup Role

approved backup mechanismに必要な最小read／replication capabilityだけを持つ。

application query credentialとして使用しない。

restore roleと通常backup roleを必要に応じ分離する。

## 78. Schema Health Role

schema metadata、Flyway head、constraint/index presenceのread-only確認に限定する。

business row本文を読まない。

readiness failure時にmigrationを自動修復しない。

## 79. Manual Repair Restricted Boundaries

Requester／Approver roleはCredential table、Restricted plaintext、raw Provider output、billing ledger、Asset binaryへ直接アクセスしない。

必要な証跡はopaque protected handle経由でpurpose-bound capabilityが解決する。

## 80. Multi-region Decision

V1はworkflow home-region single writerを採用する。

Reconciliation recordも同じhome regionでwriteする。

claim、CAS、resolution、manual repair commitはhome writerだけが行う。

active-active writeを禁止する。

## 81. Cross-region Reads

cross-region readは観測補助に限定する。

read replicaからdatabase commit outcomeを確定しない。

replica absenceをnot-committedと扱わない。

terminal resolution前にhome writer authoritative readを要求する。

## 82. Provider Region

workflow home regionとProvider lookup regionを分離する。

Provider binding ownerはpermitted lookup region、data residency、credential scope、not-found authorityを定義する。

Provider endpointをrecordへ保存しない。

binding未確定時はProvider lookupを開始しない。

## 83. Writer Epoch Decision

V000001の`workflow_writer_epochs`を正式authorityとして利用する。

Reconciliation Requestにwriter epoch snapshotを保持する。

claim、resolution、manual repairでcurrent epochと照合する。

epoch mismatch時はwrite拒否、`failover-wait`、Provider mutation禁止とする。

## 84. Failover Sequence

1. old admission停止
2. old scheduler drain
3. new writer epoch commit
4. stale claim/fence invalidation
5. new writer readiness確認
6. unresolved record再queue
7. Outbox replay
8. Provider external state再照合
9. terminal truth再確認

順序を飛ばさない。

## 85. Failover Stop Conditions

writer epoch不明、old writer drain未確認、schema head mismatch、home writer unavailable、terminal truth unavailable時はnew mutationを停止する。

failover中にProvider submitをblind replayしない。

old lease expiryだけでnew region writeを許可しない。

## 86. Backup Retention Candidate

Database Platformをownerとする。

initial candidateはPITR 35日、monthly restore drillである。

RPO／RTO、long-term snapshot、legal hold backup semanticsはTBD blockingである。

Production launch前に承認する。

## 87. Restore Invariants

Request、Observation、Resolution、Manual Repair、Outboxの整合を同一recovery pointで維持する。

writer epochをrestore後に検証する。

stale leaseをそのままactive ownerとして再開しない。

Outbox replayはconsumer idempotencyを要求する。

## 88. Audit Evidence Retention

standard auditは365日候補である。

manual repair／corrupted evidenceも365日候補である。

security reviewは730日候補だがSecurity／Legal承認待ちである。

raw evidenceをAuditへコピーしない。

## 89. Capacity Classes

正確な事業予測がないためLow、Expected、Highをplanning assumptionとして置く。

これらはSLOまたは販売予測ではない。

## 90. Capacity Assumption Matrix

| Input | Low | Expected | High |
|---|---:|---:|---:|
| reconciliation requests/day | 100 | 10,000 | 100,000 |
| observations/request average | 4 | 12 | 32 |
| observation payload average | 1 KiB | 2 KiB | 4 KiB |
| still-unknown rate | 0.1% | 0.5% | 2% |
| manual repair rate | 0.02% | 0.1% | 0.5% |
| outbox events/request | 1.2 | 1.5 | 2.0 |
| standard retention | 90d | 90d | 90d |
| extended/corrupted retention | 365d | 365d | 365d |

## 91. Request Growth Formula

```text
requests per day
× retention days
× average request row bytes
× index amplification factor
```

average rowとindex amplificationはreal PostgreSQL measurementで確定する。

## 92. Observation Growth Formula

```text
requests per day
× observations per request
× observation retention days
× (row overhead + payload bytes)
× index amplification factor
```

Observationが主要growth driverである。

## 93. Resolution Growth Formula

```text
requests per day
× resolutions per request
× resolution retention days
× average resolution row bytes
```

resolutions per requestは通常1〜3候補である。

## 94. Manual Repair Growth Formula

```text
requests per day
× manual repair rate
× repair retention days
× average repair metadata bytes
```

Restricted evidence本文を含めない。

## 95. Outbox Growth Formula

```text
requests per day
× outbox events per request
× delivery retention days
× average event row bytes
```

failed／reconciliation-required eventは別retentionで計算する。

## 96. Expected Observation Payload Volume

Expected候補のraw safe payload計算は次である。

```text
10,000 requests/day × 12 observations × 2 KiB
= approximately 234 MiB/day before row and index overhead
```

90日で約20.6 GiBのpayload候補となり、row/index/TOAST overheadは別途加算する。

これはcapacity test inputであり確約値ではない。

## 97. High Observation Payload Volume

High候補は次である。

```text
100,000 × 32 × 4 KiB
= approximately 12.2 GiB/day before overhead
```

High classではpartitioning、retention短縮、summary圧縮ではなくfield削減、archive strategyの再評価がblockingとなる。

## 98. Index Growth Policy

due claim、identity UNIQUE、request child sequence、active repair、Outbox claimの必須indexだけをV000002候補とする。

Observation payloadへGIN indexを作成しない。

index hit、bloat、write amplificationを計測する。

High classでquery evidenceなしにindexを追加しない。

## 99. Capacity Readiness Gates

Expected classの90日相当load replay、claim latency、CAS contention、vacuum、index bloat、backup時間を測定する。

High classはlaunch capacityではなくstress ceiling候補である。

Expected classがSLO候補を満たせない場合はV000002 Production readiness falseである。

## 100. Observation Capacity Controls

64 lifetime limit、16 per source、8 per attemptをRuntimeとSchema sequence boundsで強制候補とする。

payload byte上限をRuntimeとCHECKの両方で強制する。

capacity pressureでevidenceをsilent dropしない。

## 101. Policy Master Decision Matrix

| Policy | Owner | Decision | Schema impact | Runtime impact | Deferred | Stop condition |
|---|---|---|---|---|---|---|
| Request retention | Data Lifecycle | class-based, standard 90d candidate | retention class/lifecycle | eligibility projection | legal approval | no owner |
| Observation retention | Data Lifecycle/Audit | 90d standard | parent lifecycle/index | no silent drop | archive policy | unresolved purge |
| Resolution retention | Audit | 365d candidate | immutable history | safe projection | legal approval | history loss |
| Manual Repair retention | Security/Audit | 365d candidate | dedicated class | close before purge | incident policy | unaudited delete |
| Outbox retention | Messaging/Data | delivered 30d, failed 180d | delivery timestamps/state | purge eligibility | consumer SLA | undelivered purge |
| Legal Hold | Legal | no automatic purge | hold state CHECK | mutation guard | release workflow | hold purge |
| Deletion grace | Privacy/Data | 30d candidate | deletion timestamps | eligibility | user SLA | immediate purge |
| Purge owner | Data Lifecycle | dedicated worker | claim/index | bounded purge | schedule | DB ad-hoc delete |
| Manual permissions | Security/Operator | action allowlist | role metadata | authorization check | Auth provider | arbitrary action |
| Approval | Security | high-risk two-person | requester/approver refs | SoD validator | external incident | self-approval |
| Reason codes | Workflow Reliability | fixed allowlist | CHECK | enum validator | future version | raw reason |
| Payload fields | Security/Domain owners | source allowlist | version/size CHECK | decoder | source extensions | raw payload |
| JSONB limits | Data/Security | 8/16/32 KiB | byte CHECK | preflight bytes | load tuning | unbounded payload |
| Observation counts | Reliability | 64/16/8, attempts 32 | sequence bounds candidate | budget reducer | provider evidence | unbounded loop |
| Temporal policy | Reliability/Provider | versioned classes | snapshot fields | reducer | binding values | guessed Provider window |
| Lease | Worker Platform | 60/20/45s candidate | timestamps/fence | heartbeat | load evidence | Provider call exceeds lease |
| Retry | Reliability | bounded exponential+jitter | next eligible | injected policy | binding Retry-After | Math.random/unbounded |
| RLS | Security/Data | defer; roles+predicates | no RLS V1 | tenant predicates | Auth/pooling | missing predicate |
| Roles | Database Platform | least privilege | GRANT design | capability separation | concrete deployment | runtime owner role |
| Region | Residency/Workflow | home single writer | region/epoch snapshot | writer gate | failover runbook | active-active |
| Backup | Database Platform | PITR 35d candidate | none | restore validation | RPO/RTO | no restore evidence |
| Capacity | SRE/Data | Expected planning class | minimal indexes | bounds/backpressure | real traffic | Expected test fails |

## 102. Schema-enforced Decision Summary

V000002候補CHECKはreason allowlist、retention class、payload version、byte size、revision、attempt non-negative、state/nullability、digest lengthを含む。

FK、UNIQUE、fence、tenant-scoped identityを含む。

duration秒数、approval provider、retry algorithmをCHECKへ埋め込まない。

## 103. Runtime-enforced Decision Summary

Runtimeはtemporal reducer、count budget、byte preflight、authorization、tenant predicate、writer epoch、fence、Provider lookup allowlist、safe resultを所有する。

Runtimeはretention physical purge、backup、role grantを所有しない。

## 104. Operations-enforced Decision Summary

OperationsはRetention Worker、legal/security hold、backup、restore drill、manual repair approval workflow、capacity monitoringを所有する。

direct DB update、constraint disable、raw evidence copyを禁止する。

## 105. Deployment-enforced Decision Summary

Deploymentはhome writer、writer epoch、database role、network、schema head、migration readiness、Provider region bindingを検証する。

failover gate未成立時はmutationを停止する。

## 106. V000002 Blocking Decisions

次はMigration SQL作成前に固定済みでなければならない。

- retention class literals
- reason code allowlist
- payload field/version policy
- JSONB hard maximum
- state／claim／hold invariants
- tenant-scoped uniqueness
- writer epoch snapshot
- role capability matrix
- no RLS V1 decision
- dedicated Reconciliation Outbox

## 107. Runtime-configurable Decisions

次はversioned policy snapshotとして延期可能である。

- exact delay within hard bounds
- exact max elapsed within class ceiling
- Provider consistency window
- Retry-After cap below global ceiling
- heartbeat tuning within lease invariant
- retention duration after approved class mapping

silent config changeを禁止し、policy versionを要求する。

## 108. Production-blocking TBD

次はV000002 additive migrationを必ずしも止めないがProduction launchを止める。

- Auth provider
- legal/privacy retention approval
- security-review retention
- RPO／RTO
- restore drill evidence
- Provider region and not-found policy
- external incident approval integration
- Expected capacity evidence
- RLS follow-up decision

## 109. Test Matrix

将来testはretention class validation、reason allowlist、JSON byte boundaries、observation limits、policy exhaustion、lease/heartbeat、tenant predicate、role denial、writer epoch、failover wait、two-person approval、hold purge denialを含む。

Policy testはclock、jitter、authorizationをinjectする。

Production secretやraw evidenceをfixtureに使用しない。

## 110. Static Security Matrix

Statement catalogの全tenant read/writeにtenant predicateがあることを確認する。

Runtime roleにDDL、SUPERUSER、schema owner権限がないことを確認する。

Reason、message、payload、auditに禁止fieldがないことを確認する。

## 111. Operational Readiness Matrix

| Area | Decision | V000002 readiness | Production readiness |
|---|---|---|---|
| Retention classes | fixed | ready | approval pending |
| Candidate durations | fixed candidates | ready | Legal/Privacy pending |
| Deletion model | fixed | ready | worker pending |
| Manual Repair actions | fixed | ready | Auth/tooling pending |
| Separation of duties | Option B | ready | provider pending |
| Reason allowlist | fixed | ready | version governance needed |
| Payload allowlist | fixed | ready | binding extensions pending |
| JSONB limits | fixed candidates | ready | load validation pending |
| Observation limits | fixed candidates | ready | provider validation pending |
| Temporal classes | fixed candidates | ready | tuning pending |
| Lease policy | fixed candidate | ready | load validation pending |
| RLS | deferred, Option B | ready | security review pending |
| Roles | capability matrix fixed | ready | concrete grants pending |
| Region | home single writer | ready | failover runbook pending |
| Writer epoch | V000001 reuse | ready | integration pending |
| Backup | candidate fixed | ready | RPO/RTO pending |
| Capacity | planning classes fixed | ready | benchmark pending |

## 112. Prohibitions

Schemaだけで全運用Policyを表現しない。

expiry即physical delete、hold中purge、parent cascade、raw evidence Audit copy、Manual Repair無監査削除を禁止する。

blind Provider resubmit、terminal overwrite、automatic corruption repairを禁止する。

## 113. Stop Conditions

Owner不在、tenant predicate不在、unbounded payload、unbounded retry、self-approval、active-active write、writer epoch不明、hold bypass、raw evidence保存が必要な場合は停止する。

Provider lookup timeoutがlease safety windowを超える場合は別Contractまで停止する。

Expected capacity testを満たさない場合はProduction readinessをfalseにする。

## 114. Migration Boundary

本ContractはV000002 SQL作成を実行しない。

V000001を変更しない。

Schema Foundation Contractの5 table候補を変更する場合は先にContract revisionを行う。

## 115. Open Parameters After Decision

Production Auth provider、concrete role names、RPO／RTO、retention法務承認、Provider binding window、exact load-tested delays、archive mechanismはTBDである。

TBDをmigration defaultとして推測しない。

## 116. Decision Summary

Retentionはclass-based、standard 90日、corrupted/manual 365日、delivered Outbox 30日、failed Outbox 180日、holdはautomatic purgeなしをcandidateとする。

Manual Repairはhigh-risk two-person approval、terminal repairは別Contractまで禁止する。

Observationは64 lifetime、16/source、8/attempt、attempt 32をcandidateとする。

JSONBは用途別8／16／32 KiB上限候補とする。

Leaseは60秒、heartbeat 20秒、observation 45秒候補とする。

RLSはV1延期し、tenant predicatesとleast-privilege rolesで補償する。

Regionはhome-region single writer、V000001 writer epochを正式利用する。

## 117. Completion Statement

本ContractによりV000002候補に必要な保持、認可、reason、payload、size、temporal、lease、role、region、failover、backup、capacityの上位Policy Decisionを固定した。

SQL migration、code、tests、Store、Runtime、Scheduler、Webhook、Production Composition、Production Connectionは未開始である。
