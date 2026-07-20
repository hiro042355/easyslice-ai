# Reference Logical Asset Fixture Factory Contract V1

## 1. Purpose

本ContractはReference test FoundationにおけるLogical Assetの正式構築境界を定義する。
Allowlisted public fixture IDからtyped `AssetReference`を生成し、既存Asset StoreとResolverへ接続する。
Factory callerはStore内部key、checksum、metadata recordを手書きしない。

## 2. Confirmed Logical Asset Gap

従来のCanonical fixtureはAssetReference factoryを持たなかった。
Callerが`fixture-audio`等のStore内部keyを知る必要があり、Store更新時のdriftを検知できなかった。
本Foundationはこのgapだけを解消する。

## 3. Current Reference Asset Store

正は`createReferenceAssetStore()`である。
StoreはRecordとInspectionをcopyして返し、instance間でmutationを共有しない。
既存failure fixtureと既存lookup keyのbehaviorは維持する。

## 4. Current Internal Fixture Keys

成功fixtureの内部keyは`fixture-audio`、`fixture-image`、`fixture-video`である。
これらはCatalogとStore integrationだけが所有する。
Descriptor、Issue、Registryは内部keyを返さない。

## 5. Current AssetReference Shape

`AssetReference`はbrandなしのplain typed objectである。
必須fieldは`assetId`と`kind`、optionalは`mimeType`、duration、dimensions、checksumである。
FactoryはCatalog値からowned objectを生成する。

## 6. Current Resolver Expectations

Resolver Planはopaque Asset ID、kind、MIME、positive metadata、checksumを検証する。
ExecutorはStore RecordとInspectionのkind、MIME、size、metadata、integrityを照合する。
accessはResolverだけが生成する。

## 7. Non-goals

Upload Gate、Session、Handle、Provider Client、HTTP、Canonical async compositionは対象外である。
Production Asset Registry、Network、filesystem、Credentialも対象外である。
pending-upload完成を宣言しない。

## 8. Ownership

Catalogはfixture semantic source of truthを所有する。
StoreはRecord lookup、Factoryはoperation-slot validation、Registryはsafe discoveryを所有する。
Resolver validationは既存moduleを正とする。

## 9. Fixture Descriptor

Descriptorはversion、public fixture ID、kind、MIME class、supported operation class、availabilityだけを持つ。
Asset ID、internal key、checksum、exact metadata、source identityを含めない。
lookup resultはcopyである。

## 10. Fixture ID

Public IDは`reference-logical-audio-fixture-v1`、`reference-logical-image-fixture-v1`、`reference-logical-video-fixture-v1`である。
IDは固定unionであり任意string registryではない。
Unknown IDはreadyにならない。

## 11. Logical Asset Factory

Factoryはplain-data inputを検証し、allowlisted combinationだけを受理する。
exact keys、data property、plain prototype、symbolなしを要求する。
成功時は新しいAssetReferenceを返す。

## 12. AssetReference Construction

AssetReference literalはFactory内部でCatalogからのみ構築する。
CallerとtestはAssetReferenceを手書きしない。
結果はStore lookup可能なlogical Asset IDを持つ。

## 13. Audio Fixture

Audioはaudio/wav、30秒、1024 byte class、verified sha256 catalogへbindする。
Vocal reference voice、Music reference audio、MV audio slotに対応する。
operationごとのusageとrequirementはFactory unionで固定する。

## 14. Image Fixture

Imageはimage/png、1280x720、1024 byte class、verified catalogへbindする。
MV `reference-image` slotだけを正式対応とする。
Scene assignmentは本Factoryで推測しない。

## 15. Video Fixture

Videoはvideo/mp4、30秒、1280x720、1024 byte class、verified catalogへbindする。
MV `reference-video` slotだけを正式対応とする。
Scene timingやroleは変更しない。

## 16. Kind

Audioは`audio`、Imageは`image`、Videoは`video`である。
Public fixture IDとkindはCatalogで一対一に固定する。
Callerによるkind overrideは禁止する。

## 17. MIME Type

MIMEはCatalogとInspectionの同一sourceから生成する。
Audio `audio/wav`、Image `image/png`、Video `video/mp4`である。
case変換やfallbackはFactoryで行わない。

## 18. Duration

AudioとVideoはCatalog metadataのdurationをAssetReferenceへ投影する。
Imageはdurationを持たない。
operation request durationへ合わせた改変は禁止する。

## 19. Dimensions

ImageとVideoはCatalog metadataのwidth/heightを投影する。
Audioはdimensionsを持たない。
Resolverのmetadata requirementが最終検証者である。

## 20. Size

SizeはStore Recordだけが保持し、AssetReferenceやDescriptorへ追加しない。
Reference成功fixtureは1024 byteである。
Factoryはsizeをcaller inputから受けない。

## 21. Checksum / Integrity

ChecksumはCatalogからAssetReference、Record、Inspectionへ同一値を投影する。
Callerはchecksumを指定しない。
Integrity状態はStore Recordが所有し、Factory Resultのsafe metadataには出さない。

## 22. Metadata

Audio、Image、Video metadataはdiscriminated unionのままCatalogに保持する。
Record生成時にcopyする。
Factory Registryはexact metadata valueを公開しない。

## 23. Usage

Vocalは`guide-vocal`、Music/MV audioは`audio-conditioning`である。
MV image/videoはそれぞれ`reference-image`、`reference-video`である。
任意usage stringは禁止する。

## 24. Requirement

Vocal、Music、MV image/videoはoptionalである。
MV primary audioはrequiredである。
Factory callerはこの組合せを変更できない。

## 25. Operation Compatibility

AudioはVocal、Music、MVをsupportする。
ImageとVideoはMVだけをsupportする。
Operation、slot、usage、requirementは一つのdiscriminated combinationとして検証する。

## 26. Store Binding

案Bのshared private catalogを採用する。
Store成功fixtureとLogical Factoryは同一Catalog Entryを参照する。
既存内部key lookupは後方互換のため維持する。

## 27. Resolver Binding

Factory AssetReferenceはPlan Builderを経由してExecutorへ渡す。
Store lookup、Record validation、Inspection validationは既存Resolverを変更しない。
全ready fixtureは`resolved`を返すことをbinding testで固定する。

## 28. Source Identity

Public fixture ID、logical Asset ID、internal Store keyは別概念である。
Public callerはfixture IDだけを指定する。
internal keyはCatalog/Store implementationから外へ返さない。

## 29. Public / Internal Boundary

Publicはfixture ID union、Descriptor、Factory input/result、Registry lookupである。
CatalogのStore fixture accessorはAsset Foundation integration用である。
HTTP、UI、AuditへCatalog detailを接続しない。

## 30. Validation

Factory validationはpure、同期、決定的である。
Unknown field、accessor、symbol、prototype、wrong combinationを拒否する。
Input mutationやnormalizationは行わない。

## 31. Failure Result

Failureは`invalid`または`unsupported`とsafe reason codeだけを返す。
Asset ID、checksum、internal key、raw input、raw errorを含めない。
Failure ResultはAssetReferenceを持たない。

## 32. Registry

Registryは3 Descriptorをlookup/listする。
結果はcopy-ownedで、Catalog objectを共有しない。
Unknownは`undefined`でありfallbackしない。

## 33. Determinism

同一inputは同一semantic AssetReference、slot、usage、requirementを返す。
Date、Random、env、Network、filesystemを使用しない。
object field orderはvalidation結果に影響しない。

## 34. Mutation Isolation

Factory input、Catalog、Store instance、Factory Result、Resolver Resultは参照を共有しない。
Repeated Factory resultも別objectである。
Registry mutationはsource Descriptorへ伝播しない。

## 35. Security

Issue、Descriptor、RegistryにAsset ID、checksum、internal key、URL、access、Credentialを出さない。
Factory successのAssetReferenceだけがlogical identityを保持する。
Session、Handle、provider-native accessは生成しない。

## 36. Static Contract

新Foundationはserver、node builtin、env、fetch、filesystem、console、timer、random、cryptoをimportしない。
`as any`、`unknown as`、Sensitive cast、ResolvedAsset literalは禁止する。
signed URL、Credential、Session、Handleを含めない。

## 37. Migration

既存Store internal keysは後方互換のため有効なままとする。
新callerはpublic fixture IDとFactoryを利用する。
既存Canonical fixtureは本Contractでは変更しない。

## 38. Test Matrix

5 operation-slot combination、3 Catalog binding、Resolver plan/executionを検証する。
Unknown field、wrong operation、prototype、getter、symbolを拒否する。
300,000 semantic matrix assertionsでdeterminismを検査する。

## 39. Rollback

Factory、Registry、Catalog integrationを削除し、Storeの3 success literalへ戻せる。
Provider、Workflow、API schema migrationは不要である。
Rollback時も既存failure fixture behaviorを保持する。

## 40. Open Questions

Canonical async compositionでaudio durationをsemantic request durationとどう整合するかは次Contractで決定する。
Upload Gate acceptedとPoll progressionは未検証である。
Production Asset Registryへの移行方法も未決定である。

## 41. Readiness

Logical Asset Fixture Foundation MVPは、Factory tests、Resolver binding、TypeScript、build成功でreadyとする。
これはpending-uploadまたは実Provider E2Eのready判定ではない。
次工程はCanonical Async Upload Asset Fixture compositionである。
