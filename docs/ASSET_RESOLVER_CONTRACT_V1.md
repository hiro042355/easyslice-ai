# Asset Resolver Contract Specification V1

## 1. Purpose

Asset Resolverは、Provider-neutral Requestが持つNEXCUT内部`assetId`を、Provider Clientが実行時に利用できる短命で安全なAccessへ解決する境界である。

```text
Provider-neutral Request
  └ assetId
↓
Asset Resolution Plan
↓
Asset Resolution Execution
↓
Resolved Asset Access
  ├ signed URL
  ├ internal stream token
  └ provider upload source / handle
↓
Request Materializer
↓
Provider Client
```

ResolverはDirector Logic、Scene Logic、Provider選択、Request Mapping、Prompt、媒体内容の変更を行わない。

## 2. Design Philosophy

### Asset ID First

Adapterと永続Contractは`assetId`だけを扱う。URL、Bucket、Object Keyを逆流させない。

### Secret Isolation

Signed URL、Stream Token、Upload Token、Credentialは実行時だけ存在し、通常ログ・Audit・UI・永続Planへ含めない。

### Least Privilege

Provider-neutral Requestで実際に参照されたAssetだけを解決する。未使用Assetを追加しない。

### Short-Lived Access

外部Accessは用途と媒体に応じた短いTTLを持つ。無期限URLを作らない。

### Provider Independent Core

Resolver Coreは実在Storage SDK、Provider Upload API、Provider URL構文を知らない。

### Deterministic Plan, Ephemeral Execution

Resolution Planは純粋で決定的。Signed URL文字列、expiry、Storage状態、Upload Handleは非決定的なExecution Resultとして分離する。

### Fail Closed

required Assetを安全に解決できない場合、Provider RequestをMaterializeしない。

## 3. Scope

V1が定義する:

- AssetReferenceと内部AssetRecordの境界
- Required / Optional / Usage
- Secret-free Resolution Plan
- 非同期Resolution Execution
- Storage Client / Provider Uploader / Materializer境界
- MIME、Integrity、Metadata、Policy検証
- Transfer Mode、TTL、Caching
- Status、Issue、Error、Audit、Security
- Reference Store / Mock ResolverによるMVP計画

## 4. Non-Goals

- Storage接続、Signed URL生成、Provider Upload実装
- Provider Client、実在Provider Adapter、Selection Engine
- Director / Scene / Prompt Logic
- Transcode、Resize、Crop、Normalize
- Virus Scan、Content Safety Model、法務判断
- Job Queue、Review UI、Export Storage移行
- Credential管理実装

## 5. Architecture Position

```text
Director Decision
↓
Provider Adapter
↓ Provider-neutral Request with assetId
Asset Resolution Orchestrator
├─ Resolution Plan Builder
├─ Asset Resolver Executor
├─ Storage Client
└─ Provider Asset Uploader（必要時）
↓ Resolved Asset Map
Request Materializer
↓ Secret-bearing Executable Request
Provider Client
↓
External Provider
```

Asset Resolution OrchestratorはWorkflow Jobの一段階であり、Provider AdapterのBuild Resultを変更しない。

## 6. Responsibilities

Resolver Core:

- 入力、Asset Record、Policy、Metadata、Integrityの検証
- Access Method、TTL class、required metadataの決定
- Secret-free Resolution Plan生成
- Execution ResultとErrorの安全な正規化

担当しない:

- Asset意味、required性、Usageの推測
- Provider選択、Provider Request設計
- Media内容変更、Provider HTTP送信
- Retry Job管理、Human Review判断

## 7. Resolver / Storage Client / Provider Uploader Boundary

```text
Resolver Core
= pure validation + plan + normalized result

Storage Client
= record/metadata lookup + existence + signed access + stream

Provider Asset Uploader
= provider-specific upload + multipart + handle lifecycle

Workflow Orchestrator
= retry + timeout budget + cancellation + progress + cleanup policy
```

ResolverとUploaderは分離する。Resolver Planは`nexcut-upload`を選べるが、Provider固有Uploadを自分で実行しない。

## 8. AssetReference

V1は[MV共有Contract](../lib/mvContracts.ts)の既存型を正とし、本仕様で再定義しない。

```ts
type AssetReference = {
  assetId: string;
  kind: AssetKind;
  mimeType?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  checksum?: string;
};
```

Storage Key、URL、Bucket、Regionを追加しない。将来全ドメインで利用範囲が広がれば`lib/contracts/assets.ts`へ移し、`mvContracts.ts`と`providers/types.ts`からre-exportする。型移動だけではschemaを変更しない。

## 9. AssetRecord

AssetRecordは内部Storage / Metadata層のRecordであり、Adapterへ返さない。

```ts
type AssetRecord = {
  schemaVersion: "1.0";
  assetId: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  metadata: AssetMetadata;
  storageLocator: InternalStorageLocator;
  status: AssetAvailabilityStatus;
  region?: string;
  retentionClass?: AssetRetentionClass;
  integrityState: "verified" | "unverified" | "failed";
};
```

`createdBy`、user ID、owner情報はAuthorization Record側に置き、Resolution Resultへ出さない。CredentialをRecordへ直接保存しない。

## 10. Internal Storage Locator

推奨V1:

```ts
type InternalStorageLocator = {
  locatorVersion: "1.0";
  locatorId: string;
};
```

`locatorId`はStorage Clientだけが解決できるopaque IDとする。Storage Provider、Bucket、Object Keyは暗号化されたStorage Locator StoreまたはStorage Client設定に保持する。

代替内部表現としてproviderRef / bucketRef / objectKeyを持てるが、Resolver Result、Error、Audit、Adapterへ絶対に返さない。

## 11. Asset Availability

```ts
type AssetAvailabilityStatus =
  | "available"
  | "processing"
  | "pending-scan"
  | "quarantined"
  | "blocked"
  | "corrupted"
  | "deleted"
  | "expired"
  | "missing";
```

| Status | Required | Optional |
|---|---|---|
| available | 続行 | 続行 |
| processing / pending-scan | unavailable。Workflowが後でretry可能 | omissionまたはretry |
| quarantined / blocked | policy-blocked | omissionせずIssue返却。Workflow判断 |
| corrupted | failed | omitted + integrity Issue |
| deleted / expired / missing | failed | omitted |

Resolverはquarantineを解除しない。

## 12. Resolution Input

```ts
type AssetResolutionInput = {
  contractVersion: "1.0";
  items: readonly AssetResolutionRequestItem[];
  purpose: AssetResolutionPurpose;
  accessRequirements: AssetAccessRequirements;
  policyContext: AssetPolicyContext;
};
```

`items`はAdapter Requestから抽出した必要Assetだけ。Story、Lyrics、Theme、Prompt、DirectorDecision、Scene Plan全体を渡さない。

## 13. Resolution Purpose

```ts
type AssetResolutionPurpose =
  | "vocal-generation"
  | "music-generation"
  | "mv-generation"
  | "provider-upload"
  | "preview"
  | "export";
```

PurposeはProvider IDではない。PolicyがTTL上限、外部転送、許可Access Modeを決めるための用途分類である。

## 14. Access Requirements

```ts
type ProviderAssetTransferMode =
  | "provider-fetch"
  | "nexcut-upload"
  | "provider-native-asset"
  | "internal-stream";

type AssetAccessRequirements = {
  preferredMode: ProviderAssetTransferMode;
  allowedModes?: readonly ProviderAssetTransferMode[];
  requiredMimeTypes?: readonly string[];
  maxSizeBytes?: number;
  requireChecksum?: boolean;
  requireDurationMetadata?: boolean;
  requireDimensions?: boolean;
  requestedTtlSeconds?: number;
};
```

V1はmedia bytesの`inline-bytes`を許可しない。小さなmetadataは通常のtyped metadataとして返し、Base64 mediaをContractへ入れない。

## 15. Policy Context

```ts
type AssetSensitivityClass = "standard" | "personal" | "voice" | "child-related" | "sensitive";
type AssetRetentionClass = "ephemeral" | "project" | "export" | "legal-hold";

type AssetPolicyContext = {
  policyVersion: string;
  sourceRegion?: string;
  destinationRegion?: string;
  dataResidencyClass?: string;
  sensitivityClass?: AssetSensitivityClass;
  retentionClass?: AssetRetentionClass;
  externalTransferAllowed: boolean;
  providerTrainingAllowed?: boolean;
  deletionPending?: boolean;
};
```

Workflow / Security Layerが決定した結果だけを受け取る。Raw user profile、Billing、Credential、Prompt、Planを含めない。

## 16. Required and Optional Assets

```ts
type AssetUsage =
  | "audio-conditioning"
  | "reference-image"
  | "reference-video"
  | "character-identity"
  | "location-reference"
  | "guide-vocal"
  | "guide-melody"
  | "lyrics-input"
  | "preview-source"
  | "export-source";

type AssetResolutionRequestItem = {
  assetRef: AssetReference;
  requirement: "required" | "optional";
  usage: AssetUsage;
};
```

Adapter / Workflowがrequired性とUsageを決める。Scene Asset Roleから導出する場合もAdapterが明示化する。ResolverはAssetの意味を推測・昇格・降格しない。

## 17. Resolution Plan

```ts
type AssetResolutionPlan = {
  planVersion: "1.0";
  resolverVersion: "rule-v1";
  purpose: AssetResolutionPurpose;
  items: AssetResolutionPlanItem[];
  warnings: AssetResolutionWarning[];
};

type AssetResolutionPlanItem = {
  assetRef: AssetReference;
  requirement: "required" | "optional";
  usage: AssetUsage;
  transferMode: ProviderAssetTransferMode;
  ttlClass: AssetTtlClass;
  ttlSeconds: number;
  requiredMetadata: readonly AssetMetadataRequirement[];
  requireChecksum: boolean;
};
```

PlanはassetIdを含む実行用ContractだがSecretを含まない。通常AuditへPlan全体を保存せず、redacted summaryだけを保存する。

## 18. Resolution Plan Builder

```ts
type AssetResolutionPlanResult =
  | { status: "planned"; plan: AssetResolutionPlan; issues: AssetResolutionIssue[] }
  | { status: "invalid"; issues: AssetResolutionIssue[] };

function buildAssetResolutionPlan(
  input: AssetResolutionInput,
): AssetResolutionPlanResult;
```

純粋・同期・決定的。固定順でversion、duplicate、AssetReference、required/usage、Policy、Access Mode、TTL、metadata requirementを検証する。StorageやNetworkを参照しない。

同じAssetを複数Usageで使うことは許可し、同一`assetId + usage`重複だけを統合する。requiredが混在する場合requiredを採用し、固定Warningを残す。

## 19. Resolution Executor

```ts
type AssetResolutionExecutor = {
  execute(
    plan: AssetResolutionPlan,
    context: AssetResolutionExecutionContext,
  ): Promise<AssetResolutionExecutionResult>;
};
```

非同期で外部状態に依存する。Asset Record lookup、existence、metadata / integrity、signed access、upload sourceを処理する。Provider Upload API自体は専用Uploaderへ委譲する。

## 20. Resolver Interface

Plan BuilderとExecutorを別Interfaceへ分ける案をV1の正とする。

```ts
type AssetResolutionPlanBuilder = {
  build(input: AssetResolutionInput): AssetResolutionPlanResult;
};

type AssetResolutionExecutor = {
  execute(
    plan: AssetResolutionPlan,
    context: AssetResolutionExecutionContext,
  ): Promise<AssetResolutionExecutionResult>;
};
```

単一`AssetResolver` facadeはWorkflow convenienceとして両者をcomposeできるが、Core境界は混ぜない。

## 21. Resolved Asset

```ts
type ResolvedAsset = {
  assetRef: AssetReference;
  usage: AssetUsage;
  requirement: "required" | "optional";
  access: ResolvedAssetAccess;
  sizeBytes: number;
  metadata: ResolvedAssetMetadata;
  integrity: ResolvedAssetIntegrity;
};

type ResolvedAssetAccess =
  | { mode: "signed-url"; url: string; expiresAt: string }
  | { mode: "internal-stream"; streamToken: string; expiresAt: string }
  | { mode: "provider-upload"; uploadSourceToken: string; expiresAt: string }
  | { mode: "provider-native-asset"; handle: string; expiresAt?: string };
```

Access値はSecret。Resultを通常ログや長期DBへ保存しない。`expiresAt`はExecution時刻依存でありPlan決定性の対象外。

## 22. Secret-bearing Results

```ts
declare const sensitiveBrand: unique symbol;
type Sensitive<T> = T & { readonly [sensitiveBrand]: true };

type AssetResolutionExecutionResult = Sensitive<
  | { status: "resolved"; assets: ResolvedAsset[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit }
  | { status: "degraded"; assets: ResolvedAsset[]; issues: AssetResolutionIssue[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit }
  | { status: "policy-blocked" | "failed"; issues: AssetResolutionIssue[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit }
>;
```

Brandは誤用防止のcompile-time markerで、JSON stringifyを完全には防げない。LoggerはSensitive値を拒否または`[redacted]`へ置換する。Resultは同一Workflow executionのmemory内だけで保持し、Queue越しに渡す場合は暗号化された短命payloadを使う。

## 23. MIME Validation

検証順:

1. AssetReference hint
2. AssetRecord canonical MIME
3. Storage object Content-Type
4. Magic Number / Header sniff
5. Access Requirements / Provider requirement

Record、header、magicが矛盾したら`mime-type-mismatch`でfail closed。`application/octet-stream`は明示許可がなければ外部転送不可。MIME spoofingを防ぐため拡張子を正としない。

Virus Scan / Content Inspectionは別Security Scannerがstatusを`available`へ進める責務。Resolverはscan結果を解釈せずstatusを守る。

## 24. Integrity

```ts
type ResolvedAssetIntegrity = {
  checksumVerified: boolean;
  checksumAlgorithm?: "sha256";
  sizeVerified: boolean;
};
```

`sizeBytes`は`AssetRecord.sizeBytes`を正とする検証済みcanonical sizeであり、inspectionのactual sizeとの一致後だけ投影する。`AssetReference`はsizeを所有せず、Upload、Materializer、Provider Client等の下流はこの値を再推測しない。Raw byte値は通常Auditへ含めない。

V1:

- sizeBytesは全Asset Recordで必須
- 外部転送はStorage integrity verifiedを必須
- `requireChecksum=true`ならSHA-256 checksum必須
- checksum不一致、partial upload、corrupted statusはrequired失敗
- checksum未登録で要求なしなら続行可能だがauditへverified=false
- Provider upload直前にもsize / integrity stateを再確認

ETagはmultipart等でcontent hashとは限らないためchecksumの代用にしない。

## 25. Metadata Validation

内部metadata union。Foundation V1の`AssetKind`には`text`が存在しないため、V1の公開unionは到達可能なaudio / video / imageだけを持つ。Lyricsは現在typed workflow inputであり、AssetReferenceではない。Text Assetを導入する際は`AssetKind`とAssetReference schemaのversioned変更として再検討する。

```ts
type AssetMetadata =
  | { type: "audio"; durationSeconds?: number; sampleRateHz?: number; channels?: number; codec?: string }
  | { type: "video"; durationSeconds?: number; width?: number; height?: number; frameRate?: number; codec?: string }
  | { type: "image"; width?: number; height?: number; orientation?: number; hasAlpha?: boolean };
```

全metadataをAssetReferenceへ追加しない。Plan ItemのrequiredMetadataに応じて不足をIssue化する。Raw EXIF、filename、user metadataはResult / Auditへ含めない。

## 26. Duration Metadata

- Vocal / Musicの意味上の正はGeneration Constraints
- MVの正はScene Plan duration
- ResolverはWorkflow durationを再判断しない
- ResolverはAsset Record durationの存在・有限・正数・Reference hintとの整合だけを検証
- Reference hintとの差は`max(0.25秒, recordDuration × 0.005)`をV1既定とする
- 意味上の作品duration比較はAdapter / Workflowに残す

Adapter検証済みでもStorage Record改ざん・更新検出のためResolverで再検証する。duration欠落はItemが要求する場合だけfail。

## 27. Dimensions and Aspect Ratio

Resolverはwidth / heightの存在、正数、Record / actual header整合を検証して返す。Scene Plan aspectやProvider min/maxとの意味比較はAdapter / Media Preparation側。

Resolverはcrop、resize、letterbox、rotationを行わない。orientation metadataは正規化せず返し、必要ならPreparation Planを要求する。

## 28. Media Preparation Boundary

```text
Asset Resolver
= 既存Assetを変更せず安全に解決

Media Preparation
= transcode / resize / crop / compress / normalize / proxy / frame抽出 / metadata strip
```

派生媒体は新しい`assetId`、新しいAssetRecord、元Asset lineageを持つ。Resolverが暗黙にbytesを変更したり同じassetIdへ上書きしない。Preparationが必要なら`media-preparation-required` IssueをWorkflowへ返す。

## 29. Provider Upload Boundary

```text
Provider-neutral Request
↓
Resolution Plan: transferMode = nexcut-upload
↓
Provider Asset Uploader
↓ provider-native handle
Resolved Asset Map
↓
Request Materializer
```

Provider固有HandleをProvider-neutral Adapter Requestへ戻さない。HandleはSecret-bearing execution dataとしてMaterializer / Clientだけが利用する。

## 30. Transfer Modes

```ts
type ProviderAssetTransferMode =
  | "provider-fetch"
  | "nexcut-upload"
  | "provider-native-asset"
  | "internal-stream";
```

- provider-fetch: Providerが短命HTTPS URLを取得
- nexcut-upload: NEXCUTがProvider Uploaderへstream
- provider-native-asset: 有効な既存Handleを再利用
- internal-stream: Client / Uploaderだけが短命tokenで読む

選択順はPolicyとallowed modesから固定。Provider CapabilityはWorkflowがAccess Requirementsへ翻訳し、Resolver CoreへProvider IDを渡さない。

## 31. Signed URL

V1要件:

- HTTPS only
- read-only GET。Upload URLは別Contract
- object path / user filenameをURL pathへ露出しないopaque pathを優先
- queryをログ・analytics・refererへ送らない
- redirect禁止または同一trust boundaryだけ
- content type / lengthをrecordと照合
- clock skew 60秒を考慮
- expiry後は新しいexecutionで再生成
- public bucket URLを使わない
- allowed originはProvider fetchでは保証できないため、TTL / one-time policyを主防御とする

## 32. TTL

```ts
type AssetTtlClass = "image-short" | "audio-standard" | "video-long" | "stream-short";
```

V1既定:

```text
Image signed fetch  600秒（10分）
Audio signed fetch  1200秒（20分）
Video signed fetch  1800秒（30分）
Internal stream     300秒（5分）
Absolute maximum    3600秒（60分）
```

requested TTLは用途default以下なら採用、超過ならdefaultまたはPolicy上限へclampし`signed-url-ttl-adjusted` Warning。Provider uploadの予測時間が足りなければWorkflowが新しいPlan / Executionを要求し、長寿命URLで回避しない。

## 33. Caching

- Signed URL: 長期cache禁止。single execution内だけ再利用
- Metadata / availability: assetId + AssetRecord versionで短期cache可能
- Provider Handle: provider adapter version + API version + asset checksum + region + usageでcache可能
- Secret handle cacheは暗号化、expiry必須
- Asset deletion / replacement / checksum change / retention expiryでinvalidate
- Credential rotationでsigned access cacheを破棄
- Capability / Policy version変更でPlan cacheをinvalidate

## 34. Resolution Status

Adapter statusと混同しないため専用語を使う。

```ts
type AssetResolutionStatus =
  | "resolved"
  | "degraded"
  | "policy-blocked"
  | "failed";
```

- resolved: 全Item解決
- degraded: required全解決、optionalのみ省略
- policy-blocked: transfer policyが拒否
- failed: required unavailable / integrity / execution error

`ready`、`unsupported`、`invalid`はAdapter statusに限定する。

## 35. Issue and Reason Codes

固定順:

```ts
type AssetResolutionReasonCode =
  | "asset-record-version-unsupported"
  | "asset-not-found"
  | "asset-not-available"
  | "asset-processing"
  | "asset-quarantined"
  | "asset-blocked"
  | "asset-deleted"
  | "asset-expired"
  | "asset-corrupted"
  | "asset-integrity-unverified"
  | "asset-kind-mismatch"
  | "mime-type-mismatch"
  | "asset-size-exceeded"
  | "checksum-mismatch"
  | "metadata-missing"
  | "duration-metadata-missing"
  | "dimensions-metadata-missing"
  | "external-transfer-blocked"
  | "region-policy-blocked"
  | "retention-expired"
  | "access-mode-unsupported"
  | "provider-upload-required"
  | "media-preparation-required"
  | "signed-url-generation-failed"
  | "signed-url-ttl-adjusted"
  | "optional-asset-omitted"
  | "required-asset-unresolved";
```

IssueはAsset ID、Locator、Raw Errorを含めず、item index / usage / kindで対象を示す。

## 36. Required Asset Failure

required Assetが1件でも未解決ならExecution statusは`failed`または`policy-blocked`。Resolved Assetの一部をProvider Clientへ渡さない。Materializerはrequired全件の存在を再確認する。

ResolverはHuman Reviewを決めない。WorkflowはIssue Codeを受け、retry、Asset差替え、Policy確認、処理停止を決める。

## 37. Optional Asset Omission

optionalだけが失敗した場合:

- status degraded
- 解決済みrequired / optional Assetを返す
- `optional-asset-omitted`と元原因Code
- Provider Client接続可否はWorkflow Policy
- Reference表現が変わるため通常は再Review候補だが、Resolver自身はreviewRequiredを持たない

## 38. Error Contract

```ts
type AssetResolutionErrorCategory =
  | "not-found"
  | "unavailable"
  | "policy-blocked"
  | "integrity-failed"
  | "metadata-invalid"
  | "storage-authentication"
  | "storage-rate-limit"
  | "storage-timeout"
  | "storage-unavailable"
  | "signed-access-failed"
  | "cancelled"
  | "unknown";

type NormalizedAssetResolutionError = {
  category: AssetResolutionErrorCategory;
  message: string;
  retryable: boolean;
};
```

Retryable: processing、storage-rate-limit、storage-timeout、storage-unavailable、限定的signed-access-failed。

Non-retryable: not-found、policy-blocked、integrity、metadata、authentication、cancelled、unknown。Raw Storage Error、Stack、Bucket、Object Key、URL、Codeを返さない。

## 39. Async Boundary

同期:

- Input / Plan validation
- required / optional、Usage、Access Mode、TTL、Policy判定

非同期:

- Asset Record / metadata取得
- existence / status / integrity確認
- signed access生成
- Provider handle lookup / upload

Workflow OrchestratorがJob state、progress、concurrency、deadline、retry、cleanupを所有する。ExecutorはAbortSignalとper-call deadlineを受ける。

## 40. Retry and Timeout Boundary

- ResolverはErrorをretryable分類するが自動loopしない
- Workflowが最大回数、exponential backoff、jitter、全体deadlineを決める
- Metadata lookupとSigned URLは短いtimeout
- Large uploadはUploader固有timeout / multipart policy
- integrity / policy / missingはretryしない
- expiryは同じURLをretryせず新しいexecutionで再発行

## 41. Cancellation and Cleanup

- AbortSignalをStorage Client / Uploaderへ伝播
- Signed URLはserver-side revoke不能でもTTLで失効
- 未完multipart uploadをUploaderがabort
- temporary stream / encrypted payloadを破棄
- Provider upload完了後にWorkflow取消ならProvider deletion policyへcleanup request
- Cleanup失敗をSecretなしのOperations Issueとして残す
- Asset本体をResolverが勝手に削除しない

## 42. Human Review Boundary

ResolverはReview UIや`reviewRequired`を持たない。Workflowへ次を返す。

- optional omission
- policy fallback / changed transfer mode
- media preparation required
- metadata incomplete
- provider upload required
- external transfer policy change

Workflow PolicyがReview要否を決める。required failureはReviewへ進める前にexecutionを停止する。

## 43. Determinism

Deterministic:

- Resolution Plan、Item順、duplicate処理
- required / optional、Usage、Access Mode fallback
- TTL class / clamp、metadata / integrity requirement
- Policy判断、Issue / Warning順

Non-deterministic:

- Signed URL、expiresAt、Storage status
- Network Error、Provider Handle、execution timestamp

Plan Builderは時刻、乱数、Network、DB、Environmentを参照せず入力を変更しない。Executorは非決定性をResult境界へ明示する。

## 44. Versioning

管理対象:

- Resolution Input contractVersion
- AssetRecord schemaVersion
- Resolution Plan version / resolverVersion
- Metadata schema version
- Policy version
- Storage Client version
- Provider Upload Adapter version
- Materializer version

AssetReferenceへversion fieldはV1で追加せず、外側Input / Record versionで管理する。既存Adapter Requestを変更しない。Access mode、TTL、Policy、Plan shape変更時はResolver versionを更新する。

## 45. Provider Client Boundary

Provider Clientへ渡す:

- Secret-bearing Executable Provider Request
- Provider Credential handle
- timeout / retry execution policy
- Provider-native Asset Handle

渡さない:

- AssetRecord、Storage Locator、Internal DB Record
- Workflow Approval、Story / Lyrics、DirectorDecision
- Resolver rationale、Raw Policy、Raw Storage Error

Adapter RequestはassetIdのまま維持し、Signed URLをAdapterへ戻さない。

## 46. Request Materializer

```text
Provider-neutral Request with assetId
+ Resolved Asset Map
↓
Provider Request Materializer
↓
Sensitive<ExecutableProviderRequest>
```

責務:

- assetIdをsigned URL / stream / provider handleへ置換
- required Asset完全性を再確認
- Provider固有実行fieldへ配置
- Secret-bearing Requestを生成しログ禁止にする

Materializerは実在Provider integration packageが所有し、Adapter Coreにも汎用Provider Clientにも混入させない。永続Request shapeを変更せず、実行時copyを作る。

## 47. Security and Privacy

Secret:

- Signed URL / query
- Stream / Upload Token
- Provider Handle（推測可能性に応じSecret扱い）
- Storage Locator、Credential、Encryption Key

技術境界:

- server-side only
- least privilege / read-only
- short TTL
- memory lifetime最小化
- encrypted queue payload
- redacting logger
- Error / Audit / UIへ非表示
- raw filename / EXIF / user metadataを外部転送しない

## 48. Data Residency

- source / destination region pinning
- cross-region禁止時はpolicy-blocked
- External Provider regionとresidency classをWorkflowが事前決定
- Personal voice / image、child-related、sensitive媒体は厳格Policy
- provider training opt-outはPolicy結果としてAccess Requirementsへ反映
- temporary provider uploadのretention / deletion requestをWorkflowが管理
- legal holdとdeletion pendingを尊重し、新規外部転送を禁止可能

Resolverは法務判断をせずPolicy Contextを強制する。

## 49. Logging and Audit

禁止:

- Asset ID、Signed URL、query、Token
- Storage Key、Bucket、Locator
- Credential、Raw metadata、filename、EXIF
- Raw Error Message / Stack

許可するredacted Audit:

```ts
type AssetResolutionAudit = {
  requiredCount: number;
  optionalCount: number;
  resolvedCount: number;
  omittedCount: number;
  kinds: readonly AssetKind[];
  usages: readonly AssetUsage[];
  transferModes: readonly ProviderAssetTransferMode[];
  ttlClasses: readonly AssetTtlClass[];
  metadataComplete: boolean;
  checksumVerified: boolean;
  status: AssetResolutionStatus;
  reasonCodes: AssetResolutionReasonCode[];
};
```

Audit配列は固定順・重複なし。Sensitive Execution Result全体を通常ログへ渡さない。

Countはduplicate統合後のPlan Item数を基準とし、同じAssetでもUsageが異なるItemは別件として数える。required失敗のall-or-nothingでは`resolvedCount=0`、`omittedCount=Plan Item総数`とする。

## 50. Advanced Preview and Operations

表示可能:

- Resolution status
- Asset kind、required / optional、Usage
- Transfer mode、TTL class
- metadata completeness、checksum verified
- fixed Reason Code

表示禁止:

- assetId、URL、Token、Storage Key / Bucket
- Provider Handle、filename、user metadata
- Raw Error / Credential

通常Creator UIには表示せず、Operationsもredacted summaryだけを使う。

## 51. Example Plan

```ts
const result = buildAssetResolutionPlan({
  contractVersion: "1.0",
  items: [
    {
      assetRef: audioAsset,
      requirement: "required",
      usage: "audio-conditioning",
    },
    {
      assetRef: referenceImage,
      requirement: "optional",
      usage: "reference-image",
    },
  ],
  purpose: "mv-generation",
  accessRequirements: {
    preferredMode: "provider-fetch",
    requestedTtlSeconds: 900,
    requireChecksum: true,
  },
  policyContext: {
    policyVersion: "policy-v1",
    externalTransferAllowed: true,
  },
});

// Secret-free deterministic result
{
  status: "planned",
  plan: {
    planVersion: "1.0",
    resolverVersion: "rule-v1",
    purpose: "mv-generation",
    items: [
      {
        assetRef: audioAsset,
        requirement: "required",
        usage: "audio-conditioning",
        transferMode: "provider-fetch",
        ttlClass: "audio-standard",
        ttlSeconds: 900,
        requiredMetadata: ["duration"],
        requireChecksum: true,
      },
    ],
    warnings: [],
  },
  issues: [],
}
```

実在Storage / Provider名を使用しない。

## 52. Example Execution Result

説明用にSecretをredactする。実際のResultは`Sensitive<T>`で、通常ログへ渡さない。

```ts
{
  status: "resolved",
  assets: [
    {
      assetRef: { assetId: "[redacted]", kind: "audio" },
      usage: "audio-conditioning",
      requirement: "required",
      access: {
        mode: "signed-url",
        url: "[secret]",
        expiresAt: "[ephemeral]",
      },
      metadata: { durationPresent: true },
      integrity: {
        checksumVerified: true,
        checksumAlgorithm: "sha256",
        sizeVerified: true,
      },
    },
  ],
  warnings: [],
  audit: {
    requiredCount: 1,
    optionalCount: 1,
    resolvedCount: 2,
    omittedCount: 0,
    status: "resolved",
    reasonCodes: [],
  },
}
```

## 53. Edge Cases

| Case | V1 handling |
|---|---|
| Itemなし | invalid Plan Input |
| required missing / deleted / expired | failed |
| optional missing | degraded omission |
| processing / pending scan | retryable unavailable |
| quarantined / blocked | policy-blocked |
| corrupted / checksum mismatch | integrity failed |
| MIME / magic mismatch | failed |
| metadata不足 | requiredならfailed、optionalならdegraded |
| Size超過 | required failed / optional omitted |
| TTL超過要求 | fixed clamp warning |
| external transfer禁止 / region mismatch | policy-blocked |
| Provider fetch非対応 | allowedならnexcut-upload fallback |
| Provider upload必須 | Uploaderへ委譲 |
| Signed URL発行失敗 | normalized retryable classification |
| URL expiry | 再execution。古いURL再利用禁止 |
| Duplicate item | assetId+usageで統合 |
| Same Asset multiple usage | usage別itemを保持 |
| Handle cache hit / expired | 有効性検証後利用 / 再upload |
| Storage timeout / rate limit | retryable Error |
| Cancellation | cleanup後cancelled |
| Large Video | stream / multipart。memory load禁止 |
| Personal Voice / Child / Sensitive | Policy Contextに従いblock可能 |
| Deletion request / deletion pending | 新規transfer禁止 |

## 54. MVP Implementation Plan

候補:

```text
lib/assets/types.ts
lib/assets/assetResolutionPlan.ts
lib/assets/assetResolver.ts
lib/assets/assetResolverUtils.ts
```

後続・必要時:

```text
lib/assets/storageClient.ts
lib/assets/providerAssetUploader.ts
lib/assets/requestMaterializer.ts
```

推奨順:

1. 型、pure Plan Builder、redacted Audit
2. Reference Asset Store / Mock Storage Client
3. Mock Executor、required/optional/policy/integrity Matrix
4. Mock MaterializerでAdapter Request不変を検証
5. 実Storage Client Contract
6. Provider Client Contract

最初はReference Resolverから始め、実在Storageへ接続しない。

## 55. Test Matrix

次回、既存基盤がなければ残らないNode + TypeScriptで最低120 assertionsを行う。

| Group | Cases |
|---|---|
| Plan Builder | required、optional、duplicate、usage、mode、TTL、region、policy、determinism、immutability |
| Asset Record | available、processing、pending scan、quarantined、blocked、deleted、expired、missing、corrupted、version |
| Metadata | MIME、magic、size、duration、dimensions、checksum、missing / mismatch |
| Policy | external allowed / blocked、region、sensitivity、retention、deletion pending |
| Execution | signed URL、upload、stream、native handle、timeout、rate limit、unavailable、cancel、partial |
| Required | 1件失敗で全体failed、partialをClientへ渡さない |
| Optional | omission、degraded、fixed Issue順 |
| Security | URL / Token / Locator / Raw Error / Asset IDがAuditにない、Story / Lyrics / Prompt / Credentialなし |
| Mutation | Input、Plan、Execution、metadata、cache、returned objectの非共有 |
| Regression | Vocal / Music / MV Adapter Request不変、AssetReference import互換 |

## 56. Future Extensions

- 実Storage Client / Credential Vault
- Provider Asset Uploader adapters
- encrypted execution queue payload
- one-time signed access / URL revocation layer
- Media Preparation Contract
- Asset lineage / derivative tracking
- malware / content scan integration
- residency-aware transfer orchestration
- provider handle lifecycle / deletion
- observability with privacy-preserving metrics
- durable export storage migration

## 57. Open Questions

1. AssetReferenceを`lib/contracts/assets.ts`へ移す時期。
2. `Sensitive<T>`をlogger lint / runtime guardまで拡張するか。
3. Provider fetchでone-time URLを全Storageが提供できるか。
4. Provider handle cacheの暗号化Storeと最大Retention。
5. provider-training opt-outを共通Policyでどこまで表現できるか。
6. Metadata schemaをcodecごとのversionへ分けるか。
7. SHA-256未登録Assetのbackfill Job。
8. optional omission時のReview PolicyをAsset Usage別にするか。
9. Request MaterializerをProvider Client package内に置くか独立packageにするか。
10. Existing Export StorageのstorageKeyを将来assetIdへ統合するmigration。
11. Signed URL queryが外部Provider logsへ残る場合の契約・通知。
12. Legal holdとuser deletionが競合する際のWorkflow Policy。

これらはReference Asset Resolver Foundationを妨げない。Secret-free Plan、Mock Store、Mock Executor、redacted Auditの実装へ進める状態である。
