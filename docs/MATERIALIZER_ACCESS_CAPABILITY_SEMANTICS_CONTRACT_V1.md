# Materializer Access Capability Semantics Contract V1

## 1. Purpose

本ContractはMaterializerの`allowedAccessModes`が表す能力を固定する。
これはMaterialized Bodyへaccessを安全に保持できる能力であり、Production Providerのdirect-fetch保証ではない。

## 2. Current Gap

従来監査ではMaterializer表現能力とProvider direct能力を同一視し、signed-urlならUpload不要と推論していた。
現実装にはProvider-direct capability descriptorが存在しない。
存在しないProduction能力を推測してはならない。

## 3. Scope

Vocal、Music、MVのReference Materializer profileとUpload Gate semanticsを対象とする。
Workflow、HTTP、Provider実装、Credential、Network policyは対象外である。

## 4. Current Capability Matrix

| Operation | Materializer | Provider/API | Allowed modes |
|---|---|---|---|
| Vocal | reference-vocal-materializer-v1 | reference-provider/reference-api-v1 | signed-url, provider-upload, provider-native-asset, internal-stream |
| Music | reference-music-materializer-v1 | same | same |
| MV | reference-mv-materializer-v1 | same | same |

## 5. Capability Owner

Materializer representation capabilityのownerは`referenceProfiles.ts`である。
Operation mapping、kind、usage、requirement、cardinalityとaccess modeを同じprofileが所有する。
Callerがmode配列を上書きしてはならない。

## 6. Meaning Separation

`materializer-supported`はRequest Bodyへ安全に投影できることを意味する。
`reference-transport-supported`はReference simulatorがfixture transportを検証できることを意味する。
`provider-direct-supported`はProduction bindingの明示Contractがある場合だけ成立する。
`upload-required`はProvider-direct capabilityとpolicyから導出されるべきである。

## 7. signed-url Classification

Materialized Bodyはsigned-urlを保持できる。
Reference transport summaryはAsset count等を扱うが、Production fetchを保証しない。
Expiry、Network、Credential、Provider fetch policyは現Contractに存在しない。

## 8. provider-upload Classification

MaterializerはResolverのprovider-upload accessを表現できる。
これはUpload Sessionの生成能力を意味しない。
Session ownerはProvider Upload Foundationである。

## 9. provider-native Classification

Materializerはnative handleを表現できる。
Handleの生成、検証、TTLはProvider Upload Foundationが所有する。
FixtureやcallerはHandleを作らない。

## 10. internal-stream Classification

Materializerはinternal-stream accessを表現できる。
Production Providerへの到達可能性は別Contractである。
Reference profileの存在をProduction能力へ昇格しない。

## 11. Option A

現行Materializer profileを正とし、signed-urlはMaterializer pass-through可能とする。
Provider-direct Contractがないため、Upload Gate acceptedを要求しない。
既存同期挙動を完全維持できる。

## 12. Option B

Provider Binding capabilityを新設し、Materializer表現能力と分離する案である。
Production Provider要件が確定した将来Contractでのみ採用できる。
今回採用する根拠はない。

## 13. Option C

Reference testだけnative-onlyにする案は能力偽装になる。
Production semanticと異なるpending-uploadを作るため却下する。

## 14. Option D

`forceUpload` policyは実Business requirementがない。
HTTP、Fixture、scenarioから指定可能にしてはならない。
今回は却下する。

## 15. Option E

Expiry不足時だけUploadする案はProduction接続に近い。
しかしSubmit時刻、Provider fetch SLA、Credential policyが未定義のため対象外とする。

## 16. Decision

**Decision A**を採用する。
現行Materializer codeを変更しない。
Canonical pending-uploadをテスト都合で強制しない。

## 17. Upload Gate Ownership

Gateのactionは渡されたMaterializer capabilityに基づく。
Production Provider-direct capabilityが存在しない現状では、Materializer profileを狭めた偽capabilityを渡してはならない。

## 18. Reference Client

Reference Clientはsync/async transport scenarioを提供する。
これはAsset access modeのProduction利用可能性を保証しない。
Transport scenarioとMaterializer access capabilityを結合しない。

## 19. Transport Bridge

BridgeはMaterialized Requestのsemantic情報を保持する。
Bridge可能性とProvider fetch可能性は別である。
Bridgeがsigned-urlを保持できてもProvider-direct claimにはならない。

## 20. Backward Compatibility

Vocal、Music、MVの既存ready pathを維持する。
Operation pipeline、Materializer tests、Canonical synchronous HTTP結果を変更しない。
型・公開API・Provider Contract変更はない。

## 21. Security

Capability AuditにURL、Handle、Credential、Session、Asset IDを含めない。
Provider能力を推測したlogやIssueを追加しない。

## 22. Static Contract

Capability testはProfileのsafe descriptorだけを読む。
`as any`、Network、env、Date、Random、raw access値は禁止する。

## 23. Test Matrix

3 operation、全mapping、4 access modeを確認する。
Provider-direct fieldが存在しないことを明示検査する。
250,002 semantic assertionsでdeterminismを固定する。

## 24. Migration

Migrationは不要である。
将来Provider-direct capabilityを追加する場合は別major Contractとする。

## 25. Rollback

本変更はContractとaudit testだけである。
Runtime rollbackは不要である。

## 26. Open Questions

Production Providerはsigned URLを直接fetchできるか。
最低TTL、region、Credential、redirect policyは何か。
これらが確定するまでProvider-direct capabilityを追加しない。

## 27. Readiness

Reference Materializer Runtime Foundation V1は本Decisionを、Vocal、Music、MVのdeep-frozen static profileへ適用する。各mappingの`allowedAccessModes`はMaterializerがResolved Accessを型付きProvider Request fieldへ表現できることだけを示す。

このprofile metadataはProviderの直接fetch能力、credential readiness、endpoint availability、network readiness、Upload完了、Workflow readinessを示さない。Materializerはcaller supplied `baselineTime`に対してmode、expiry、minimum lifetimeを検証するだけで、access再発行、Upload、Provider submitを行わない。

検証ownerは`tests/materializerCapability/materializerAccessCapabilityAudit.test.ts`である。テストはsafe profile descriptorだけを読み、URL、token、handle、asset ID、credential、environment、networkを使用しない。

Capability Semantics Contractはreadyである。
Materializer Foundation変更は不要である。
pending-upload readinessは成立しない。
