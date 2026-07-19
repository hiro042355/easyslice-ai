# Slice A PostgreSQL Corruption Verification Contract V1

Status: Design contract

Scope: Real PostgreSQL corruption verification policy for V000001 Slice A

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose

- V000001を変更せずSlice A corruption verification policyを固定する。
- database上で生成不能なcorruptionとapplication projection上のcorruptionを分離する。
- constraint rejectionを正式なverification evidenceとして定義する。
- Synthetic Safe Fixtureの使用可能範囲を限定する。
- Real PostgreSQL testをskipせず、安全なcorruption branchを検証可能にする。
- schema integrityを弱めるtest shortcutを禁止する。
- 本Contract完成はStore Adapter完成またはProduction readinessを意味しない。

## 2. Normative Sources

- `V000001__initialize_slice_a_workflow_schema.sql`をdatabase integrityの正とする。
- `POSTGRESQL_DURABLE_STORE_SCHEMA_FOUNDATION_CONTRACT_V1.md`をschema semanticsの根拠とする。
- `SLICE_A_DURABLE_STORE_CAPABILITY_POSTGRESQL_IDENTITY_STATEMENT_CONTRACT_V1.md`をStore V2境界の根拠とする。
- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`をdurable Store semanticsの根拠とする。
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`をtransaction semanticsの根拠とする。
- 本ContractはV000001の制約を遡及変更しない。
- 文書間に矛盾がある場合はschema integrityを弱めず停止する。

## 3. Core Decision

- V000001制約下で生成不能なrow corruptionを実DBへ捏造しない。
- Database rejection is the verificationと定義する。
- DBに保存されないinvalid inputはrejection evidenceで検証する。
- DB外のsnapshot／decode／lookup corruptionだけSynthetic Safe Fixtureで検証する。
- synthetic fixtureを実DB persisted corruptionと呼ばない。
- real DB rejection testとsynthetic mapper testを両方要求する。
- constraint無効化によるcorruption生成を禁止する。

## 4. Why Corruption Cannot Exist Under V000001

- Result ReferenceはFinal Resultへ即時FOREIGN KEYを持つ。
- Outbox EventもFinal Resultへ即時FOREIGN KEYを持つ。
- 両FKは`ON DELETE RESTRICT`を使用する。
- revision列はnon-negative CHECKを持つ。
- payload versionとschema versionは固定version CHECKを持つ。
- lifecycleとdelivery stateは複合CHECKを持つ。
- transaction atomicityにより途中の三record状態はcommitされない。

## 5. Immediate Foreign Keys

- Reference insert時に存在しないFinal Result UUIDを指定するとstatementが失敗する。
- Outbox insert時に存在しないFinal Result UUIDを指定するとstatementが失敗する。
- FKはdeferredではないためtransaction commitまでinvalid stateを保持できない。
- failure後のPostgreSQL transactionはrollbackを必要とする。
- dangling Referenceをdurable rowとして生成できない。
- dangling Outboxをdurable rowとして生成できない。
- このrejection自体をFK integrityの証拠とする。

## 6. Delete Restriction

- Referenceが存在するFinal ResultのdeleteはRESTRICTで拒否される。
- Outboxが存在するFinal ResultのdeleteもRESTRICTで拒否される。
- parent deleteによりdangling childを生成できない。
- cascade deleteをtestだけで追加しない。
- FK orderingを変更しない。
- delete failure後はsafe rollbackを確認する。
- dangling fixture作成を目的にconstraintを弱めない。

## 7. Check Constraints

- negative revisionはCHECKで拒否される。
- unsupported record／schema／payload versionはCHECKで拒否される。
- invalid enum-like textはCHECKで拒否される。
- invalid digest algorithm、version、lengthはCHECKで拒否される。
- impossible lifecycle combinationはCHECKで拒否される。
- invalid Outbox delivery combinationはCHECKで拒否される。
- DB rejection is the verificationを適用する。

## 8. Atomic Transaction Protection

- Final Result、Reference、Outboxは一transactionで書く。
- secondまたはthird write failureは全writeをrollbackする。
- rollback成功後にpartial groupは観測できない。
- commit unknownだけはlookupによるreconciliationを必要とする。
- atomic failureをpartial corruption fixture生成に利用しない。
- 別connectionからuncommitted intermediate rowをcorruptionと扱わない。
- visibility testとcorruption testを区別する。

## 9. Constraint-generated Rejection

- invalid statementがDBに拒否された事実をprimary evidenceとする。
- rejection後にinvalid rowが存在しないことを確認する。
- transaction内failureならrollback後の非存在を確認する。
- safe SQLSTATE class mappingを確認できる。
- raw SQLSTATEまたはconstraint名をpublic resultへ出さない。
- raw database error本文をtest diagnosticへ複製しない。
- rejectionをtest failureではなく期待されたintegrity resultとして扱う。

## 10. Dangling Foreign Key Verification

- non-existing Final Result UUIDへのReference insertを実DBで試す。
- non-existing Final Result UUIDへのOutbox insertを実DBで試す。
- 両statementがFK violationとして拒否されることを確認する。
- invalid child rowが0件であることを確認する。
- parent rowを後から追加してchildを復活させない。
- deferred constraintへ変更しない。
- dangling persisted rowを作成しない。

## 11. Malformed Revision Verification

- negative revision insertを実DBで試す。
- invalid fencing revisionを実DBで試す。
- revision CHECK violationとして拒否されることを確認する。
- invalid rowが0件であることを確認する。
- unsafe bigint conversionを使わない。
- text projection decoderのmalformed revisionはsynthetic branchで別途確認する。
- DB row corruptionとdecoder corruptionを混同しない。

## 12. Malformed Payload Version Verification

- unsupported payload versionを実DB insertで試す。
- unsupported schema versionを実DB insertで試す。
- version CHECK violationとして拒否されることを確認する。
- rowが保存されないことを確認する。
- migration versionをtest用に追加しない。
- decoderへunsupported versionを与えるtestはsynthetic fixtureで行う。
- production reader compatibilityを推測しない。

## 13. Impossible Transition Verification

- deletedかつheld等の禁止lifecycle combinationを実DBで試す。
- Outbox stateとnullable delivery fieldの禁止組合せを実DBで試す。
- terminal overwriteはStore SQLのWHERE／immutable update policyで拒否する。
- CAS stale revisionはzero-row resultとして拒否する。
- invalid transition後に元rowが変化していないことを確認する。
- transitionを成立させるためCHECKを変更しない。
- impossible stateをpersisted fixtureにしない。

## 14. Unique Constraint Verification

- same protected Final Result identityのduplicate insertを試す。
- same Reference token identityのduplicate insertを試す。
- same result／Reference kindのduplicate insertを試す。
- same Outbox event identityのduplicate insertを試す。
- same semanticsはStore replay comparisonへ進める。
- different semanticsはconflictとして扱う。
- UNIQUE constraintをdropまたはdisableしない。

## 15. Database Rejection Result

- rejected inputは`invalid`、`conflict`、`corrupted-input`等のsafe classへmappingできる。
- exact safe classはStore method Contractに従う。
- rejection resultへSQL、parameter、UUID、digestを含めない。
- retryableでないCHECK／FK violationをautomatic retryしない。
- serialization／deadlockとintegrity violationを区別する。
- connection actionはtransaction stateに従う。
- rejection後のrollback successでconnection再利用を許可できる。

## 16. Synthetic Corruption Definition

- Synthetic corruptionはDB rowを破壊せずapplication projectionへinvalid dataを与えるtestである。
- Decoder、Unknown Lookup、Domain Mapperだけが対象である。
- fixtureはsafe bounded objectでなければならない。
- credential、raw token、tenant、payload本文を含めない。
- production schemaへinsertしない。
- test-only module外へexportしない。
- synthetic evidenceをdatabase corruption evidenceと表現しない。

## 17. Synthetic Safe Fixture

- fixtureはimmutable plain dataとして構築する。
- fixture作成にraw pg row型を必要としない。
- field集合はdecoder inputのsafe projectionに限定する。
- binary valueはowned `Uint8Array`を使用する。
- timestampはsafe canonical／invalid sampleを明示する。
- cyclic、getter、prototype pollutionを拒否する。
- test終了後に永続resourceを残さない。

## 18. Partial Snapshot

- Final present／Reference absent／Outbox absentをsynthetic lookup resultで表現できる。
- Final＋Reference present／Outbox absentを表現できる。
- Final＋Outbox present／Reference absentを表現できる。
- child present／parent absentはlookup projectionとしてだけ表現できる。
- partial projectionは`corrupted`へmappingする。
- missing recordをautomatic repairしない。
- synthetic fixtureをDBへ保存しない。

## 19. Inconsistent Lookup Result

- lookup countとrecord projectionの不一致をsyntheticに表現できる。
- same protected identityに複数authoritative candidateがあるprojectionを表現できる。
- result UUID linkage mismatchを表現できる。
- tenant、region、operation mismatchをsafe tokensで表現できる。
- inconsistent resultは`committed`へmappingしない。
- `not-committed`へもmappingしない。
- `corrupted`または`still-unknown`をContractに従い返す。

## 20. Impossible Decoded State

- decoderへunsupported enum projectionを与えられる。
- negative／non-decimal revision projectionを与えられる。
- invalid timestamp projectionを与えられる。
- illegal nullable-field combinationを与えられる。
- unsupported version projectionを与えられる。
- decoderはdefault値で修復しない。
- safe `corrupted`結果を返す。

## 21. Duplicate Authoritative Sources

- cardinalityが1を超えるauthoritative projectionをsyntheticに表現できる。
- duplicate Final candidateをreplayと推測しない。
- duplicate Reference candidateをtoken replayと推測しない。
- duplicate Outbox candidateをdelivery duplicateと推測しない。
- uniqueness constraintが実DBで防ぐことも別testで確認する。
- projection cardinality conflictはcorruptedである。
- fixtureにreal protected identityを含めない。

## 22. Truncated Snapshot

- required field欠落をsynthetic fixtureで表現できる。
- truncated byteaを表現できる。
- truncated JSON projectionを表現できる。
- missing version／revision／timestampを表現できる。
- decoderはpartial objectをdomain recordへ昇格しない。
- raw invalid fieldをdiagnosticへ返さない。
- mutationなしでsafe failureを返す。

## 23. Unexpected Projection

- unknown fieldを含むprojectionをfixtureで表現できる。
- unexpected value typeを表現できる。
- Date、Buffer、class instanceを公開domain objectへ通さない。
- unknown-field policyはdecoder versionに従う。
- ambiguous projectionをsemantic defaultへ変換しない。
- raw pg objectをdomain resultへ返さない。
- safe corruption resultだけを返す。

## 24. Unknown Outcome Verification

- COMMIT acknowledgement lossはDB corruptionではない。
- outcomeは`unknown`として保持する。
- automatic retryを行わない。
- authoritative lookupでall、none、partialを分類する。
- DB unavailableなら`still-unknown`または`unavailable`を返す。
- partial lookupはcommit lookup corruptionである。
- unknown outcome testはcontrolled connection faultを使用できる。

## 25. Commit Lookup Corruption

- all three consistent recordsは`committed`である。
- all three absentはauthoritative visibility確認後`not-committed`である。
- 一部だけ存在するprojectionは`corrupted`である。
- 三recordのlinkage mismatchも`corrupted`である。
- unavailable readを`not-committed`にしない。
- lookup branchでwriteまたはrepairを行わない。
- synthetic partial resultとreal all／none lookupを組み合わせて検証する。

## 26. Decoder Corruption

- decoder corruptionはinvalid row projectionをdomain objectへ変換できない状態である。
- malformed revision、version、timestamp、digestを含む。
- invalid JSONB projectionを含む。
- impossible enumまたはnullabilityを含む。
- decoderはthrow detailを外へ返さない。
- input objectをmutationしない。
- DB constraint rejection testとは別suiteにする。

## 27. Repository Corruption

- Repository corruptionは複数Store projectionの整合性不一致である。
- V1 Foundationではautomatic repairしない。
- RepositoryがDB constraintを迂回してrowを作成してはならない。
- duplicate source、partial aggregate、linkage mismatchを検出する。
- safe corruption codeを上位へ返す。
- raw recordをIssue／Auditへ含めない。
- Concrete Repository実装は本Contractの範囲外である。

## 28. Store Corruption

- Store corruptionはrequired row decodeまたはimmutable comparison失敗である。
- Storeはcorrupted rowをfoundとして返さない。
- Storeはmissing fieldを補完しない。
- Storeはinvalid rowをupdateしてrepairしない。
- read-only safe resultを返す。
- transaction中に検出した場合はcallback failureへmappingできる。
- corruption detection後のconnection actionはtransaction stateに従う。

## 29. Runtime Corruption

- Runtime corruptionはversion-incompatible Store／Transaction graph等を指す。
- Runtime validatorが起動時にfail closedする。
- Reference fallbackを行わない。
- Store row corruptionとRuntime graph corruptionを混同しない。
- browserへinternal corruption detailを返さない。
- Runtime Compositionは本Contractの範囲外である。
- Production readinessはfalseを維持する。

## 30. Verification Classification Matrix

| Classification | Persist in V000001 | Verification owner | Evidence |
|---|---:|---|---|
| database corruption impossible | no | schema | constraints present |
| database rejection | no | real PostgreSQL | rejected statement＋row absence |
| synthetic corruption | no | decoder／mapper test | Synthetic Safe Fixture |
| unknown outcome | unknown | transaction／lookup | controlled fault＋lookup |
| commit lookup corruption | no new write | unknown lookup | partial/inconsistent projection |
| decoder corruption | no | row decoder | safe decode failure |
| repository corruption | no repair | repository contract | aggregate mismatch result |
| Store corruption | no repair | Store adapter | safe corrupted result |
| Runtime corruption | no | Runtime validator | startup rejection |

## 31. Real PostgreSQL Matrix

- FK violationを実DBで確認する。
- CHECK violationを実DBで確認する。
- UNIQUE violationを実DBで確認する。
- stale CAS rejectionを実DBで確認する。
- terminal payload overwrite rejectionを実DBで確認する。
- impossible lifecycle／delivery transition rejectionを実DBで確認する。
- 各rejection後にinvalid durable rowが0件であることを確認する。

## 32. Real FK Matrix

- dangling Reference insert requestをDBが拒否する。
- dangling Outbox insert requestをDBが拒否する。
- parent delete requestをRESTRICTが拒否する。
- rollback後にchild rowが存在しない。
- Reference／Outboxの正常FK linkageはcommitできる。
- raw UUIDをdiagnosticへ返さない。
- constraint disableなしで実行する。

## 33. Real CHECK Matrix

- negative Final revisionを拒否する。
- negative Reference revisionを拒否する。
- negative Outbox revision／fenceを拒否する。
- unsupported payload／schema versionを拒否する。
- invalid lifecycle combinationを拒否する。
- invalid Outbox delivery combinationを拒否する。
- invalid rowがtransaction外から見えないことを確認する。

## 34. Real UNIQUE Matrix

- Final identity duplicateを拒否またはStore replayへ収束させる。
- Reference token duplicateを拒否またはreplayへ収束させる。
- result／kind duplicateを拒否する。
- Outbox event duplicateを拒否またはreplayへ収束させる。
- different immutable semanticsをconflictにする。
- duplicate check後にrow countが1であることを確認する。
- automatic second insertを行わない。

## 35. Real CAS Matrix

- expected revision一致のapproved lifecycle updateは成功する。
- stale revisionはzero-row updateとなる。
- future revisionもzero-row updateとなる。
- missing identityはnot-foundとなる。
- terminal payloadをCAS対象に含めない。
- concurrent writerは一方だけ成功する。
- failed CAS後にrecord内容が不変であることを確認する。

## 36. Real Impossible Transition Matrix

- deleted＋heldへのtransitionを拒否する。
- active Referenceとdeleted lifecycleの不整合を拒否する。
- pending Outboxにclaim fieldsを設定する不整合を拒否する。
- claimed Outboxからrequired fieldsを欠落させるtransitionを拒否する。
- delivered stateのrequired timestamp欠落を拒否する。
- reconciliation-requiredのinvalid failure classを拒否する。
- rejection後の元state不変を確認する。

## 37. Synthetic Matrix

- partial lookupをSynthetic Safe Fixtureで確認する。
- corrupted snapshotをfixtureで確認する。
- decode failureをfixtureで確認する。
- impossible domain objectをfixtureで確認する。
- duplicate authoritative projectionをfixtureで確認する。
- truncated／unexpected projectionをfixtureで確認する。
- synthetic inputがDBへ送られないことを確認する。

## 38. Safe Fixture Security

- fixtureにproduction tokenまたはcredentialを使用しない。
- fixtureのdigestはdeterministic test-only bytesを使用できる。
- raw tenant、subject、Reference、Asset IDを含めない。
- raw SQLまたはSQLSTATEをfixtureへ含めない。
- payload本文をdiagnostic assertionへ含めない。
- fixtureをproject外temporary fileへ保存しない。
- fixture outputをlogしない。

## 39. Prohibited Techniques

- `ALTER TABLE ... DISABLE TRIGGER`を使用しない。
- constraintをdropまたは`NOT VALID`へ変更しない。
- deferred FKへ変更しない。
- system catalogをupdateしない。
- `UPDATE pg_catalog`を使用しない。
- alternate schemaで弱い制約を再現しない。
- V000001を変更しない。

## 40. Additional Prohibitions

- corruption fixture用migrationを追加しない。
- V000002を追加しない。
- raw page manipulationを行わない。
- PostgreSQL data directoryへfilesystem injectionしない。
- binary WAL／heap fileを書換えない。
- Docker imageまたはentrypointを改変しない。
- managed／remote databaseへfallbackしない。

## 41. Constraint Disable Prohibition

- test roleへconstraint disable権限を与えない。
- replication roleによるtrigger bypassを使用しない。
- `session_replication_role`を変更しない。
- superuser shortcutをcorruption生成へ利用しない。
- constraint rejection testは通常statement pathを使用する。
- migration owner権限をStore testへ流用しない。
- prohibition違反時はtestを停止する。

## 42. Schema Fidelity

- test environmentはV000001をFlywayで適用する。
- test table copyをcanonical evidenceにしない。
- constraint名、FK action、CHECK bodyがmigrationと一致することを確認する。
- migration checksumを変更しない。
- fresh DBとreplay DBで同じpolicyを適用する。
- schema drift時はreadiness falseとする。
- test successでProduction migration readinessを自動宣言しない。

## 43. Transaction Failure Handling

- constraint violation後はfailed transactionとして扱う。
- new statementを継続しない。
- rollbackを実行する。
- rollback成功後だけconnectionを通常releaseする。
- rollback failureまたはconnection lossではdiscardする。
- raw callback errorを返さない。
- rejected writeをcommit successとして報告しない。

## 44. Unknown Lookup Safety

- lookupはread-onlyである。
- lookup中にmissing rowを作成しない。
- partial rowを補完しない。
- lookup unavailable時にblind retry writeを行わない。
- authoritative writer visibilityを要求する。
- read replicaだけでnot-committedを断定しない。
- safe classificationだけを返す。

## 45. Diagnostics

- 許可するのはsafe stage、safe issue code、semantic outcome、retryable classだけである。
- SQL textを出さない。
- parameter、UUID、digest、token、tenantを出さない。
- constraint名、table名、column名を出さない。
- SQLSTATEをpublic diagnosticへ出さない。
- raw Error、host、port、payload本文を出さない。
- synthetic invalid field値も返さない。

## 46. Test Naming

- DB rejection testは`rejects-*`等の名前でrejection evidenceを明示する。
- synthetic testは`synthetic-*`を名前に含めることを推奨する。
- dangling persisted rowを作成したと誤解させる名前を使用しない。
- unknown outcomeとcorruptionを別testにする。
- decoderとrepository corruptionを別testにする。
- test result summaryでreal／synthetic件数を分離する。
- skipをgreenとして扱わない。

## 47. Evidence Requirements

- real testはPostgreSQL major 18上で実行する。
- V000001 migration適用済みを確認する。
- expected rejectionとrow absenceをassertする。
- synthetic testはDB call 0をassertする。
- input mutationなしをassertする。
- raw sensitive detail非露出をassertする。
- cleanup後にcontainer／volume／network残存がないことを確認する。

## 48. Readiness Matrix

| Gate | Required evidence | V000001 change |
|---|---|---:|
| FK integrity | real rejection＋row absence | no |
| CHECK integrity | real rejection＋row absence | no |
| UNIQUE integrity | real rejection／safe replay | no |
| CAS integrity | real zero-row conflict | no |
| transition integrity | real rejection＋state unchanged | no |
| decoder corruption | Synthetic Safe Fixture | no |
| commit lookup corruption | real all/none＋synthetic partial | no |
| unknown outcome | controlled fault＋authoritative lookup | no |

## 49. Compatibility Result

- V000001変更なしを維持できる。
- Real PostgreSQL使用を維持できる。
- FK、CHECK、UNIQUE、RESTRICTを維持できる。
- Store Contractのcorruption classificationを維持できる。
- impossible rowをDBへ捏造せずdecoder branchを検証できる。
- real rejectionとsynthetic corruptionを組み合わせてcoverageを得られる。
- Production schema safetyをtest都合で弱めない。

## 50. Acceptance Gates

- dangling FKはreal DB rejectionで検証される。
- malformed revision／versionはreal CHECK rejectionで検証される。
- impossible transitionはreal CHECK／CAS rejectionで検証される。
- partial snapshotはSynthetic Safe Fixtureで検証される。
- decoderはimpossible domain objectを拒否する。
- unknown lookupはcommitted、not-committed、corrupted、unavailableを区別する。
- migration、schema、constraintが無変更である。

## 51. Stop Conditions

- persisted dangling rowがacceptance条件なら停止する。
- persisted malformed CHECK rowがacceptance条件なら停止する。
- constraint disableが必要なら停止する。
- alternate schemaが必要なら停止する。
- V000001変更またはmigration追加が必要なら停止する。
- raw page／catalog／filesystem manipulationが必要なら停止する。
- synthetic fixtureをProduction codeへ入れる必要があるなら停止する。

## 52. Additional Stop Conditions

- DB rejectionをtest failureとして回避する必要があるなら停止する。
- synthetic corruptionをreal persisted corruptionと報告する必要があるなら停止する。
- partial corruptionをautomatic repairする必要があるなら停止する。
- commit unknownをblind retryする必要があるなら停止する。
- raw invalid valueをdiagnosticへ出す必要があるなら停止する。
- real PostgreSQL testをskipする必要があるなら停止する。
- constraint fidelityを証明できないなら停止する。

## 53. Completion Decision

- Database corruption impossibleを正式classificationとする。
- Database rejection is the verificationを正式policyとする。
- Decoder／Unknown Lookup／Domain MapperだけSynthetic Safe Fixtureを使用できる。
- real PostgreSQLとsynthetic testの証拠を分離する。
- schema constraintを変更せずcorruption behaviorを検証する。
- Store実装へimpossible persisted fixtureを要求しない。
- 本ContractはCurrent Completion Auditの矛盾を解消する。

## 54. Next Verification Step

- Slice A Store Completion Auditを本Contractに基づき再開する。
- FK、CHECK、UNIQUE、CAS、transitionはreal rejectionで確認する。
- partial、decode、impossible projectionはsynthetic fixtureで確認する。
- commit unknownはreal all／noneとsynthetic partialを組み合わせる。
- constraint disable、schema変更、migration追加は行わない。
- test-only bridgeはV000001へ通常statementだけを送る。
- Production Statement BindingとRuntime Compositionは未実装のまま維持する。
