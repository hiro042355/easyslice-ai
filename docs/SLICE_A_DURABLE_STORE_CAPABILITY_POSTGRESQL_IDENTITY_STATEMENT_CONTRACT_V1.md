# Slice A Durable Store Capability / PostgreSQL Identity / Statement Contract V1

Status: Design contract

Scope: server-only Slice A Store Capability V2、PostgreSQL statement ownership、identity mapping、read session、verification boundary

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose

- Slice A PostgreSQL Concrete Store Adapterを実装可能にするversioned capability境界を固定する。
- Reference Store V1とProduction Durable Store V2の責務を分離する。
- Store-owned SQLをtransaction-bound PostgreSQL connectionへ明示的に接続する。
- protected identityとinternal UUIDの生成責務を固定する。
- transaction-bound readとindependent read sessionを区別する。
- commit unknownをblind retryせずlookupで解決するownerを定める。
- 本Contract完成はProduction接続またはProduction launch完成を意味しない。

## 2. Normative Sources

- `PRODUCTION_WORKFLOW_RUNTIME_INTERFACE_CONTRACT_V1.md`をRuntime責務の上位Contractとする。
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`をStore semanticsの上位Contractとする。
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`をschema semanticsの上位Contractとする。
- `POSTGRESQL_VERSION_DRIVER_MIGRATION_TOOL_SELECTION_ADR_V1.md`を製品選択の根拠とする。
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`をTransaction V2の根拠とする。
- `V000001__initialize_slice_a_workflow_schema.sql`を実column、constraint、indexの正とする。
- 矛盾がある場合は実装で推測せずContract ownerへ戻す。

## 3. Current Foundation Status

- PostgreSQL Test Environment Foundation V1はCompleteである。
- Slice A Migration Foundation V1はCompleteである。
- PostgreSQL Driver Adapter Foundation V1はCompleteである。
- Production Durable Transaction Adapter Foundation V2はCompleteである。
- Slice A Store V2候補実装はRuntimeへ未接続である。
- Production Connectionは未実装かつ禁止されている。
- Production Runtime Compositionは未接続である。

## 4. Current Gap

- V1 Store interfaceはReference `WorkflowTransactionContext`を要求する。
- Production Storeは`DurableWorkflowTransactionContext`を必要とする。
- Transaction V2 database commandはSQL文字列を公開しない。
- Store-owned statementをDriver queryへbindingする正式ownerが未定義だった。
- opaque `WorkflowProtectedIdentity.protectedValue`のencodingはDB digest encodingではない。
- schemaのinternal UUIDを生成するownerが未定義だった。
- transaction readとindependent readのconnection ownershipが未定義だった。

## 5. Slice A Definition

- Slice AはFinal Result、Result Reference、Outbox Eventのatomic groupである。
- Final Resultはimmutable terminal payloadのdurable truthである。
- Result Referenceはprotected token digestからFinal Resultへのdurable bindingである。
- Outbox Eventは同一commit内に保存されるdelivery intentである。
- 三recordは一つのphysical PostgreSQL transactionでcommitする。
- 三recordの一部だけが存在する状態はcorruptionである。
- Provider I/OはSlice A transactionへ含めない。

## 6. Formal Decision Summary

- V1 Store interfaceはReference専用として変更せず維持する。
- Slice A Store Capability V2をserver-only interfaceとして新設する。
- V2 write Storeは`DurableWorkflowTransactionContext`だけを受け取る。
- SQLはStore-owned immutable Statement Catalogが所有する。
- PostgreSQL固有bridgeへCatalogを明示登録する。
- AsyncLocalStorageをstatementまたはconnection locatorに使用しない。
- identity digestとUUIDは注入factoryから取得する。

## 7. V1 Store Interface

- V1 interfaceはReference contract testとin-memory adapter用である。
- V1 `WorkflowTransactionContext`をProduction PostgreSQL Contextへcastしない。
- V1 StoreをProduction capabilityとして登録しない。
- V1 Store resultをPostgreSQL commit evidenceとして扱わない。
- V1 callback orchestration semanticsは回帰oracleとして維持する。
- V1型へoptional database capabilityを追加しない。
- V1からV2へのfallbackは禁止する。

## 8. Slice A Store Capability V2

- V2はV1と別interface名、別version、別descriptorを持つ。
- V2はFinal Result、Result Reference、Outboxの三capabilityをbundleする。
- write methodはTransaction V2 Contextを必須入力とする。
- read methodはtransaction-bound版とindependent read版を分離する。
- V2 public型からraw `pg`型をexportしない。
- V2 descriptorはFoundation中`productionReady: false`である。
- V2存在だけでRuntime capabilityをavailableにしない。

## 9. Proposed Bundle Shape

```ts
type SliceAStoreCapabilityV2 = Readonly<{
  capabilityVersion: "2.0";
  finalResults: FinalResultStoreV2;
  resultReferences: ResultReferenceVaultV2;
  outbox: OutboxStoreV2;
  atomic: SliceAAtomicComposerV2;
  unknownLookup: SliceACommitUnknownLookupV2;
}>;
```

- exact placementはserver-only moduleとする。
- bundleはlive connectionを保持しない。

## 10. Durable Context Requirement

- `commitIfAbsent`は`DurableWorkflowTransactionContext`を受け取る。
- `compareAndSet`は同Contextを受け取る。
- `issueIfAbsent`は同Contextを受け取る。
- `append`、`claimBatch`、`markDelivered`は同Contextを受け取る。
- StoreはContextの`database.execute()`だけを使用する。
- StoreはTransaction Managerを呼ばない。
- StoreはBEGIN、COMMIT、ROLLBACKを送らない。

## 11. Context Compatibility

- Context versionとdatabase capability versionを検証する。
- expired ContextはStore call前またはexecute時にfail closedする。
- ContextをStore instanceへ保存しない。
- Contextをrecord、cache、registryへ保存しない。
- Store method完了後にContextをclosureへ保持しない。
- raw transaction identityをStore resultへ返さない。
- Context mismatchはsafe invalid capability resultへmappingする。

## 12. Final Result Store V2

- `commitIfAbsent()`はprotected result identityのuniquenessを使用する。
- duplicateはexisting recordを読み、immutable field一致を確認する。
- same identity／same payloadはreplayとして返せる。
- same identity／different payloadはconflictまたはcorruptedである。
- `read()`はlifecycleとschema versionを検証する。
- `compareAndSet()`はexpected revision必須である。
- terminal payload overwriteを許可しない。

## 13. Final Result CAS

- CAS対象はContractで許可されたlifecycle metadataに限定する。
- expected revision一致をSQL WHERE条件へ含める。
- update成功時だけrevisionを一増加する。
- result status、operation、terminal payloadを更新しない。
- zero-row updateはnot-found、revision conflict、terminal policyを追加readで分類できる。
- stale revisionをsilent successにしない。
- deleted＋held等の不可能stateをcorruptedとして扱う。

## 14. Result Reference Vault V2

- `issueIfAbsent()`はprotected token digestとresult kind uniquenessを使用する。
- Referenceは既存Final Result internal UUIDへFKで結ぶ。
- duplicate replayはtoken identityとresult/kind/owner/tenantを比較する。
- token collisionまたはresult-kind collision不一致はconflictである。
- `resolve()`はraw tokenを受け取らずversioned digestを受け取る。
- expiry、revocation、deletion、legal holdを検証する。
- Reference文字列をdiagnosticへ返さない。

## 15. Reference Corruption

- Referenceだけ存在しFinal Resultが存在しない状態はcorruptedである。
- FKがあることだけでapplication decodeの正しさを推測しない。
- kind、operation、tenant、regionの不一致はcorruptedである。
- unsupported record/schema versionはcorruptedである。
- invalid digest lengthはquery前に拒否する。
- duplicate rowsはcardinality conflictとしてcorruptedにする。
- corruption branchでReferenceやdigestを露出しない。

## 16. Outbox Store V2

- `append()`はevent digest uniquenessを使用する。
- payloadはsafe scalar JSON objectだけを受け取る。
- initial delivery stateは`pending`である。
- `claimBatch()`はeligible rowsをstable orderで選ぶ。
- claimは`FOR UPDATE SKIP LOCKED`を使用する。
- `markDelivered()`はmatching fencing revisionを要求する。
- `reconciliation-required`を正式delivery stateとして扱う。

## 17. Outbox Claim

- claim limitはbounded safe integerである。
- claim ownerはversioned protected digestである。
- lease expiryはcanonical UTC timestampである。
- claimed rowはattempt、revision、fencing revisionを更新する。
- concurrent workerは同じrowを同時claimできない。
- stale fenceはdelivery成功として扱わない。
- claim orderはnext eligibilityとstable event IDを用いる。

## 18. Outbox Delivery

- delivered transitionはclaimed stateからだけ許可する。
- matching event identityとfencing revisionをWHEREへ含める。
- delivered時にclaim ownerとleaseをclearする。
- delivered timestampを設定する。
- 既にdeliveredのsame requestはduplicateとして扱える。
- stale fenceは`stale-fence`を返す。
- delivery failureをdomain transaction rollbackと表現しない。

## 19. Atomic Composer Interface

```ts
type SliceAAtomicComposerV2 = Readonly<{
  commit(
    context: DurableWorkflowTransactionContext,
    group: SliceAAtomicGroupV2,
  ): Promise<DurableWorkflowTransactionOperationResult<SliceAAtomicCommitValue>>;
}>;
```

- ComposerはTransaction Managerを呼ばない。
- supplied Contextだけを三Storeへ渡す。

## 20. Atomic Write Order

- 最初にFinal ResultをcommitIfAbsentする。
- 次にResult ReferenceをissueIfAbsentする。
- 最後にOutbox Eventをappendする。
- 全step成功後だけcallback successを返す。
- 途中failureはcallback safe failureを返す。
- Managerがcallback failureを受けて全transactionをrollbackする。
- Composer自身はrollbackを送らない。

## 21. Atomic Replay

- 三recordがすべて存在しimmutable fieldsが一致する場合だけreplayedである。
- 三recordがすべてnewの場合はcommitted-new候補である。
- newとexistingが混在した場合は全体整合性を検証する。
- existing mismatchはconflictまたはcorruptedである。
- replayで新しいOutbox Eventを追加しない。
- replayでrevisionを増加させない。
- replay判定にraw business identityを使用しない。

## 22. Partial Corruption

- Final Resultだけ存在する場合はpartial corruptionである。
- Final ResultとReferenceだけ存在する場合もpartial corruptionである。
- Final ResultとOutboxだけ存在する場合もpartial corruptionである。
- ReferenceまたはOutboxだけ存在する状態もcorruptedである。
- partial状態をretryで補完しない。
- automatic repairを行わない。
- operator repair Contractができるまでfail closedする。

## 23. Commit Unknown Lookup Ownership

- commit unknown lookupはAtomic Composerと別capabilityが所有する。
- Transaction AdapterはStore recordを推測しない。
- Store individual methodはcommit unknownをblind retryしない。
- command ownerがprotected result、Reference、event identityを保持する。
- lookupはauthoritative writer visibilityを使用する。
- Provider I/Oをlookupへ含めない。
- lookup resultを次command policyへ返す。

## 24. Commit Unknown Lookup Result

- 三recordが存在し相互整合する場合は`committed`である。
- 三recordがすべて存在しない場合は`not-committed`である。
- 一部だけ存在する場合は`corrupted`である。
- record mismatchは`corrupted`である。
- writerへ到達不能なら`unavailable`または`still-unknown`である。
- unavailableをnot-committedへ変換しない。
- lookupだけがblind retry前の正式reconciliation pathである。

## 25. Statement Ownership

- SQL textのownerは各PostgreSQL Store moduleである。
- Transaction ManagerはStore SQLを所有しない。
- Driverはbusiness statementを所有しない。
- Composerは三StoreのSQLを複製しない。
- statement textをRuntime consumerへ公開しない。
- SQL changeはStore Contractとmigration compatibilityを必要とする。
- statement ownershipをtest helperへ移さない。

## 26. Immutable Statement Catalog

```ts
type PostgreSQLStatementCatalog = Readonly<{
  catalogVersion: "1.0";
  statements: readonly Readonly<{
    statementId: string;
    sql: string;
  }>[];
}>;
```

- Catalogと各entryをimmutableにする。
- statement IDはstable safe identifierである。

## 27. Statement Catalog Rules

- statement IDはCatalog内でuniqueである。
- SQL textはnon-emptyかつboundedである。
- SQLはparameterizedである。
- business valueの文字列連結を禁止する。
- dynamic identifier、keyword、ORDER BY fragmentを受け取らない。
- allowlisted static SQLだけを登録する。
- Catalog versionとschema writer versionを照合する。

## 28. Statement Registration

- CatalogはPostgreSQL transaction/read adapterへ明示登録する。
- registrationはComposition前のbootstrap stageで行う。
- callback中にCatalog登録を変更しない。
- duplicate same catalogはidempotentに扱える。
- same statement ID／different SQLは起動失敗である。
- unknown statement IDはquery前に拒否する。
- Registryへlive connectionを保存しない。

## 29. Statement Executor Bridge

- Bridgeはstatement IDをregistered SQLへ解決する。
- Bridgeはvalidated parametersをPostgreSQL Driver requestへmappingする。
- Bridgeはexpected cardinalityをDriverへ渡す。
- Bridgeはtransaction-bound dedicated connectionだけを使用する。
- Bridgeは`pool.query`を使用しない。
- BridgeはStore result mappingを所有しない。
- Bridgeはraw Driver errorをStoreへ返さない。

## 30. Transaction-bound Execution

- BEGIN後に得たDriver transaction connectionをsessionが所有する。
- 同一Contextの全statementは同じphysical connectionで実行する。
- Storeはconnection identityを取得できない。
- Context expiry後にBridgeを呼ばない。
- failed transaction後のnew statementを拒否する。
- COMMIT／ROLLBACK開始後のstatementを拒否する。
- completion後はreleaseまたはdiscardする。

## 31. Driver Responsibility

- DriverはPool、checkout、physical Client、codecを所有する。
- Driverはparameterized query送信を所有する。
- DriverはPostgreSQL type decodeを所有する。
- DriverはSQLSTATE safe classificationを所有する。
- Driverはtransaction connection stateを所有する。
- DriverはStore domain resultを所有しない。
- DriverはCatalogのbusiness semanticsを推測しない。

## 32. Store Responsibility

- Storeはstatement definitionsを所有する。
- Storeはinput validationとparameter projectionを所有する。
- Storeはrow decodeとschema/version validationを所有する。
- Storeはconstraint classからdomain resultへmappingする。
- Storeはduplicate replay comparisonを所有する。
- StoreはBEGIN、COMMIT、ROLLBACK、releaseを所有しない。
- StoreはProviderまたはWorkflow APIを呼ばない。

## 33. Parameter Boundary

- UUIDはcanonical validated stringとして渡す。
- digestはowned 32-byte `Uint8Array`として渡す。
- revisionはunsafe numberへ変換せずdecimal stringとして扱う。
- timestampはcanonical UTC stringとして渡す。
- JSONBはvalidated safe objectをapproved codecで渡す。
- undefined、function、symbol、cyclic JSONを拒否する。
- parameter値をdiagnosticへ出さない。

## 34. Row Decode Boundary

- int8 revisionをstringとしてdecodeする。
- timestamptzをcanonical UTCとしてdecodeする。
- byteaをowned copyとしてdecodeする。
- JSONBをvalidated owned dataとしてdecodeする。
- unknown columnをsemantic defaultへ推測しない。
- missing required columnはcorruptedである。
- unsupported schema/record versionはcorruptedである。

## 35. Identity Protection Responsibility

- raw token、tenant、owner、aggregate identityをStoreへ渡さない。
- Identity Protection ownerがversioned digestを生成する。
- digest algorithmは`sha256`、versionは1をV000001で要求する。
- digest outputは正確に32 bytesである。
- Storeはopaque stringのencodingを推測しない。
- hexまたはbase64 textを自動decodeしない。
- digest factory failureはquery call 0でfail closedする。

## 36. Versioned Digest Factory

```ts
type VersionedDigestFactory = Readonly<{
  factoryVersion: "1.0";
  create(input: ApprovedIdentityBytes):
    | Readonly<{ algorithm: "sha256"; version: 1; bytes: Uint8Array }>
    | undefined;
}>;
```

- input bytesの取得ownerはSecurity／Identity boundaryである。
- factoryはowned output copyを返す。

## 37. Digest Mutation Isolation

- factoryはcaller inputを変更しない。
- Storeはdigest bytesをparameter化する前にowned copyを作る。
- Registry descriptorへdigestを保存しない。
- record resultは必要に応じowned copyを返す。
- test mutationが次queryへ影響しないことを確認する。
- digestをstring化してlogしない。
- digest equalityはconstant-time requirement ownerを別Security Contractで固定する。

## 38. Internal UUID Responsibility

- `result_id`、`reference_id`、`event_id`はinjected ID generatorが生成する。
- Storeは`Math.random()`を使用しない。
- Storeはdatabase default UUIDを推測しない。
- generator outputはcanonical UUID validatorを通す。
- invalid UUIDではquery call 0とする。
- UUIDにtenant、Reference、operationを埋め込まない。
- generatorはProduction entropy providerとtest deterministic providerを分離する。

## 39. UUID Replay Semantics

- duplicate replay時に新規生成UUIDをexisting identityとして返さない。
- INSERT conflict後はexisting rowのinternal UUIDを読む。
- atomic subsequent writesはexisting Final Result UUIDを使用する。
- ReferenceとOutbox FKは同一resolved result UUIDを使用する。
- generated-but-unused UUIDはdurable identityではない。
- UUID collisionはconflictとしてfail closedする。
- UUIDをpublic Referenceとして使用しない。

## 40. Read Session Decision

- readはtransaction-bound readとindependent read-sessionに分離する。
- transaction-bound readは`DurableWorkflowTransactionContext.database`を使用する。
- independent readはexplicit `SliceAReadSession`を使用する。
- Storeがread用Poolを直接所有しない。
- read sessionはraw Clientを公開しない。
- read sessionはregistered Statement Catalogだけを実行する。
- read modeをmethod名または型で明示する。

## 41. Transaction-bound Read

- atomic replay comparisonはtransaction-bound readを使用する。
- CAS zero-row classificationは同一Context readを使用できる。
- unknown lookupを新transactionで行う場合は明示Contextを使用する。
- transaction-bound readはsame snapshot semanticsに従う。
- Context expiry後はreadを拒否する。
- Storeは別connectionへ切り替えない。
- write callback中のindependent read session利用は禁止する。

## 42. Independent Read Session

- independent sessionはResult Query等のread-only consumer候補である。
- session acquisition ownerは将来のPostgreSQL Composition Adapterである。
- Storeはsessionを生成しない。
- session lifecycleはcallerまたはread-session ownerが管理する。
- sessionへcredentialやconnection configを公開しない。
- authoritative writer／replica policyはProduction Connection Contractで固定する。
- FoundationではProduction read connectionを作らない。

## 43. Read Consistency

- commit unknown lookupはauthoritative writer visibilityを要求する。
- stale replicaでnot-committedを断定しない。
- ordinary readのreplica利用は別Read Consistency Contractまで保留する。
- atomic callback内readは同一transaction snapshotを使用する。
- claim queryはwritable transactionを使用する。
- delivered confirmationはfencing revisionを確認する。
- consistency modeをambient global stateから取得しない。

## 44. Constraint Mapping

- Final Result identity UNIQUEはreplay comparisonへmappingする。
- Reference token UNIQUEとresult-kind UNIQUEを区別する。
- Reference FK failureはatomic corruptionまたはinvalid orderingである。
- Outbox event identity UNIQUEはduplicate comparisonへmappingする。
- CHECK violationはinvalid/corrupted inputへmappingする。
- SQLSTATE class 08はtransaction phaseによりunavailableまたはunknownである。
- raw constraint名をpublic resultへ返さない。

## 45. Failure Matrix

| Failure | Store result | Transaction action | Connection action | Retry |
|---|---|---|---|---|
| invalid digest/UUID | invalid/corrupted | callback failure | rollback if active | no |
| UNIQUE same record | replay/found | continue validation | retain | no |
| UNIQUE mismatch | conflict | rollback | release after rollback | no |
| FK/CHECK | conflict/corrupted | rollback | release after rollback | no |
| serialization/deadlock | retryable conflict | rollback | release after rollback | owner decision |
| class 08 before commit | unavailable | rollback if possible | discard if unknown | no blind retry |
| commit acknowledgement loss | commit unknown | reconcile | discard | lookup only |
| partial lookup | corrupted | stop | release read session | no |

## 46. Atomic Failure Matrix

| Final | Reference | Outbox | Classification |
|---|---|---|---|
| new | new | new | committed-new after DB commit |
| same | same | same | replayed after DB commit/read validation |
| failure | not run | not run | rollback |
| success | failure | not run | rollback all |
| success | success | failure | rollback all |
| present | absent | absent | corrupted lookup |
| present | present | absent | corrupted lookup |
| unknown | unknown | unknown | commit-unknown lookup required |

## 47. Safe Diagnostics

- diagnosticはstore ID、statement ID、safe issue classだけを含められる。
- SQL textを含めない。
- parameter valuesを含めない。
- digest、UUID、Reference、tenantを含めない。
- terminal payloadまたはOutbox payloadを含めない。
- raw PostgreSQL errorをspreadしない。
- stack、detail、hintを返さない。

## 48. Store Registry

- Registryはlookup-onlyである。
- descriptor copy isolationを提供する。
- unknown IDは`undefined`を返す。
- descriptorは`productionReady: false`を維持する。
- RegistryはStore instance、Context、sessionを保持しない。
- RegistryはSQL textまたはCatalogを公開しない。
- Registry discoveryをRuntime readinessとみなさない。

## 49. Store Validator

- capability versionを検証する。
- 三StoreとAtomic Composer、unknown lookupのmethod集合を検証する。
- V1 Store shapeをV2として受理しない。
- raw structural castでvalid扱いしない。
- descriptorとCatalog version compatibilityを確認する。
- invalid resultへinput objectを返さない。
- validation failureでDB callは0回である。

## 50. Test-only Statement Bridge

- test-only bridgeは`tests/`または`tests/helpers/`配下に置く。
- Store-owned Catalogを明示登録する。
- registered statement IDをSQLへ解決する。
- PostgreSQL Driverのdedicated transaction connectionを使用する。
- Production connection readerを実装しない。
- process.envからcredentialを読まない。
- test environmentから渡されたtemporary connectionだけを使用する。

## 51. Test-only Bridge Prohibitions

- test SQLをStore SQLの代わりに定義しない。
- unknown statementを実行しない。
- `pool.query`でtransactional Store commandを実行しない。
- global statement registryを作らない。
- raw PoolClientをStore Contextへ渡さない。
- production moduleからtest helperをimportしない。
- test-only bridgeをProduction readiness evidenceだけでProductionへ昇格しない。

## 52. Real PostgreSQL Test Matrix

- V000001 migration compatibilityを確認する。
- Final／Reference／Outbox atomic commitを確認する。
- third write failureで前三writeがrollbackされることを確認する。
- duplicate same replayを確認する。
- duplicate mismatch conflictを確認する。
- CAS success、stale revision、terminal payload不変を確認する。
- Reference uniqueness、FK、resolveを確認する。

## 53. Outbox Test Matrix

- appendとduplicate comparisonを確認する。
- bounded claimとstable orderingを確認する。
- 複数connectionの`SKIP LOCKED`分離を確認する。
- fencing revision更新を確認する。
- mark delivered successを確認する。
- duplicate deliveredとstale fenceを確認する。
- reconciliation-required stateを確認する。

## 54. Unknown and Corruption Test Matrix

- all three presentをcommittedへmappingする。
- all three absentをnot-committedへmappingする。
- 各partial combinationをcorruptedへmappingする。
- immutable mismatchをcorruptedへmappingする。
- unavailable readをnot-committedにしない。
- commit response-loss controlled fault後にlookupする。
- unknown branchでautomatic write call 0を確認する。

## 55. Identity Test Matrix

- digest factoryが32-byte owned outputを返す。
- invalid digest lengthを拒否する。
- input mutationがoutputへ影響しない。
- output mutationが次生成へ影響しない。
- invalid UUIDでDB call 0を確認する。
- deterministic test UUIDとProduction generatorを混同しない。
- raw identity文字列がSQL parameter／diagnosticへ出ないことを確認する。

## 56. Read Test Matrix

- transaction-bound readが同じuncommitted writeを観測する。
- 別connectionはcommit前writeを観測しない。
- independent read sessionはcommit後writeを観測する。
- rollback後recordを観測しない。
- expired Context readを拒否する。
- read sessionとtransaction Contextを暗黙交換しない。
- commit unknown lookupがauthoritative pathを使用する。

## 57. Static Security Boundary

- Production Store moduleはserver-onlyである。
- `"use client"`、React、app、components、hooksをimportしない。
- fetch、XMLHttpRequest、window、documentを使用しない。
- process.env、globalThis、Symbol.forを使用しない。
- StoreはPool、PoolClient、AsyncLocalStorageをimportしない。
- `as any`、`unknown as`、raw Error exportを禁止する。
- Provider、Workflow API、Business Logicをimportしない。

## 58. SQL Static Boundary

- SQLはStatement Catalog所有moduleだけに存在する。
- transaction manager sourceにSlice A table名を置かない。
- test helperにcanonical Store SQLを複製しない。
- parameter placeholderを使用する。
- input string interpolationを使用しない。
- migration DDLをStore moduleへ複製しない。
- statement IDとSQLのunique bindingをstatic testで確認する。

## 59. V1 to V2 Migration Strategy

- Phase 1でV1とV2型を並存させる。
- Phase 2でV2 PostgreSQL Store contract testsを完成させる。
- Phase 3でAtomic Composerとunknown lookupを完成させる。
- Phase 4でversioned Runtime Store bundle slotを定義する。
- Phase 5でconsumer単位にV2へ移行する。
- V1 instanceをV2へcastしない。
- ProductionでV1 fallbackを行わない。

## 60. Runtime Composition Boundary

- 本ContractではComposition Rootを変更しない。
- Store V2を現行Runtime bundleへ直接挿入しない。
- Catalog registration ownerは将来のPostgreSQL Composition Contractで固定する。
- Production config readerを追加しない。
- Production credentialを解決しない。
- capability availableを宣言しない。
- developer/test environment以外へ接続しない。

## 61. Production Prohibition

- Production connection stringを作らない。
- process.envでStoreをenableしない。
- managed databaseへ接続しない。
- Production role、credential、KMSを仮定しない。
- Production Runtime hard denyを解除しない。
- Workflow APIをStore V2へ接続しない。
- Production launch判定をCompleteにしない。

## 62. Readiness Matrix

| Capability | Foundation state | Runtime-ready | Production-ready |
|---|---|---|---|
| V000001 schema | Complete | schema check required | no |
| PostgreSQL Driver | Complete | composition required | no |
| Durable Transaction V2 | Complete | composition required | no |
| Slice A Store V2 types | Foundation candidate | tests required | no |
| Statement Catalog | Contracted | registration required | no |
| test-only bridge | verification only | no | no |
| identity/UUID factory | Contracted | production bindings required | no |
| Store V2 Runtime bundle | not connected | no | no |
| Production connection | prohibited | no | no |

## 63. Foundation Acceptance Gates

- V1 Store interfaceが無変更である。
- V2 write methodがDurable Contextだけを受ける。
- Store-owned Catalogとexplicit registrationが存在する。
- test-only bridgeがdedicated Driver transaction connectionを使う。
- identity encodingを推測しない。
- UUID generatorが注入される。
- transaction readとindependent readが型で分離される。
- atomic、replay、rollback、unknown、corruptionの実DB証跡がある。

## 64. Additional Acceptance Gates

- CASとterminal immutabilityが実証される。
- Reference uniquenessとpartial corruptionが実証される。
- Outbox claim、fence、deliveryが実証される。
- multi-connection visibilityが実証される。
- migration compatibilityが実証される。
- static security testが通る。
- Production接続とRuntime Compositionが未変更である。

## 65. Stop Conditions

- V1 Store interface変更が必要なら停止する。
- raw PoolClientをStoreへ渡す必要があるなら停止する。
- StoreがBEGIN、COMMIT、ROLLBACKを送る必要があるなら停止する。
- transaction中にpool.queryが必要なら停止する。
- identity encodingまたはUUIDを推測する必要があるなら停止する。
- SQLをTransaction Managerへ移す必要があるなら停止する。
- commit unknownをrollbackまたはretryへ変換する必要があるなら停止する。

## 66. Additional Stop Conditions

- partial stateをautomatic repairする必要があるなら停止する。
- Provider I/Oをtransactionへ含める必要があるなら停止する。
- migration変更が必要なら別Migration Contractまで停止する。
- new dependencyが必要ならapprovalまで停止する。
- Production credentialまたはprocess.env接続が必要なら停止する。
- real PostgreSQL testをskipする必要があるなら停止する。
- test-only bridgeをProduction moduleへ移す必要があるなら停止する。

## 67. Open Questions

- Production identity protectorのkeying／salt policy owner。
- Production UUID generator implementationとentropy source。
- authoritative writer read-session acquisition policy。
- Production Catalog registration lifecycleとchecksum policy。
- Outbox dead-letter、retention、lease durationのowner。
- Store query timeoutとlock timeoutのproduction values。
- operator repair interfaceとpartial corruption runbook。

## 68. Implementation Sequence

1. V2 Store interfaceとvalidatorsを確定する。
2. immutable Statement Catalogとregistration validatorを確定する。
3. test-only explicit statement bridgeを作る。
4. V000001上でFinal Result、Reference、Outboxを検証する。
5. Atomic Composer、rollback、replay、unknown lookupを検証する。
6. CAS、claim、delivery、multi-connectionを検証する。
7. Production Compositionは別Contractまで開始しない。

## 69. Final Decision Matrix

| Concern | Decision | Rejected shortcut |
|---|---|---|
| V1 Store | Reference-only維持 | V2 Context追加 |
| V2 Store | dedicated server-only capability | V1 cast |
| SQL owner | Store Statement Catalog | Manager／test helper所有 |
| execution | explicit registered bridge | ambient lookup |
| transaction | supplied Durable Context | Store-owned transaction |
| digest | versioned factory | opaque string decode推測 |
| UUID | injected generator | random／DB default推測 |
| read | transaction/read-session分離 | implicit Pool read |
| unknown | authoritative lookup | blind retry |

## 70. Completion Statement

- Slice A Store Capability V2の責務を正式に固定した。
- Durable Transaction V2専用write boundaryを採用した。
- Store-owned immutable Statement Catalogを採用した。
- explicit statement registrationとDriver bridgeを採用した。
- identity digestとinternal UUIDの責務を分離した。
- read sessionとcommit unknown lookup ownershipを固定した。
- test-only verificationとProduction境界を分離した。
- 本Contractに基づきReal Database Contract Verificationを開始できる。
