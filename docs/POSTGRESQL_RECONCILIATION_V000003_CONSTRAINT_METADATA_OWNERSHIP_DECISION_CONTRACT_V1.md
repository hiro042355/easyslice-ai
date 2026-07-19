# PostgreSQL Reconciliation V000003 Constraint and Metadata Ownership Decision Contract V1

## 1. Purpose

本書はV000003 Reconciliation Store Schema Alignment Migration実装前に残った二つの矛盾を解消するDecision Contractである。

決定対象は次に限定する。

- 既存Manual Repair CHECK constraintのtransactional replacement可否
- `workflow.workflow_schema_metadata`とV000003 migration headのownership

本書はMigration、Store、Runtime、Driver、Transaction、Composition、Production Connectionを実装しない。

本書はV000001およびV000002を変更しない。

## 2. Normative Context

本書は次を前提とする。

- `POSTGRESQL_RECONCILIATION_STORE_SCHEMA_ALIGNMENT_CONTRACT_V1.md`
- `POSTGRESQL_RECONCILIATION_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `WORKFLOW_RECONCILIATION_OPERATIONAL_POLICY_DECISION_CONTRACT_V1.md`
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`
- `V000001__initialize_slice_a_workflow_schema.sql`
- `V000002__add_workflow_reconciliation_schema.sql`

V000001は`workflow_schema_metadata_singleton_ck`によって`metadata_key = 'slice-a'`だけを許可する。

V000002はManual Repair stateを`requested`、`authorized`、`rejected`、`executing`、`reconciled`、`deferred`、`terminal-safe-failure`へ固定する。

## 3. Current Contradiction

Manual Repair cancellationには次の矛盾がある。

- Store Capabilityは`markCancelled`を要求する。
- `cancelled`は独立したterminal repair metadata stateでなければならない。
- V000002のstate CHECKは`cancelled`を拒否する。
- V000002のstate-time CHECKも`cancelled`を受理しない。
- 新CHECKを追加するだけでは既存CHECKの拒否を解除できない。
- 従ってtransactional DROP＋ADD CONSTRAINTが必要である。

Schema metadataには次の矛盾がある。

- `workflow_schema_metadata`のkeyは`slice-a`に固定される。
- 同じtableへ`reconciliation-v1` rowを追加できない。
- V000003物理migration headとReconciliation component readinessのownerが混同されていた。
- `slice-a` row更新、singleton CHECK一般化、別metadata table、Flyway history ownershipのいずれかを決める必要がある。

## 4. Constraint Replacement Options

### Option A: Transactional CHECK Replacement

既存CHECKを同一migration transaction内でDROPし、既存semanticsを包含する新CHECKを同名またはversioned nameでADDする。

利点は、既存tableとrow identityを維持し、`cancelled`だけを明示的に追加できることである。

既存rowを書き換えず、Store CapabilityとSchemaを1対1で整合できる。

### Option B: Cancelled Stateを採用しない

`markCancelled`を削除するか、cancel outcomeを保存しない。

Operational PolicyとStore Capabilityに反するため不採用である。

### Option C: 新しいManual Repair Tableへ移行

新tableは二重truth、FK、retention、active repair uniqueness、migration ownershipを複雑化する。

既存tableで安全に表現可能な一state追加のために新business tableを作る必要はないため不採用である。

### Option D: 新ColumnだけでCancelを表現

`cancelled_at`またはboolean flagだけを追加し、既存stateを維持する案である。

stateとflagの二重truthになり、`rejected`等への暗黙写像が必要になるため不採用である。

### Option E: V000003ではCancelledをDefer

Store実装を再び停止させ、Alignment Contractの決定を満たさないため不採用である。

## 5. Adopted Constraint Decision

Option Aを採用する。

transactional CHECK replacementを条件付きで許可する。

これはcolumn、table、rowを削除するdestructive migrationではない。

既存の許可semanticsを全て維持し、`cancelled`だけを追加するsemantic-preserving constraint replacementである。

必須条件は次である。

- Flyway migrationの同一transaction内でDROP／ADDを完了する。
- constraint-free状態をcommit外へ露出しない。
- 既存許可stateを全て維持する。
- `cancelled`以外の新stateを追加しない。
- replacement前に既存rowが新CHECKを満たすことを検証する。
- data mutation、state変換、row deleteを行わない。
- `NOT VALID`のまま長期間残さない。
- migration完了時に新constraintをvalidated stateとする。
- V000002 fileを変更しない。

constraint名は原則として既存名を維持する。

versioned renameが必要な場合はschema introspection Contractとtest expectationを同じmigrationで更新するが、名前変更だけを目的にversioned renameしない。

## 6. Cancelled Timestamp Decision

timestamp optionを比較する。

### Option A: Dedicated `cancelled_at`

cancel outcomeのwriter-authoritative時刻を独立列へ保存する。

### Option B: `completed_at`の流用

completionとcancellationを同一timestampへ押し込み、既存semanticsを変更するため不採用である。

### Option C: `updated_at`だけで表現

一般的なrow更新時刻はbusiness transition時刻ではないため不採用である。

### Option D: 別Journalだけで表現

Manual Repair rowのterminal state consistencyを単独で検証できないため不採用である。

Option Aを採用する。

V000003はnullableな`cancelled_at timestamptz`をadditiveに追加する。

`cancelled` stateでは`cancelled_at`を必須とする。

非cancelled stateでは`cancelled_at`をnullとする。

既存`completed_at`は流用しない。

`cancelled_at`はwriter PostgreSQLのtransaction timeをownerとする。

## 7. State-Time Constraint Replacement

state CHECKとstate-time CHECKを同一migration transactionで置き換える。

新state-time semanticsは次である。

- requested: approved_at、started_at、completed_at、cancelled_atはnull
- authorized: approved_at non-null、started_at、completed_at、cancelled_atはnull
- rejected: approved_at non-null、started_at、completed_at、cancelled_atはnull
- executing: approved_at、started_at non-null、completed_at、cancelled_atはnull
- reconciled／deferred／terminal-safe-failure: approved_at、started_at、completed_at non-null、cancelled_atはnull
- cancelled: cancelled_at non-null、completed_atはnull

cancelledへ到達するprior stateの差は、既存approved_at／started_atのnullable historyとして保持する。

cancelledでは次を許可する。

- requestedからcancelled: approved_at null、started_at null
- authorizedからcancelled: approved_at non-null、started_at null
- executingからcancelled: approved_at non-null、started_at non-null

started_at non-nullかつapproved_at nullは常に拒否する。

cancelled stateでcompleted_atを同時に設定することを拒否する。

## 8. Constraint Replacement Safety

Migrationはtransactionalでなければならない。

安全順序は次である。

1. `cancelled_at` nullable列を追加する。
2. 新CHECKが全既存rowを受理することをread-only preconditionで検証する。
3. 既存state CHECKをDROPする。
4. cancelledを含むstate CHECKを同名でADDする。
5. 既存state-time CHECKをDROPする。
6. cancelled_atを含むstate-time CHECKを同名でADDする。
7. catalog introspectionで両constraintがvalidatedであることを確認する。
8. migration transactionをcommitする。

いずれかが失敗した場合、PostgreSQL transaction rollbackによって旧constraintと旧schemaを回復する。

constraint-free windowはtransaction外へ露出しない。

Table-level lock取得時間はbounded migration operationとして監視する。

長時間lockを避けるため、existing row validationとmigration windowを事前評価する。

ただしlock回避のために`NOT VALID`を残してはならない。

## 9. Rolling Compatibility Matrix

| Application | Schema | Read | Write | Cancel write | Readiness |
|---|---|---|---|---|---|
| old | V000002 | supported | old statesのみsupported | unavailable | existing capability only |
| old | V000003 | old projectionならsupported | old statesのみsupported | disabled | compatible with feature gate |
| new | V000002 | fail closed | prohibited | prohibited | false |
| new | V000003 | supported | supported | supported | true after introspection |

Schema ahead／app behindでは、V000003 migrationを先行適用できる。

旧applicationが`SELECT *`とstrict unknown-column decoderを使用する場合はschema-ahead compatibleではないため、deployment前に明示projectionを確認する。

旧writerは既存stateだけを書き、cancelledを書かない。

cancel capabilityは全writer／readerがV000003対応になるまで有効化しない。

App ahead／schema behindでは、new Store Adapter readinessをfalseとし、mutationを開始しない。

unknown stateを旧readerが推測して処理してはならない。

## 10. Schema Metadata Options

### Option A: Existing `slice-a` Row Update

既存rowをWorkflow schema全体headとして更新する案である。

V000001のSlice A ownershipとcomponent versionを混在させるため不採用である。

### Option B: Singleton CHECK Generalization

CHECKを一般化し`reconciliation-v1` rowを追加する案である。

既存metadata architectureをV000003のためだけに変更し、component key lifecycleを未設計のまま導入するため不採用である。

### Option C: Separate Component Metadata Table

componentごとのmajor、minor、reader、writer rangeを持つ別tableを追加する案である。

将来有効になり得るが、専用Contractなしに今回追加しない。

### Option D: Flyway History Owns Physical Head

`flyway_schema_history`だけが物理migration headを所有する。

`workflow_schema_metadata`はSlice A専用の既存Contractとして維持する。

Reconciliation readinessはschema introspectionで検証する。

### Option E: Metadata Architecture Migration

既存metadataを汎用component structureへ移行する案である。

影響範囲とrolling compatibilityが大きく、V000003 alignmentの範囲を超えるため不採用である。

## 11. Adopted Metadata Decision

Option Dを採用する。

`workflow.workflow_schema_metadata`はV000001 Slice A専用のまま維持する。

V000003 migrationは`slice-a` rowを更新しない。

singleton CHECKを変更しない。

`reconciliation-v1` rowを追加しない。

新metadata tableを追加しない。

Flyway historyがV000003の物理migration headを所有する。

Reconciliation Store Adapter readinessはFlyway successとschema introspectionの両方で検証する。

既存Contractが`reconciliation-v1` metadata rowまたは`migration_head_identifier = V000003`を要求する記述は、後続のContract correctionでOption Dへ修正する必要がある。

## 12. Metadata Semantic Separation

次のversion ownershipを分離する。

| Semantic | Owner |
|---|---|
| Physical migration head | Flyway schema history |
| Slice A schema contract version | existing `workflow_schema_metadata` slice-a row |
| Reconciliation schema contract version | Reconciliation schema fingerprint／readiness contract |
| Runtime capability version | Reconciliation Runtime descriptor |
| Store adapter version | Reconciliation Store descriptor |
| Reader compatibility | Store readiness validator／descriptor |
| Writer compatibility | Store readiness validator／descriptor |

一つのmetadata rowへ全versionを押し込まない。

RuntimeはFlyway historyをbusiness lookupに使用しない。

Store mutation pathもFlyway tableを毎回参照しない。

## 13. Readiness Without New Metadata Row

V000003対応readiness adapterだけが起動時または明示的validation時に次を確認する。

- Flyway historyにV000001、V000002、V000003が各一件successとして存在する。
- 必須5 tableが存在する。
- V000003必須列が存在する。
- Manual Repair state CHECKがcancelledを受理する。
- Manual Repair state-time CHECKがcancelled_at consistencyを強制する。
- 旧invalid stateを拒否する。
- identity metadata group CHECKが存在しvalidatedである。
- semantic fingerprint group CHECKが存在しvalidatedである。
- Manual Repair writer epoch、fencing、claim、lease列が存在する。
- required FKと既存UNIQUEが維持される。
- required V000003 indexが存在する。

Readiness resultはsafe issue codeだけを返す。

SQL、constraint名、column名、database endpoint、migration row本文をRuntimeへ返さない。

Runtimeはreadiness adapterを直接business truth sourceとして使用しない。

## 14. Existing Contract Corrections

今回は既存文書を変更しない。

後続Contract correctionでは次を修正する。

### `POSTGRESQL_RECONCILIATION_STORE_SCHEMA_ALIGNMENT_CONTRACT_V1.md`

- schema metadata minor／head更新をV000003必須と読める記述を削除する。
- Flyway historyを物理head ownerとする。
- Reconciliation readinessをschema introspection ownerとする。
- semantic-preserving CHECK replacementを条件付き許可へ分類する。
- cancelled_at専用列Decisionを参照する。

### `POSTGRESQL_RECONCILIATION_SCHEMA_FOUNDATION_CONTRACT_V1.md`

- Reconciliation専用metadata row候補を必須要件として扱わない。
- V000001 singleton metadataがSlice A専用であることをErrataとして明記する。
- component metadata architectureは別Contractまでdeferする。

### V000003 Previous Implementation Instruction

- prior constraint DROP一律禁止を、semantic-preserving transactional CHECK replacement条件付き許可へ修正する。
- `reconciliation-v1` metadata row追加要求を削除する。
- existing slice-a metadata不変を維持する。
- Flyway history＋schema introspectionをV000003 readinessとする。

## 15. Migration Classification

| Migration operation | Classification |
|---|---|
| Additive column addition | permitted |
| Additive index addition | permitted |
| Additive CHECK addition | permitted |
| Semantic-preserving CHECK replacement | conditionally permitted |
| Column drop | prohibited |
| Table drop | prohibited |
| Existing data rewrite | prohibited by default |
| Metadata guessing backfill | prohibited |
| New business table | prohibited by default |

CHECK replacementは、既存許可domainを狭めず、新しい明示stateだけを追加し、同一transactionで完了する場合に限り許可する。

## 16. Existing Manual Repair Row Policy

既存Manual Repair rowは全て旧許可stateのいずれかでなければならない。

新state CHECKは旧許可stateを全て維持するため、既存rowはそのままvalidである。

`cancelled_at`はadditive nullable列なので既存rowではnullである。

既存timestampをcancelled_atへcopyしない。

既存stateを変換しない。

rowを削除しない。

cancel outcomeを過去rowから推測しない。

identity metadataとsemantic fingerprintのlegacy policyはAlignment Contractどおり、全null legacy groupまたは全non-null aligned groupだけを許可する。

legacy rowへdomain、algorithm、version、fingerprint、writer epoch semanticsを推測backfillしない。

Store writer readinessはaligned groupを持つrowに限定する。

## 17. Static Safety Contract

将来V000003 migrationで次を禁止する。

- V000001変更
- V000002変更
- data deletion
- state推測変換
- cancelledからrejectedへの変換
- cancelledからterminal-safe-failureへの変換
- completed_atまたはupdated_atのcancel timestamp流用
- metadata key推測
- raw identity保存
- raw Provider response保存
- raw operator identity保存
- trigger
- PostgreSQL ENUM
- RLS enable
- SUPERUSER
- extension install
- Production credential
- identity metadata guessing UPDATE
- semantic fingerprintのdatabase生成

CHECK replacement SQL以外のprior constraint DROPを許可しない。

## 18. Future Migration Test Plan

V000003 migration testは最低限次を検証する。

- fresh V000001→V000002→V000003 migration
- V000002適用済みDBからV000003 upgrade
- old Manual Repair全stateを持つexisting row compatibility
- state CHECK replacement成功
- state-time CHECK replacement成功
-旧stateが引き続き受理される
- cancelled state受理
- cancelled_at必須
- non-cancelledでcancelled_at拒否
- cancelledでcompleted_at拒否
- started_atとapproved_at ordering
- unknown state拒否
- migration failure rollbackで旧constraintが維持される
- Flyway migrate／validate／replay
- Flyway historyにV000003 successが一件
- `workflow_schema_metadata` slice-a row不変
- `reconciliation-v1` metadata row非存在
- readiness introspection成功
- V000001／V000002 checksum不変
- table数不変

Constraint rollback testは本番migration fileを改変せず、同等の一時transaction fixtureまたは故意に失敗するtest transactionで検証する。

## 19. Decision Matrices

### Constraint Decision Matrix

| Option | Contract | Existing rows | Rolling deployment | Store fit | Decision |
|---|---|---|---|---|---|
| no change | fails | compatible | easy | fails | reject |
| new flag column | ambiguous | compatible | mixed truth | poor | reject |
| new table | over-expansion | migration needed | complex | duplicate truth | reject |
| transactional CHECK replacement | aligned | compatible after validation | gated | exact | adopt |
| cancelled defer | incomplete | compatible | blocked | unavailable | reject |

### Metadata Decision Matrix

| Option | V000001 compatibility | Ownership clarity | Migration risk | Future fit | Decision |
|---|---|---|---|---|---|
| slice-a row update | weak | mixed | medium | poor | reject |
| CHECK generalization | changed | partial | medium | uncertain | reject |
| separate table | preserved | strong | medium | possible later | defer |
| Flyway ownership | preserved | strong separation | low | sufficient now | adopt |
| metadata architecture migration | broad impact | potentially strong | high | needs contract | reject now |

## 20. Stop Conditions

V000003実装を停止する条件は次である。

- replacement CHECKが既存許可stateを維持できない。
- existing rowが新CHECKを満たさない。
- cancelled_at ownerをwriter PostgreSQL timeにできない。
- replacementを同一transactionで完了できない。
- constraint-free状態がcommit外へ露出する。
- old app／new schemaをfeature gateで分離できない。
- Flyway historyとschema introspectionでreadinessを証明できない。
- V000001またはV000002変更が必要になる。
- data rewriteまたはrow deleteが必要になる。
- 別business tableが必要になる。
- metadata guessing backfillが必要になる。
- Production credentialが必要になる。

## 21. Readiness Decision

| Capability | Decision |
|---|---|
| Constraint replacement | Complete |
| Manual Repair cancelled lifecycle | Complete |
| Cancelled timestamp ownership | Complete |
| Metadata ownership | Complete |
| Flyway physical head ownership | Complete |
| Reconciliation readiness introspection | Complete |
| Existing Manual Repair row compatibility | Complete subject to migration precondition test |
| V000003 migration implementation | Ready to start |
| Store Adapter restart | After V000003 migrate／validate／replay completion |
| Production readiness | false |

本書によりV000003 migrationの設計上の停止理由は解消された。

Store AdapterはV000003完了前に再開しない。

Production Connectionは禁止を維持する。

## 22. Final Decision and Next Step

Manual Repairはtransactional CHECK replacementによって`cancelled`を正式stateとして追加する。

V000003は専用nullable `cancelled_at`列を追加し、既存completed_at semanticsを変更しない。

CHECK replacementはsemantic-preserving、same-transaction、existing-row-validatedの場合に限り許可する。

`workflow_schema_metadata`はSlice A専用として維持する。

Flyway historyがV000003物理headを所有する。

Reconciliation Store readinessは専用adapterによるschema introspectionで証明する。

新metadata rowまたは新metadata tableを今回追加しない。

次工程はV000003 Reconciliation Store Schema Alignment Migration Foundation V1である。

V000003完了後にPostgreSQL Reconciliation Store Adapter Foundation V1を再開できる。

Scheduler、Worker、Provider、Webhook、Runtime Composition、Production Connectionは引き続き未実装かつ禁止である。
