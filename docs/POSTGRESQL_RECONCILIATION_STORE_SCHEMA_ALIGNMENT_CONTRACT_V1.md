# PostgreSQL Reconciliation Store Schema Alignment Contract V1

## 1. Status

本書は、V000002 Reconciliation SchemaとPostgreSQL Reconciliation Store Adapter Foundation V1要求の差分を1対1で解消する設計Contractである。

本書はSQL migration、Store実装、Runtime実装、Driver実装を許可しない。

本書の決定を実装へ反映する工程は別工程である。

## 2. Purpose

目的は、既存V000002を歴史改変せず、Store Capabilityが必要とするlifecycle、identity metadata、semantic fingerprint、writer epoch、fenceを明示的に所有できる将来Schemaを固定することである。

未定義のstate、digest encoding、algorithm、version、domain、fingerprint、writer authorityをStoreが推測することを禁止する。

## 3. Normative Inputs

本書は次を前提とする。

- `POSTGRESQL_RECONCILIATION_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_RUNTIME_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_OPERATIONAL_POLICY_DECISION_CONTRACT_V1.md`
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`
- `SLICE_A_COMMIT_UNKNOWN_RESULT_OWNERSHIP_CONTRACT_V1.md`
- `V000002__add_workflow_reconciliation_schema.sql`

矛盾時は、本書がStore／Schema alignmentに限定して後続決定を所有する。

## 4. Current Gap Summary

V000002とStore Foundation要求の差分は次である。

| Area | V000002 | Store requirement | Gap |
|---|---|---|---|
| Manual Repair cancel | cancelled stateなし | `markCancelled` | lifecycle表現不能 |
| Identity domain | domain列なし | namespace separation | durableなdomain証明不能 |
| Secondary digest metadata | digest byteaのみ | algorithm／version保持 | metadata喪失 |
| Semantic fingerprint | 専用列なし | replay／conflict判定 | authoritative fingerprintなし |
| Manual Repair writer authority | revisionのみ | epoch／fence照合 | stale writer／owner拒否不能 |
| Claim owner metadata | digest byteaのみ | protected identity metadata | algorithm／version／domain不明 |

これらをStore内の暗黙定数、列名推測、digest bytesの再解釈で補ってはならない。

## 5. Alignment Principles

本書は次を固定する。

- V000002は不変である。
- Schema変更はforward-only additive migrationで行う。
- identity metadataは明示列で保持する。
- semantic fingerprintはStoreより上位のversioned keyed factoryが生成する。
- Storeはfingerprintを検証、保存、比較するが生成しない。
- Driverはidentity semanticsを所有しない。
- Runtimeはdigest encodingやdatabase column mappingを所有しない。
- Manual Repair cancellationは独立したterminal lifecycle stateである。
- stale writerとstale lease ownerは別のauthority failureである。

## 6. Manual Repair Lifecycle Current State

V000002のManual Repair stateは次である。

- `requested`
- `authorized`
- `rejected`
- `executing`
- `reconciled`
- `deferred`
- `terminal-safe-failure`

Store Capability候補は`markCancelled`を要求する。

V000002には`cancelled` stateがない。

`cancel-repair` action classは、repair cancellationを要求するcommand intentであり、保存済みrepair requestのlifecycle outcomeではない。

## 7. Manual Repair Option A: Cancelled State Addition

Option AはManual Repair stateへ`cancelled`を追加する。

利点は次である。

- `markCancelled`とdurable stateが1対1になる。
- `rejected`とoperator cancellationを区別できる。
- `terminal-safe-failure`と正常なcancel completionを区別できる。
- replay、audit、retention、queue exclusionを明確にできる。
- Storeがcancel reasonからstateを推測しない。

欠点はSchema migrationが必要なことである。

## 8. Manual Repair Option B: Cancel Action Only

Option Bは`cancel-repair` action classだけを保持し、stateは既存値へ写像する。

候補写像は`rejected`、`deferred`、`terminal-safe-failure`である。

この案は不採用とする。

理由は次である。

- action intentとlifecycle outcomeが混在する。
- どの既存stateへ写像するかContract上決定できない。
- cancellationとauthorization rejectionを区別できない。
- cancellationとfailureを区別できない。
- Storeがreasonまたはactionからstateを推測する必要がある。

## 9. Manual Repair Option C: MarkCancelled Removal

Option CはStore Capabilityから`markCancelled`を削除する。

この案は不採用とする。

理由は、Operational Policyが`cancel-repair`を正式なhigh-risk action候補として所有し、開始前または実行前のrepairを安全に終了するdurable outcomeが必要だからである。

Capability削除はSchema gapを隠すだけであり、lifecycleを解決しない。

## 10. Manual Repair Decision

Option Aを採用する。

将来migrationはManual Repair stateへ`cancelled`を追加する。

`cancelled`はterminal stateである。

`cancelled`から`authorized`、`executing`、`reconciled`、`deferred`への遷移は禁止する。

`markCancelled`はexpected revision、current writer epoch、必要なfenceを満たす場合だけ成功する。

`markCancelled`はterminal business state mutationを意味しない。

## 11. Manual Repair Timestamp Alignment

`cancelled`は`completed_at`非nullを要求する。

`approved_at`と`started_at`は、cancelが発生したprior stateに応じてnullableである。

単一CHECKで既存state timestamp ruleを曖昧化しない。

将来migrationはcancel専用整合を明示する。

- requestedからcancelled: approved_at null、started_at null、completed_at nonnull
- authorizedからcancelled: approved_at nonnull、started_at null、completed_at nonnull
- executingからcancelled: approved_at nonnull、started_at nonnull、completed_at nonnull

Storeはtimestampをcaller clockから決定せず、writer PostgreSQL transaction timeを使用する。

## 12. Identity Metadata Requirement

protected identityは最低限次のmetadataを持つ。

- domain
- algorithm
- version
- protected digest

digest bytesだけではdomain separation、keyed protection class、version migrationをdurableに証明できない。

## 13. Identity Metadata Option: Individual Columns

個別列案は各identity slotについて次を保持する。

- `<slot>_digest_domain text`
- `<slot>_digest_algorithm text`
- `<slot>_digest_version integer`
- `<slot>_digest bytea`

利点は次である。

- CHECK、UNIQUE、index、decoderを型付きで構築できる。
- JSON parserなしにfail closedできる。
- column-level nullabilityを表現できる。
- query plannerがidentity lookupを利用できる。
- raw identityを保持せずmetadataを保存できる。

欠点は列数が増えることである。

## 14. Identity Metadata Option: Shared Columns

共有列案は一rowの複数digestへ一組のalgorithm／version／domainを適用する。

この案は不採用とする。

理由は、同一row内でもreconciliation request、tenant、workflow、provider、claim ownerが異なるdomainを必要とするためである。

claim ownerだけがnullableまたはleaseごとに変更される場合も、row-wide metadataでは正確に表現できない。

## 15. Identity Metadata Option: Composite Type

PostgreSQL composite type案はdomain、algorithm、version、digestを一つの値へまとめる。

この案はV1 alignmentでは不採用とする。

理由は次である。

- type lifecycleがtable migrationより強く結合する。
- expand／contract時のfield追加が複雑になる。
- Driver codecとrow decoderへ新しいPostgreSQL型知識が必要になる。
- 既存Driver変更禁止境界と衝突する。

## 16. Identity Metadata Option: JSONB

JSONB案はmetadataとdigest表現をobjectへ保存する。

この案は不採用とする。

理由は次である。

- digest encodingをJSON表現へ変換する必要がある。
- byteaのowned binary semanticsを失う。
- CHECKとindexが複雑になる。
- unknown field、canonical encoding、size、decoder責務が増える。
- identity lookupの型安全性が低下する。

## 17. Identity Metadata Decision

個別列を採用する。

各identity slotはdomain、algorithm、version、digestを明示列として所有する。

digest列はbytea、lengthは32 bytesとする。

domain、algorithm、versionはallowlist CHECKを持つ。

nullable identityは4列すべてnullまたは4列すべてnon-nullとする。

部分nullを禁止する。

## 18. Identity Domain Allowlist

最低限のdomain classは次である。

- `reconciliation-request`
- `workflow`
- `provider-request`
- `provider-job`
- `tenant`
- `observation`
- `resolution`
- `manual-repair`
- `operator-subject`
- `authorization-decision`
- `approval-decision`
- `reconciliation-outbox`
- `claim-owner`

domainは自由文字列ではない。

Store descriptorまたはdiagnosticへ実digestを含めない。

## 19. Algorithm Allowlist

V1のprotected low-entropy identityは`hmac-sha256`を使用する。

既存のplain `sha256` rowはlegacy compatibilityのためread可能とするが、新規low-entropy identity writeには使用しない。

algorithm migrationはversionまたはalgorithm列で明示する。

Storeはdigest bytesからalgorithmを推測しない。

Storeはcrypto keyを取得しない。

## 20. Semantic Fingerprint Purpose

semantic fingerprintは同一protected identityに対するreplayとconflictを区別するwriter-authoritative値である。

同一identityかつ同一fingerprintはreplay候補である。

同一identityかつ異なるfingerprintはconflictである。

fingerprintはraw input、raw Provider handle、operator identity、credentialを復元できてはならない。

## 21. Semantic Fingerprint Option: Stored Columns

保存列案は次を各idempotent aggregateへ保持する。

- `semantic_fingerprint_domain`
- `semantic_fingerprint_algorithm`
- `semantic_fingerprint_version`
- `semantic_fingerprint_digest`

利点はtransaction内でexisting rowと比較できることである。

Commit unknown lookupでも同じfingerprintを比較できる。

## 22. Semantic Fingerprint Option: Generated Database Value

generated columnまたはdatabase functionでfingerprintを生成する案は不採用とする。

理由は、databaseへraw semantic inputまたはcrypto keyを渡す必要が生じ、StoreとDatabaseがidentity protectionを所有してしまうためである。

## 23. Semantic Fingerprint Option: Store Calculation

Store内でfingerprintを計算する案は不採用とする。

理由は、Storeがcrypto key、canonical semantic encoding、domain policyを所有してはならないためである。

## 24. Semantic Fingerprint Option: Driver Calculation

Driver計算案は不採用とする。

Driverはparameterized query、codec、SQLSTATE分類を所有し、Reconciliation semanticsを知らない。

## 25. Semantic Fingerprint Option: Runtime Calculation

Runtimeが直接fingerprintを計算する案は不採用とする。

Runtimeはbounded policyとresolution orchestrationを所有するが、Store persistence encodingまたはcrypto keyを所有しない。

## 26. Semantic Fingerprint Decision

保存列を採用する。

生成ownerは、Storeより上位かつRuntime policyから分離されたversioned keyed identity／fingerprint factoryである。

Storeはfactoryが生成したtyped fingerprintを受け取り、metadataを検証し、保存し、比較する。

Storeは再計算しない。

Driverはopaque bytea parameterとして扱う。

## 27. Fingerprint Coverage

最低限、次は独立fingerprintを持つ。

- Reconciliation Request
- Observation
- Resolution
- Manual Repair request
- Reconciliation Outbox event

fingerprint domainはentity classごとに分離する。

## 28. Fingerprint CHECK

fingerprintは次を満たす。

- algorithm allowlist
- version allowlist
- domain literal一致
- digest length 32 bytes
- metadata全nullまたは全non-nullを許可しない。fingerprintは必須である。

## 29. Manual Repair Writer Epoch Question

Manual Repairはauthorization decision、approval、execution、completionが異なるprocessまたはworkerから行われ得る。

revisionだけではstale deployment writerまたはregion authority lossを拒否できない。

requester／approver分離はauthorization policyであり、writer authorityの代替ではない。

## 30. Manual Repair Writer Epoch Decision

Manual Repairは`writer_epoch`を持つ。

すべてのManual Repair mutationはcurrent writer epochとexpected revisionを照合する。

writer epoch mismatchはsafe semantic resultとして分類し、row内容を返さない。

## 31. Manual Repair Fencing Revision Question

approvalだけの短いCASと、実行claimを伴うoperationは区別する。

approvalにはrevision CASが必要である。

実行開始後のowner heartbeat、completion、cancelにはfencing revisionが必要である。

## 32. Manual Repair Fencing Decision

Manual Repairは次を追加所有する。

- `claim_owner_digest_domain`
- `claim_owner_digest_algorithm`
- `claim_owner_digest_version`
- `claim_owner_digest`
- `fencing_revision`
- `lease_expires_at`
- `writer_epoch`

実行ownerを持たないstateではclaim metadataとleaseはnullとする。

`executing`ではclaim metadataとleaseを必須とする。

`fencing_revision`はnon-negativeであり、takeoverごとに単調増加する。

## 33. Revision Ownership

Manual Repairの既存`revision`はrecord CASを所有する。

`revision`、`fencing_revision`、`writer_epoch`は別概念である。

- revision: row mutation order
- fencing revision: lease owner generation
- writer epoch: writer authority generation

相互代用を禁止する。

## 34. Digest Metadata Ownership Matrix

| Digest slot | Metadata strategy | Required domain | New write algorithm |
|---|---|---|---|
| tenant | individual columns | tenant | hmac-sha256 |
| workflow | individual columns | workflow | hmac-sha256 |
| provider request | individual columns | provider-request | hmac-sha256 |
| provider job | individual columns | provider-job | hmac-sha256 |
| operator requester | individual columns | operator-subject | hmac-sha256 |
| operator approver | individual columns | operator-subject | hmac-sha256 |
| authorization decision | individual columns | authorization-decision | hmac-sha256 |
| approval decision | individual columns | approval-decision | hmac-sha256 |
| claim owner | individual columns | claim-owner | hmac-sha256 |

固定Contractだけでalgorithm／versionを暗黙補完する案は不採用とする。

## 35. Existing Digest Column Treatment

既存V000002 digest列は削除またはrenameしない。

将来migrationはmetadata列をadditiveに追加する。

既存digest列はbinary digestを継続保持する。

metadata列は既存digest列を修飾する。

既存rowのmetadata backfill policyが承認されるまで、Reconciliation Store V1 writerは既存rowをproduction-readyとして扱わない。

## 36. Legacy Metadata Backfill

既存V000002 rowに対してalgorithm、version、domainをdigest bytesから推測してはならない。

テスト環境が空DBであることはProduction backfill policyの代替にならない。

既存rowのprovenanceがauthoritativeに証明できる場合だけ、別migrationまたはoperator-owned migration procedureでbackfillできる。

証明できないrowはmigration失敗またはquarantine対象であり、自動昇格しない。

## 37. Migration Option: Modify V000002

V000002を変更する案は不採用とする。

理由は次である。

- Flyway checksum compatibilityを破壊する。
- 完了済み環境のmigration historyと不一致になる。
- 過去のSchema Foundationを歴史改変する。
- rollback不能な環境差を生む。

## 38. Migration Option: Add V000003

V000003 additive alignment migration案は次を行う。

- Manual Repair `cancelled` lifecycle追加
- identity domain／algorithm／version列追加
- semantic fingerprint列追加
- Manual Repair writer epoch／claim／fence／lease列追加
- 必要なCHECK、UNIQUE、index追加
- schema metadata minor／migration head更新

V000002 tableをdropまたはrenameしない。

## 39. Migration Option: No Schema Change

Schema変更なし案は不採用とする。

理由は、Storeがstate mapping、algorithm、version、domain、fingerprint、writer authorityを推測しなければ要求を満たせないためである。

## 40. Migration Decision

V000003 additive migrationを採用する。

V000002は不変とする。

V000003の正式filename、SQL、constraint名、index名はMigration Foundation工程で決定する。

本書ではSQLを作成しない。

## 41. V000003 Minimum Schema Delta

V000003は最低限次を表現可能にする。

- Manual Repair cancelled state
- Manual Repair cancel timestamp consistency
- entityごとのsemantic fingerprint
- protected digest slotごとのdomain／algorithm／version
- Manual Repair writer epoch
- Manual Repair execution claim owner metadata
- Manual Repair fencing revision
- Manual Repair lease expiry

## 42. Constraint Alignment

V000003は既存CHECKを無効化しない。

既存CHECKと新stateが両立しない場合、constraint disableではなくtransactionalなconstraint replacementを用いる。

replacementは既存の全禁止状態を維持し、`cancelled`だけを明示追加する。

FKはimmediate、ON DELETE RESTRICTを維持する。

## 43. Unique Alignment

semantic fingerprintはidentity UNIQUEの代替ではない。

identity UNIQUEはauthoritative rowを一件に保つ。

fingerprintは、その一件が同一semanticsかを判定する。

Manual Repair active partial UNIQUEは`cancelled`をactive集合へ含めない。

## 44. Index Alignment

V000003は次の必要性を評価する。

- protected identity metadataを含むlookup index
- semantic fingerprint comparisonを補助するindex
- Manual Repair expired lease takeover index
- Manual Repair executing claim index

wide digest metadataを無条件に重複index化しない。

exact index inventoryはMigration Foundationで固定する。

## 45. Backward Compatibility: Flyway

V000001とV000002 checksumは変わらない。

V000003は新しいversioned migrationとして適用する。

Flyway historyはV000001、V000002、V000003を順序どおり所有する。

fresh DBとV000002既適用DBの両方を検証する。

## 46. Backward Compatibility: Existing V000002 Readers

列追加は既存readerの明示column projectionを壊さない。

`SELECT *`を利用するdecoderはunknown column policyにより影響を受けるため、V000003対応Storeはexact projectionを使用する。

既存V000002 test introspectionはtable数を維持する。

business tableは追加しない。

## 47. Backward Compatibility: Existing V000002 Writers

新規metadata列を即時NOT NULLにするとlegacy writerを破壊する可能性がある。

V000003はexpand／contractを考慮する。

候補手順は次である。

1. nullable metadata列追加
2. 新Store writerだけが全metadataを保存
3. provenance付き既存rowを安全にbackfill
4. completeness CHECKを`NOT VALID`相当の段階導入で評価
5. validatorとreader readiness確認後にstrict contractへ移行

ただし、constraint validation strategyはMigration Foundationで正式決定する。

## 48. Backward Compatibility: Store

PostgreSQL Reconciliation Store Foundation V1はV000003 schema readinessを必須とする。

V000002だけのdatabaseへ接続した場合は`schema-mismatch`としてfail closedする。

V000002 rowをalgorithm／domain／fingerprintなしでreplay扱いしない。

Store resultへraw rowまたは不足metadataを返さない。

## 49. Backward Compatibility: Runtime

Reconciliation Runtimeのbounded policy、still-unknown ownership、resolution classificationは変更しない。

RuntimeはStoreのschema versionを推測しない。

durable bindingはStore descriptorがV000003 readinessを証明した後にだけ開始できる。

Runtime resultへidentity metadataまたはfingerprintを追加しない。

## 50. Backward Compatibility: Driver and Transaction

PostgreSQL Driverは変更しない。

Durable Transaction V2は変更しない。

新しい列は既存scalar codecで表現できるtext、integer、bigint、bytea、timestamptzを使用する。

Store-owned Statement Catalogだけが新SQLを所有する。

## 51. Commit Unknown Alignment

Commit unknown lookupはprotected identityとsemantic fingerprintの両方を比較する。

期待recordがすべて存在しfingerprintが一致する場合だけ`committed`である。

すべて存在しない場合だけ`not-committed`である。

一部存在、metadata欠落、fingerprint不一致、revision／sequence／binding不一致は`corrupted`である。

単発read failureは`unavailable`である。

Store resultへ`still-unknown`を追加しない。

## 52. Read Session Alignment

writer-authoritative read sessionはV000003 schema readinessを検証する。

read replicaはcommit unknown lookupに使用しない。

Read Sessionはraw connectionを公開しない。

closed後のqueryはsafe unavailableまたはclosed-session issueとして拒否する。

## 53. Store Capability Alignment

V000003適用後のStore Capabilityは次を所有できる。

- `markCancelled`を独立terminal Manual Repair transitionとして実行
- identity metadataを明示検証
- fingerprintでreplay／conflictを分類
- writer epoch mismatchを拒否
- stale fenceとstale ownerを拒否
- commit unknownを4分類へ照合

## 54. Security Alignment

新metadata列にraw identityを保存しない。

domainはsafe enumでありraw tenantまたはProvider bindingではない。

fingerprintはkeyed factory outputである。

Store、Driver、migrationはcrypto keyを所有しない。

diagnosticへdigest、UUID、SQL、parameter、constraint、columnを含めない。

## 55. Failure Matrix

| Condition | Store classification |
|---|---|
| same identity and same fingerprint | replay |
| same identity and different fingerprint | conflict |
| missing identity metadata | corrupted or schema-mismatch |
| unknown algorithm／version／domain | corrupted |
| stale row revision | stale-revision |
| future expected revision | stale-revision |
| writer epoch mismatch | writer-epoch-mismatch |
| claim owner mismatch | stale-fence |
| fencing revision mismatch | stale-fence |
| cancelled Manual Repair mutation | terminal-preserved |
| partial commit lookup | corrupted |
| writer-authoritative lookup unavailable | unavailable |

## 56. Migration Verification Requirements

将来V000003 Migration Foundationは最低限次を検証する。

- V000001からV000003 fresh migration
- V000002からV000003 upgrade
- Flyway validate
- replay
- V000001／V000002 checksum不変
- table数不変
- cancelled lifecycle CHECK
- identity metadata completeness CHECK
- domain／algorithm／version CHECK
- fingerprint length／domain CHECK
- Manual Repair writer epoch CHECK
- Manual Repair claim／lease／fence CHECK
- existing V000002 reader compatibility
- no sixth business table

## 57. Store Verification Preconditions

PostgreSQL Reconciliation Store Foundationの実DB検証開始前に次が必要である。

- V000003 migrationがComplete
- fresh DB migrate成功
- V000002 upgrade成功
- schema readiness queryが定義済み
- identity／fingerprint factory interfaceがversioned
- deterministic test UUID generatorが利用可能
- test-only statement bridgeがV000003 statementを登録可能

## 58. Open Decisions

次はV000003 Migration Foundationで確定する。

- 正式migration filename
- exact column names
- exact constraint names
- exact index names
- legacy row provenance verification method
- nullable expand phaseの終了条件
- strict NOT NULL／completeness enforcementの導入段階
- schema metadata minor version
- Store reader compatibility range
- Store writer compatibility range

次はStore Foundationで確定する。

- typed identity／fingerprint capability names
- exact statement ID union
- exact row decoder issue union
- exact safe Store result union
- Read Session descriptor

これらを実装前に推測してはならない。

## 59. Non-blocking Operational Decisions

Scheduler cadence、Worker topology、Provider lookup binding、Webhook Inbox、Manual Repair API、Production roleは本書の対象外である。

これらはStore Schema alignmentを変更せず後続Contractで決定できる。

## 60. Prohibitions

本書に基づいて次を行ってはならない。

- V000002編集
- V000002 checksum変更
- Store内state mapping推測
- digest bytesからalgorithm／version／domain推測
- Store内fingerprint生成
- Driver内fingerprint生成
- Runtime内persistence encoding生成
- Manual Repair cancellationをrejectedへ暗黙変換
- revisionをwriter epochまたはfenceとして代用
- identity metadataをJSONBへ暗黙保存
- missing metadataの自動補完
- legacy rowの自動昇格
- Production connection

## 61. Stop Conditions

次の場合はStore Foundationを開始しない。

- V000003が未実装
- V000003 schema readinessが未検証
- Manual Repair cancelled stateが未表現
- identity metadata completenessが未表現
- semantic fingerprintが未保存
- Manual Repair writer epoch／fenceが未表現
- legacy rowを推測でbackfillする必要がある
- V000002変更が必要になる

## 62. Decision Summary

Manual Repair lifecycleはOption A、独立`cancelled` state追加を採用する。

identity metadataはslotごとの個別列を採用する。

semantic fingerprintはversioned keyed factoryが生成し、明示列へ保存する。

Manual Repairはrevision、writer epoch、fencing revisionを別々に所有する。

tenant、provider、workflow、operator、authorization、approval、claim ownerは個別algorithm／version／domain metadataを持つ。

MigrationはV000003 additive migrationを採用し、V000002を変更しない。

## 63. Store Foundation Restart Decision

このContractだけでPostgreSQL Reconciliation Store Adapter Foundation V1を再開できるか。

**NO**

理由は、採用Decisionをdurableに表現するV000003 migrationがまだ存在せず、Storeを先行実装するとschema column、constraint、compatibility rangeを推測する必要があるためである。

次工程はV000003 Reconciliation Store Schema Alignment Migration Foundationである。

V000003が実装、migrate、validate、upgrade、replay検証されるまでStore Foundationを開始しない。
