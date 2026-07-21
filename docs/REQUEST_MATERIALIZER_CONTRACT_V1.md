# Request Materializer Contract Specification V1

## 1. Purpose

Request Materializer Contract V1は、Provider-neutral Adapter Request内の論理Asset参照を、Asset Resolverが発行した実行Accessへ置換し、Provider Clientが送信できるSecret-bearing Requestを生成する境界を定義する。

```text
Provider-neutral Adapter Request
+ Sensitive<AssetResolutionExecutionResult>
+ Provider Materialization Profile
→ Request Materializer
→ Sensitive<MaterializedProviderRequest>
```

## 2. Design Philosophy

- **Preserve Meaning**: Asset参照以外の意味・順序・値を変更しない。
- **Complete or Fail**: Requiredが1件でも未解決ならRequestを返さない。
- **Secret Boundary**: 実行RequestだけをSensitiveにし、Audit/Issueはsecret-freeにする。
- **No Recursive Guessing**: 任意body探索、文字列検索、万能dot pathを使わない。
- **Provider-specific Mapping, Common Contract**: 共通validationとtyped handlerを組み合わせる。
- **Deterministic Structure**: 同じ入力とContextから同じ構造・順序を生成する。
- **Fail Closed**: usage、kind、mode、expiry、profileが曖昧なら修復せず失敗する。

## 3. Scope

V1はInput、Profile、typed mapping、Resolved Asset index、required/optional、access mode、expiry、proof、result、issue、audit、security、Reference materializer計画を設計する。

## 4. Non-Goals

Materializerコード、実Provider body、HTTP、Credential、Provider Upload、Output Ingestion、Media Preparation、Retry/Poll、Provider選択、Director/Scene/Prompt変更は含まない。

## 5. Architecture Position

```text
Director Decision
↓
Provider Adapter
↓
Provider-neutral Request
↓
Asset Resolution Plan / Execution
↓
Request Materializer
↓
Materialized Provider Request
↓
Provider Client
↓
External Provider
```

## 6. Responsibilities

担当: input/profile整合、明示Asset slot抽出、resolved lookup、required完全性、usage/kind/mode/expiry確認、typed body copy、optional omission、proof/audit生成。

非担当: 意味変換、Asset Resolution、Access再発行、mode fallback、Credential、transport、Provider選択、Review、Output Ingestion。

## 7. Adapter / Resolver / Materializer / Client Boundary

| Component | Responsibility |
|---|---|
| Adapter | 意味変換とassetIdを含むProvider-neutral Request |
| Resolver | assetId + usageを実行Accessへ解決 |
| Materializer | 明示slotのassetIdをAccessへ置換し完全性を証明 |
| Client | proof/version/expiryを再確認しCredentialを付けて送信 |

MaterializerはAdapter Mapping Recordを再解釈せず、ResolverのMIME/integrity/policy判断も繰り返さない。

## 8. Materialization Input

```ts
type RequestMaterializationInput<TRequest> = {
  contractVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  adapterRequest: TRequest;
  resolvedAssets: AssetResolutionExecutionResult;
  profile: ProviderMaterializationProfile;
  context: RequestMaterializationContext;
};
```

`AssetResolutionExecutionResult`は既にSensitive。Credential、Authorization、DirectorDecision、Scene Plan、raw Story/Lyrics、Approval、score、Billingを追加しない。

## 9. Provider-neutral Request

現行Reference Requestの明示Asset slot:

| Request | Slot | Shape |
|---|---|---|
| Vocal | `referenceVoiceAssetId` | optional single |
| Vocal | `guideMelodyAssetId` | optional single |
| Music | `referenceAudioAssetId` | optional single |
| MV | `audioAssetId` | required single |
| MV scene | `scenes[index].assetIds` | optional multiple、混合role |

Lyricsは文字列でありAssetReferenceではない。現行Music Requestにはguide vocal slotがなく、Vocal/Musicのunsupported assetはAdapter段階で既にomissionされる。Character、Location、Performer、Reference Image/VideoはMV scene `assetIds`へflattenされる。

## 10. Materialization Profile

```ts
type ProviderMaterializationProfile<TSlot> = {
  profileVersion: "1.0";
  profileId: string;
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  mappings: readonly AssetFieldMapping<TSlot>[];
  minimumAssetLifetimeSeconds: number;
};
```

Profileはsecret-freeで、Credential、Endpoint、Access値、body fixture、Promptを持たない。profileIdはsafe opaque identifierだが通常Auditには出さず、profileVersionだけを残す。

Reference V1では各Materializer instanceが固定Profileを所有する。Input ProfileはContract互換性確認用に受け取るが、固定ProfileとのJSON完全一致を要求し、minimum lifetime、mode、kind、mappingの差し替えを拒否する。

## 11. Asset Field Mapping

```ts
type AssetFieldMapping<TSlot> = {
  mappingId: string;
  sourceSlot: TSlot;
  usage: AssetUsage | readonly AssetUsage[];
  requirement: "required" | "optional";
  cardinality: "single" | "multiple";
  allowedAccessModes: readonly ResolvedAssetAccess["mode"][];
  maximumAssetCount: number;
  omissionBehavior: "remove" | "undefined" | "empty-array";
};
```

`sourceSlot`は任意文字列pathではなく、各typed materializerが所有するclosed unionとする。例: `"reference-voice" | "guide-melody"`。mappingIdはIssue/Auditへ出さない。

## 12. Typed Materializer Strategy

案Cを採用する。

```text
Common Core
- versions / profile / resolver / index / mode / expiry / audit

Typed Handler
- extractKnownAssetSlots(request)
- buildMaterializedBody(requestCopy, values, omissions)
- assertKnownSourceSlotsRemoved(body)
```

Vocal、Music、MVごとに関数を作る。dot path interpreter、prototype property書換え、任意recursive walkerは作らない。

## 13. Materialization Result

```ts
type RequestMaterializationResult<TBody> =
  | { status: "materialized"; request: MaterializedProviderRequest<TBody>; audit: RequestMaterializationAudit }
  | { status: "failed"; issues: RequestMaterializationIssue[]; audit: RequestMaterializationAudit };
```

Resolverが`degraded`でもrequiredが完全ならmaterialized可能。Materializer statusは`materialized | failed`だけとし、optional omissionはAudit reasonへ残す。failed時に偽Requestを返さない。

## 14. Materialized Provider Request

Provider Client Contractの既存型を正とする。

```ts
type MaterializedProviderRequest<TBody> = Sensitive<{
  requestVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  body: TBody;
  assetAccessCount: number;
  earliestAssetExpiry?: string;
  materialization: { status: "complete"; unresolvedAssetCount: 0 };
}>;
```

Credential、auth、correlation、timeout、idempotencyを含めない。runtime brand fieldは生成しない。body内の元assetId slotは削除し、対応Access slotだけを持つ。

## 15. Materialization Proof

V1のClient検証用proofは最小形を維持する。

```ts
type MaterializationProof = { status: "complete"; unresolvedAssetCount: 0 };
```

profile ID/version、provider/API/operation、count、expiryはRequest envelopeまたはsecret-free Auditで既に確認できるためproofへ重複させない。Asset ID、mapping ID、secretを含めない。

## 16. Resolved Asset Index

内部keyは`assetId + usage`。区切り文字連結ではなくnested Mapを推奨する。

```ts
Map<assetId, Map<AssetUsage, ResolvedAsset>>
```

同一key重複は`duplicate-resolved-asset`。同一assetId・異なるusageは別entry。Result配列順を保持し、indexを外部公開しない。lookup後もrequirement、kind、mode、expiry、metadata、integrityを照合する。

## 17. Required Asset Completeness

Adapter実参照、Profile requirement、Resolved Asset requirementの3者を比較する。Materializerはrequired/optionalを昇格・降格しない。

- Profile required slotが不在: failed
- Requestがrequired slotを参照しResolvedなし: failed
- ProfileとResolved requirement矛盾: failed
- Requestが参照しないAssetをProfileだけで新規追加: 禁止
- Requiredが1件でも失敗: body/secretを返さない

「いずれかrequiredなら自動required」ではなく、矛盾をIssue化してfail closedする。

## 18. Optional Asset Omission

Requestにoptional slotがなくても正常。参照がありResolverでomittedならtyped handlerがProfileの`omissionBehavior`に従いremove/undefined/empty-arrayへ変換し、元assetIdを残さない。

Resolver issuesの元原因は変更せず、Materializer Auditには`optional-asset-omitted`だけを固定順で追加する。Review判断はしない。Optionalのusage/kind/mode矛盾は安全なomissionではなくfailedとする。

## 19. Access Mode Mapping

```ts
type MaterializedAssetValue =
  | { mode: "signed-url"; url: string; expiresAt: string }
  | { mode: "provider-upload"; uploadSourceToken: string; expiresAt: string }
  | { mode: "provider-native-asset"; providerOutputHandle: string; expiresAt?: string }
  | { mode: "internal-stream"; streamToken: string; expiresAt: string };
```

Resolved Access discriminatorとProfile allowed modesをexact比較する。Materializerはmode/value/expiryを変更しない。unsupportedならfailedし、Workflowが再ResolutionまたはUploadを判断する。

Runtimeではmodeごとの必須fieldが非空文字列であることだけを検証する。Secret値の形式や実在性は解析しない。不正Access unionは`resolution-result-invalid`。

## 20. Provider Fetch

`signed-url`はURLとexpiresAtをtyped target slotへそのままcopyする。MaterializerはURLを再署名、encode、redirect、method変換しない。HTTPS/read-only等の発行安全性はResolver、endpoint/transport安全性はClient責務。Materializerはexpiryとcountだけ確認する。

## 21. Provider Upload

Reference FoundationではProfileが明示許可する場合に限り`provider-upload`値を配置できるが、Uploadを実行しない。

実Generation Providerでは案Bを推奨する: Uploader完了後の`provider-native-asset`をMaterializerへ渡す。Profileがupload source tokenを直接受け取る特殊Clientだけ案Aを許可する。未許可profileでは`access-mode-unsupported`。

## 22. Provider-native Asset

Provider-native handleはrestricted secretとして値をそのまま配置する。provider/API/profile一致を前提とし、Materializerがhandleを生成・検証・refreshしない。expiryなしを許可できるが、Profileが`requiresExpiry`を持つ場合はfailedとする。

## 23. Internal Stream

Reference ProfileはContract検証用に許可可能。実Provider ProfileはNEXCUT Proxy、Internal Fetch Client、Uploader等の消費境界が明示された場合だけ許可する。Generation Clientが暗黙にinternal tokenを理解すると仮定しない。

## 24. Expiry

Materializerは各AccessのexpiresAtを厳格UTC ISOへparseし、Context baselineとの差を計算する。expiry付きAccessの最小値を`earliestAssetExpiry`へ保持する。

```text
effective minimum = max(profile minimum, Provider Client共通minimum 120秒)
```

- signed URL/upload/internal stream: expiry必須
- provider-native: Profileが許可すればexpiryなし可
- exact minimum: 許可
- below/expired/invalid: failed、non-retryable
- MaterializerはAccess再発行やTTL変更をしない

## 25. Materialization Context

```ts
type RequestMaterializationContext = {
  contextVersion: "1.0";
  baselineTime: string;
  clientMinimumAssetLifetimeSeconds: 120;
};
```

baselineは厳格UTC ISO。Credential、Endpoint、clock functionを含めない。実時刻取得はWorkflowが担当する。

## 26. Body Copy and Mutation

Adapter Requestをdeep copyし、typed handlerが既知Asset slotだけを置換する。Scene/timeline配列順、score、label、duration、prompt相当文字列を保持する。JSON cloneで落ちる値を許可せず、Adapter Request schema validatorを先に通す。

Optional omission以外でfieldを削除しない。入力Request、Resolved Result、Access、Profile、Contextを変更しない。

## 27. Asset ID Residue Detection

body全文検索はしない。各typed handlerが以下を保証する。

1. closed source slotを全抽出
2. mappingごとの参照数を記録
3. 各slotを置換またはoptional omission
4. 既知source slotを出力型から除去
5. processed countとextracted countを比較
6. `unresolvedAssetCount=0`を生成

Provider固有bodyの別の文字列が偶然assetIdと一致しても探索しない。

## 28. Profile Coverage

Provider Request型、slot extractor、typed output type、Profile定数を同じProvider materializer moduleが所有する。compile-time exhaustivenessとruntime mapping ID重複検証を併用する。

現行MV `scenes[].assetIds[]`はusage/roleを失う。一つのassetIdに一致するResolved usageが一意なら許可し、複数usageなら`asset-usage-mismatch`で失敗する。将来Request V2では`{assetId, usage}`を保持する案を検討する。Materializerがkindからusageを推測しない。

同一assetIdを異なるSceneで同じusageとして再利用することは許可する。同一Scene内の重複IDはAdapter Request shape不正として拒否する。

## 29. Validation

固定順:

1. Contract Version
2. Input Shape
3. Provider ID
4. Provider API Version
5. Operation
6. Adapter Request Shape
7. Resolution Result Shape
8. Resolution Status
9. Profile Version
10. Profile Provider / API / Operation
11. Context Version / Time
12. Mapping definitions
13. Source field presence
14. Cardinality
15. Resolved Asset index
16. Requirement consistency
17. Usage consistency
18. Kind consistency
19. Access Mode support
20. Expiry
21. Target conflicts
22. Body construction
23. Source slot removal
24. Proof
25. Known-field security scan

runtime castされたnull/array/primitiveでも例外を投げず、最初の根本原因を固定Issueへするか、同一phase内の独立Issueを固定順で返す。Asset IDやfield値を含めない。

## 30. Status

```ts
type RequestMaterializationStatus = "materialized" | "failed";
```

Resolver `resolved | degraded`は入力候補、`failed | policy-blocked`はMaterialization失敗。optional omissionはmaterializedのAudit reasonであり、Materializer独自degraded statusは作らない。

## 31. Issue and Reason Codes

固定union/順序:

```text
unsupported-contract-version
input-shape-invalid
provider-mismatch
provider-api-version-mismatch
operation-mismatch
adapter-request-invalid
resolution-result-invalid
resolution-not-complete
unsupported-profile-version
profile-mismatch
context-invalid
materialization-profile-incomplete
source-field-missing
source-field-cardinality-invalid
duplicate-resolved-asset
required-asset-missing
requirement-mismatch
asset-usage-mismatch
asset-kind-mismatch
access-mode-unsupported
asset-access-expired
asset-access-lifetime-insufficient
target-field-conflict
unresolved-asset-reference
optional-asset-omitted
materialization-failed
```

Issueはmapping index、slot class、usage、kind等のsafe enumだけを持ち、Asset ID、path値、URL、Token、Handle、raw errorを持たない。

## 32. Audit

```ts
type RequestMaterializationAudit = {
  status: RequestMaterializationStatus;
  requiredReferenceCount: number;
  optionalReferenceCount: number;
  materializedCount: number;
  omittedCount: number;
  accessModes: readonly ResolvedAssetAccess["mode"][];
  reasonCodes: readonly RequestMaterializationReasonCode[];
  profileVersion: string;
};
```

Countはtyped handlerが抽出したRequest slot item単位。same asset/different usageは別参照。配列はmapping/Request初出順、重複なし。profileIdは不要なので通常Auditへ出さない。

## 33. Security Boundary

InputではAdapter Request/Profile/Contextはsecret-free、Resolved AccessはSensitive。OutputではMaterialized RequestだけSensitive、Audit/Issueはsecret-free。

Audit/IssueへAsset ID、URL、Token、Handle、Request/body、Prompt、Story、Lyrics、Scene、Credential、Endpoint、raw error/stackを含めない。Sensitive Resultを通常logger、UI、Analytics、長期DBへ渡さない。

## 34. Logging

許可候補: provider ID、operation、status、required/optional/materialized/omitted count、mode class、profile version、reason code。

禁止: Adapter/Materialized Request、Resolver Result、Asset ID、signed URL、token、handle、prompt/scene/story/lyrics、credential、endpoint。Provider ID自体をrestrictedにするDeploymentではhash/classへ置換する。

## 35. Request Materializer Interface

```ts
type RequestMaterializer<TAdapterRequest, TMaterializedBody> = {
  materializerId: string;
  materializerVersion: string;
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  materialize(input: RequestMaterializationInput<TAdapterRequest>): RequestMaterializationResult<TMaterializedBody>;
};
```

同期・純粋。Network、Storage、Credential、Environmentを参照しない。

## 36. Provider-specific Materializers

Reference Vocal/Music/MVの3 materializerを作る。共通Coreはvalidation/index/expiry/auditだけ。Request抽出とBody構築は各typed moduleに置く。Providerが複数operationを持ってもoperation別handlerを明示登録し、万能materializerへ統合しない。

## 37. Reference Materializer

Foundationで検証する:

- Vocal: assetなし、reference voice、guide melody、lyrics保持
- Music: reference audio、lyricsのみ、optional omission
- MV: required audio、scene image/video/character/location/performer、複数scene
- same ID multiple usageの一意/曖昧case
- 4 access modes、expiry、required failure、proof、redacted Audit、immutability

実Provider bodyを模倣せず、`ReferenceMaterializedAssetValue`を用いる。

## 38. Provider Client Boundary

Clientが確認するのはrequest version、provider/API、operation、body outer schema、proof、assetAccessCount、earliest expiryだけ。Resolved lookup、Asset ID検索、mode変換、omission、Profile解釈、body再構成はしない。

Clientの共通120秒minimumはdefense in depth。MaterializerがProvider Profile minimumを先に強制する。

## 39. Provider Adapter Boundary

Adapterは意味、assetId、required/optionalの上流判断、Scene/timeline/directionを所有する。MaterializerはAccess置換と完全性証明だけ。

現行Ready Requestは変更しない。MV same-ID/multi-usageの曖昧caseだけはV1でfail closedし、実需要が確認された場合にversioned Adapter Requestへusage fieldを追加する。

## 40. Asset Resolver Boundary

利用: assetRef、usage、requirement、access、expiry、metadata、integrity、resolution status。

再実行しない: availability、MIME、checksum、policy、TTL、mode selection。MaterializerはexpiryとProfile mode/lifetimeだけを確認する。Resolver `degraded`の元IssueはWorkflowが保持し、Materializer Auditへraw copyしない。

## 41. Provider Upload Boundary

MaterializerはUploadを行わない。Reference ProfileはContract検証用にprovider-uploadを許可できる。実ProviderではUploader Contractが先にnative handleへ変換する構成を推奨する。

Provider Upload ContractをMaterializer Foundationより先に作る必要はない。Reference fixtureでmode mappingを検証し、実integration前にUploader Contractを設計する。

## 42. Output Ingestion Boundary

MaterializerはProvider outputを扱わない。`providerOutputReferences`の取得、download/import、scan、metadata、NEXCUT Asset ID化はOutput Ingestion / Asset Import Layerの責務。本仕様で設計・実装しない。

## 43. Versioning

管理対象: Materialization Contract、materializer、profile、Adapter Request、Asset Resolution、Materialized Request、Provider API、proof。

Mapping/target placement/mode/required/expiry/proof/API変更は該当versionを更新する。compatible profile追加はminor。型の中立ファイル移動だけではschema versionを上げない。旧job再実行は元Adapter/Profile/API versionをpinする。

## 44. Determinism

純粋・同期・決定的。Date/now/random/UUID、Network、DB、filesystem、env、localStorageは禁止。baselineはContext入力。配列、Issue、Audit、mapping処理順は固定する。Access secretは入力値をそのままcopyする。

## 45. Immutability

Adapter Request、Resolver Result、Access、Profile、Contextを変更しない。毎回新しいbody/request/audit/issuesを返す。定数Profile/Mappingをdeep freezeし、Result/Audit変更を次回へ伝播させない。

## 46. Example Vocal Materialization

```ts
const result = vocalMaterializer.materialize({
  contractVersion: "1.0",
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  operation: "generate-vocal",
  adapterRequest: vocalRequest,
  resolvedAssets,
  profile: referenceVocalMaterializationProfile,
  context: {
    contextVersion: "1.0",
    baselineTime: "2030-01-01T00:00:00.000Z",
    clientMinimumAssetLifetimeSeconds: 120,
  },
});
```

成功bodyはlyrics/performance/timelineを一字も変更せず、`referenceVoiceAssetId`を削除して`referenceVoiceAccess: { mode, value: "[secret]" }`へ置換する。assetなしVocalもproof/count 0でmaterialized可能。

## 47. Example MV Materialization

説明用redaction:

```ts
{
  status: "materialized",
  request: {
    requestVersion: "1.0",
    providerId: "reference-provider",
    providerApiVersion: "reference-api-v1",
    operation: "generate-mv",
    body: {
      audioAccess: { mode: "signed-url", url: "[secret]", expiresAt: "[ephemeral]" },
      scenes: [
        {
          sceneId: "scene-1",
          assetAccesses: [
            { usage: "reference-image", access: { mode: "signed-url", url: "[secret]", expiresAt: "[ephemeral]" } },
            { usage: "character-identity", access: { mode: "provider-native-asset", providerOutputHandle: "[secret]" } }
          ]
        }
      ]
    },
    assetAccessCount: 3,
    earliestAssetExpiry: "[ephemeral]",
    materialization: { status: "complete", unresolvedAssetCount: 0 }
  },
  audit: {
    status: "materialized",
    requiredReferenceCount: 1,
    optionalReferenceCount: 2,
    materializedCount: 3,
    omittedCount: 0,
    accessModes: ["signed-url", "provider-native-asset"],
    reasonCodes: [],
    profileVersion: "1.0"
  }
}
```

実出力に元`audioAssetId`/`assetIds`を残さない。Auditにscene内容やsecretを含めない。

## 48. Edge Cases

- input null/array、version/provider/API/operation mismatch
- Resolver failed/policy-blocked/degraded
- required missing、optional omitted、duplicate resolved key
- same asset multiple usage、usage/kind/requirement mismatch
- unsupported mode、expired/short/missing/invalid expiry
- provider-native expiryなし、internal stream、provider upload
- source missing/wrong cardinality/empty array/maximum超過
- target conflict、extra/unused Resolved Asset
- assetId source slot残留、optional field deletion
- multiple scene assets、MV usage ambiguity
- proof/count/earliest mismatch
- mutation、secret scan、Audit redaction

Extra Resolved Assetはbodyへ勝手に追加せず、通常は無視してAudit countにも含めない。Profile coverage外のknown source slotはfailed。

## 49. MVP Implementation Plan

候補:

```text
lib/materializers/types.ts
lib/materializers/materializerUtils.ts
lib/materializers/referenceProfiles.ts
lib/materializers/referenceVocalMaterializer.ts
lib/materializers/referenceMusicMaterializer.ts
lib/materializers/referenceMVMaterializer.ts
lib/materializers/materializerRegistry.ts
```

順序: 公開型 → pure common validation/index/expiry → frozen profiles → Vocal/Music → MV → Registry。実HTTP、Upload、Output Ingestionは追加しない。

## 50. Test Matrix

### Input / Resolution

valid/null/undefined/array/version/provider/API/operation、resolved/degraded/failed/policy-blocked、required missing、optional omission、duplicate、usage/kind/requirement mismatch。

### Access / Expiry

signed-url/provider-upload/provider-native/internal-stream/unsupported、valid/exact minimum/below/expired/missing/invalid UTC、earliest計算、count 0。

### Vocal / Music / MV

Vocal assetなし/reference voice/guide melody/lyrics保持、Music reference audio/lyrics only/omission、MV audio/images/character/location/performer/video omission/multi-scene/same ID multi-usage ambiguity。

### Proof / Security

complete/unresolved zero/count/earliest/provider/API/operation、materialized execution slotにassetIdなし、Audit/Issueにsecret/body/URL/token/handleなし、runtime brandなし。

### Determinism / Regression

same JSON、input immutable、Result/Audit mutation isolation、Profile freeze、mapping order。Vocal/Music/MV Adapter Request、Asset Resolver Result、Provider Client validation、既存Registry不変。

最低200 assertionをReference Foundationで実行し、TypeScript、production build、diff checkを通す。

## 51. Future Extensions

実Provider profiles、Provider Upload Materializer、encrypted handle cache、Materializer schema generator、compile-time slot coverage、Output Ingestion Contract、restricted logger guardを追加可能。汎用recursive replacement engineは追加しない。

## 52. Open Questions

1. MV scene `assetIds`へusageを保持するversioned Request V2が必要か。
2. Provider-native handleのexpiryなし許可をProfileのどのfieldで表すか。
3. `provider-upload`を直接受け取るGeneration Clientが実在するか。
4. profileIdをrestricted Operationsへ表示する必要があるか。
5. Accessを含むMaterialized Body DTO自体をProvider Client moduleとMaterializer moduleのどちらが所有するか。
6. Output referenceからAsset Importまでのrestricted identifier Contract。

Reference MaterializerからFoundationを開始できる。Provider Upload Contractは実Provider integration前まで延期可能で、先に作る必要はない。

## 53. Materializer Contract Foundation Boundary

Materializer Contract Foundation V1の実装境界は次の3ファイルだけである。

```text
lib/materializers/types.ts
tests/materializers/materializerTypesContractBoundary.test.ts
docs/REQUEST_MATERIALIZER_CONTRACT_V1.md
```

`types.ts`はMaterializerのpublic type ownerである。Input、Context、Profile、Mapping、Result、Issue、Audit、Materialized Body、Descriptor、Materializer interfaceを所有する。全依存はtype-onlyであり、runtime value、module initialization、mutable state、Node API、Network、Filesystem、Environment、Loggingを所有しない。

公開object contractはreadonlyを基本とする。成功と失敗は`status`で識別するdiscriminated unionとし、失敗Issue collectionもreadonlyとする。Schema versionはInputとContextで`1.0`、Profile versionは`1.0`、Reference Materializer versionは`reference-v1`へ固定する。変更時は互換性を監査し、必要なら新しいversioned contractを追加する。

Runtime implementation、common validation、asset index、expiry calculation、Reference Profile、Vocal/Music/MV Materializer、RegistryはこのFoundationに含めない。Runtimeは本Contractを利用する側であり、ContractからRuntimeをimportしてはならない。RegistryはDescriptorを利用するが、lookup、availability、registration policyをContractへ持ち込んではならない。

Provider Client、Workflow、Provider Upload、Output Ingestion、HTTP、Credential resolution、transport、retry、poll、persistenceも非所有である。`Sensitive`は既存Asset Contractからtype-only compatibility exportするだけで、credential値やsecret storageを定義しない。

Foundation validationはtype-only boundary test、通常のrepository compiler optionsを使うScoped TypeScript、exact three-file snapshot dependency auditで構成する。Runtime testはReference Materializer Runtime Foundationで実行する。

Status: Materializer Contract Foundation V1 implementation candidate complete. Commit readinessは上記validationがすべて成功した場合だけ成立する。
