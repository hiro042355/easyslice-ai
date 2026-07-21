# Output Ingestion Contract Specification V1

## 1. Purpose

Output Ingestion Contract V1は、Provider生成結果のrestricted output referenceを取得・検証・保存し、NEXCUT管理下の正式なAssetへ変換する境界を定義する。

```text
Provider Output Reference → Fetch → Validate → Store → Register → assetId
```

## 2. Design Philosophy

- **Import Before Trust**: 取得成功だけではavailableにしない。
- **Provider Reference Is Not Asset ID**: Registry完了後だけassetIdを発行する。
- **Copy Into NEXCUT Control**: Provider URL/Handleへの長期依存を避ける。
- **Fail Closed**: required出力の安全性・完全性が不足すれば利用不可。
- **Secret Isolation**: reference、download access、locatorをAuditへ出さない。
- **Immutable Source Evidence**: computed checksum、size、MIME、validationを証跡化する。
- **No Silent Transformation**: transcode/resize/normalizeはMedia Preparationへ分離する。
- **Deterministic Validation**: pure validationとexternal executionを分離する。

## 3. Scope

Input、expected output、policy、plan、fetch、stream、MIME/size/checksum/metadata、scan、store、registry、provenance、partial、idempotency、cleanup、resultを設計する。

## 4. Non-Goals

実Download、Storage/DB、assetId発行、Scan、実Provider、Credential、Media変換、Director/Scene/Provider選択、Publish/Review/Billingは含まない。

## 5. Architecture Position

```text
Provider Client → Safe Provider DTO → Adapter normalizeResponse()
→ NormalizedGenerationResult → Output Ingestion Orchestrator
→ Output Fetcher → Content Validator → Store Writer
→ Asset Registry → NEXCUT Asset ID
```

## 6. Responsibilities

Fetcherはreference解決とstream取得、ValidatorはMIME/size/checksum/metadata、Writerはatomic storage、RegistryはassetId/AssetRecord、Provenance Storeはrestricted lineage、Orchestratorは順序・partial・cleanup・Resultを所有する。

## 7. Provider Client / Adapter / Ingestion Boundary

ClientはProvider固有Safe DTO、Adapterは共通Generation Resultとrole、Ingestionはcontent importとNEXCUT Asset化を担当する。Ingestionは生成結果の芸術的意味やroleを変更しない。

## 8. Provider Output Reference

```ts
type ProviderOutputReferenceItem = {
  slotIndex: number;
  role: GeneratedOutputRole;
  providerOutputReference: string;
};

type ProviderOutputReferenceBundle = Sensitive<{
  bundleVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  items: readonly ProviderOutputReferenceItem[];
}>;
```

`providerOutputReference`は非空・最大256文字のURLでないopaque restricted ID。通常Audit/Analytics/UIへ出さない。Bundleがprovider、API version、operationへbindし、各Itemはslot indexとroleへbindする。空・URL・duplicateを拒否する。期限はProvider Access Resolver/Fetched Access側で扱う。V1に独立した`referenceVersion`はなく、Bundle全体を`bundleVersion`でversion管理する。

## 9. Normalized Generation Result Boundary

既存`GeneratedAssetReference`は`AssetReference & { role }`で、field名`assetId`はIngestion前にProvider output referenceを格納している。これは命名上の技術的負債であり、正式NEXCUT assetIdではない。

V1は既存コードを変更せず、Ingestion adapterでrestricted referenceへ変換する。将来は`GeneratedProviderOutputReference`へ改名し、Ingestion後だけ`AssetReference`を返す。role順、primary/alternate/preview/stem、warnings、partial/failedを保持し、URL referenceを拒否する。

## 10. Output Ingestion Input

```ts
type OutputIngestionInput = {
  contractVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  generationResult: NormalizedGenerationResult;
  expectedOutput: ExpectedOutputContract;
  policy: OutputIngestionPolicy;
  context: OutputIngestionContext;
  idempotency?: OutputIngestionIdempotencyContext;
};
```

Credential、Prompt/Story/Lyrics、Decision/Scene Plan、Materialized Request、input access、Approval、Billingを含めない。generationResult全体はrestricted inputとして通常ログ禁止。

## 11. Expected Output Contract

```ts
type GeneratedOutputRole = "primary" | "alternate" | "preview" | "stem";
type ExpectedOutputRole = {
  role: GeneratedOutputRole;
  requirement: "required" | "optional";
};

type ExpectedOutputContract = {
  contractVersion: "1.0";
  kind: AssetKind;
  requiredRoles: readonly GeneratedOutputRole[];
  optionalRoles: readonly GeneratedOutputRole[];
  allowedMimeTypes: readonly string[];
  allowedCodecs?: readonly string[];
  allowedContainers?: readonly string[];
  maximumOutputCount: number;
  maximumSizeBytes: number;
  expectedDuration?: ExpectedDuration;
  expectedDimensions?: ExpectedDimensions;
  requireChecksum: boolean;
  requireDurationMetadata: boolean;
  requireDimensions: boolean;
};
```

Workflow/AdapterがVocal/Music/MV、mix/stem、preview/alternateの期待値を構造化する。IngestionはCapability、Decision、Materialized Requestから推測しない。

## 12. Output Ingestion Policy

```ts
type OutputIngestionPolicy = {
  policyVersion: "1.0";
  externalFetchAllowed: boolean;
  allowedProviderIds: readonly string[];
  maximumDownloadBytes: number;
  requireHttps: boolean;
  redirectPolicy: "none" | "same-allowlisted-host";
  retentionClass: AssetRetentionClass;
  sensitivityClass: AssetSensitivityClass;
  scanRequired: boolean;
  metadataStrippingRequired: boolean;
  sourceRegion?: string;
  destinationRegion?: string;
  deletionPending: boolean;
};
```

Workflow/Security Layerの決定結果を強制するだけ。Credential、user profile、Billing、Prompt、raw responseを含めない。`allowedProviderIds`と`deletionPending`は安全Policyの必須Decisionであり、省略時のdefaultをIngestionが推測してはならない。`sourceRegion`と`destinationRegion`だけがoptionalである。

## 13. Output Ingestion Context

```ts
type OutputIngestionContext = {
  contextVersion: "1.0";
  operationRef: string;
  baselineTime: string;
  attempt: number;
  cancellation?: {
    stage:
      | "none"
      | "before-fetch"
      | "during-fetch"
      | "before-store"
      | "before-registry";
  };
};
```

`operationRef`はURLでないopaque restricted ID。User/Asset IDを含めない。Baselineは固定UTC input。regionはPolicyを正とし、Contextで二重管理しない。V1 Contextはtemporary workspaceまたはstorage targetを所有しない。Cancellationはoptionalなstage markerであり、boolean stateやcaller supplied callbackではない。省略時はCancellation fixtureを要求しない。

## 14. Output Fetcher

```ts
type ProviderOutputFetcher = {
  fetch(input: ProviderOutputFetchInput): Promise<ProviderOutputFetchResult>;
};
```

1 attemptでreference解決、download access、HTTPS、redirect、timeout、stream、Content-Type/Length、上限、partial検出、provider errorを扱う。Asset ID、Storage、role変更、transcode、scan判断は行わない。

## 15. Provider Output Access

```ts
type ProviderOutputAccess = Sensitive<
  | { mode: "provider-reference"; reference: string }
  | { mode: "signed-download"; url: string; expiresAt: string }
  | { mode: "provider-stream"; streamHandle: string }
>;
```

URL/token/handleをAudit、Issue、Errorへ含めない。直接URL型はFetcher内部access resolver以降だけに置く。

## 16. Fetch Result

```ts
type ProviderOutputFetchResult =
  | { status: "fetched"; content: Sensitive<OutputContentHandle>; metadata: ProviderOutputMetadata }
  | { status: "failed"; error: NormalizedOutputFetchError };
```

Memory Bufferを共通Contractへ載せない。metadataはMIME hint、declared length、provider checksum等のsafe typed値だけでraw headersを含めない。

## 17. Output Content Handle

```ts
type OutputContentHandle = {
  handleVersion: "1.0";
  contentRef: string;
};
```

一時stream/spoolへのopaque handleで、URL/path/bucket/object keyを公開しない。Sensitive、短命、execution内限定。Fetcher/Inspector/Writerだけが解決する。

## 18. Streaming Boundary

Audio/Videoはbackpressure付きstreamを基本とし、受信byte数、SHA-256、magic sniffを同時処理する。上限超過、cancel、partial、checksum不一致で直ちにabortしtemporary contentをcleanupする。

V1はresume/range retryを行わない。安全な未受信接続再確立以外はWorkflow retry。compressed/decompressed両上限を持ち、完了markerがないstreamを成功扱いしない。

## 19. HTTP and Fetch Security

HTTPS、certificate validation、provider endpoint allowlist、DNS再解決後IP検証、private/loopback/link-local/metadata endpoint拒否、redirect最大3、cross-host/credential forwarding禁止、host pinning、Content-Length/chunk上限、decompression ratio、connect/read/attempt timeoutを要求する。

User入力URLを許可せず、実Provider URLを仕様へ固定しない。SSRF、DNS rebinding、redirect loop、request smugglingをfail closedする。

## 20. MIME Validation

順序: Provider metadata hint → HTTP Content-Type → magic/file signature → Expected MIME。parameter除去、小文字化後に比較し、拡張子/filenameを正としない。

missing Content-Typeはmagicが一意なら許可可能。矛盾はfail。`application/octet-stream`はExpectedで明示許可した場合だけ。AssetRecordにはcanonical media MIME、container/codecはtyped metadataへ保存する。

## 21. File Size Validation

declared Content-Length、provider metadata、stream actual bytes、written bytesを比較する。maximumはExpectedとPolicyの小さい方。未知lengthはstream計数、0 byteは`output-empty`、負/小数/overflowはinvalid。上限超過時点で停止する。

partial、declared/actual/written mismatch、decompressed oversizedを成功にしない。

## 22. Checksum and Integrity

V1 canonical algorithmはSHA-256。受信streamで常に計算し、Provider checksumがあれば比較する。Expected checksumが将来渡される場合も同じalgorithmを使用する。ETagは採用しない。

computed checksumをAssetRecordへ保存し、Writer/Registryでも再照合する。provider checksum欠落は許可するがcomputed checksum欠落は許可しない。duplicate content lookupはSHA-256 + size + canonical MIMEを用いる。

## 23. Metadata Extraction

Inspectorがtyped metadataを抽出する。

- Audio: duration、sample rate、channels、codec、bitrate、optional loudness
- Video: duration、width/height、frame rate、codec/container、rotation、audio track
- Image: width/height、orientation、color profile class、alpha

raw filename/EXIF/XMP/provider metadataはAssetReferenceへ追加しない。AssetRecord Metadataは既存audio/video/image unionと整合させる。

## 24. Metadata Validation

kind/type一致、finite positive duration、positive integer dimensions/sample rate/channels、positive frame rate、non-empty codec、required metadata、role/countを確認する。Impossible値、extract failure、missing requirementはfail。

自動修正、rotation normalization、loudness normalizationを行わない。

## 25. Duration Validation

```ts
type ExpectedDuration = { targetSeconds: number; toleranceSeconds: number };
```

両方finite positive/nonnegative。Vocal/Music/MVの意味元をIngestionへ渡さず、Expectedだけを比較する。`abs(actual-target) <= tolerance`を許可。既定toleranceはWorkflow/Adapterが明示し、Ingestionが作品種別から推測しない。

## 26. Dimensions and Aspect Ratio

```ts
type ExpectedDimensions = {
  width?: number; height?: number;
  minimumWidth?: number; minimumHeight?: number;
  aspectRatio?: string; aspectTolerance?: number;
};
```

rotation適用後display dimensionsとpixel/display aspectを区別する。MismatchはV1でfail closedし、Media Preparation候補Reasonを返せるが、crop/resize/letterboxはしない。

## 27. Codec and Container

Expected allowlistだけを正とし、WAV/MP3/AAC/FLAC/MP4/WebM/MOV/PNG/JPEG/WebP等を固定Provider仕様として埋め込まない。containerとcodecを別fieldで検証する。

V1のunsupported codec/containerは`codec-unsupported`でfail closed。必要ならrestricted raw importを保持してMedia Preparation Workflowへ渡す将来拡張とする。

## 28. Content Safety Boundary

IngestionはscanRequiredを守りScannerへrequestし、statusを受けるだけ。Scannerがmalware/exploit、NSFW/policy、identity/copyright/child safety、metadata prompt injectionを判定する。

scan完了前は`pending-scan`、quarantined/blockedはavailableにしない。Ingestionが独自modelや法務判断を持たない。

## 29. Metadata Stripping

EXIF/GPS/XMP/provider prompt/creation software/thumbnail/user-identifying metadataの除去はMedia Sanitizerへ分離する。

```text
Raw imported temporary content → Scanner/Sanitizer → Final stored content → available
```

strippingRequiredならSanitizer完了前にfinal availableへしない。ICCは色再現に必要な場合safe classだけ保持し、raw profileを外部Contractへ出さない。

## 30. Asset Store Writer

```ts
type AssetStoreWriter = { write(input: AssetStoreWriteInput): Promise<AssetStoreWriteResult> };
```

Temporary handleからatomic write、encryption、region、retention、size/checksum再確認、opaque locator生成、failed write cleanupを担当する。Asset ID、role、Provider response、transcodeを扱わない。

## 31. Imported Asset Registry

```ts
type ImportedAssetRegistry = {
  create(input: {
    slotIndex: number;
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    metadata: ProviderOutputMetadata;
    availability: AssetAvailabilityStatus;
    locatorRef: string;
    policy: OutputIngestionPlan["policy"];
  }): Promise<AssetRegistryCreateResult>;
};

type AssetRegistryCreateResult =
  | { status: "created"; record: AssetRecord }
  | { status: "failed"; error: NormalizedOutputIngestionError };
```

`ImportedAssetRegistry`はassetId発行、既存AssetRecord作成、status/metadata/checksum/locator/region/retention/integrityを所有する。V1のoperation名は`create`であり、`createRecord`ではない。Provider reference/jobはAssetRecordへ入れずrestricted Provenance Storeへ分離する。

## 32. Imported Asset Record

既存`AssetRecord`を正とする。schemaVersion、assetId、kind、mimeType、sizeBytes、checksum、metadata、opaque locator、availability、region、retention、integrityStateを使用する。

Ingestion固有field、raw Provider metadata、role、reference、job IDを本体へ追加しない。Role linkageはWorkflow Result/Provenanceに置く。

## 33. Provenance

```ts
type AssetProvenanceRecord = {
  provenanceVersion: "1.0";
  sourceType: "provider-generation";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  outputRole: GeneratedOutputRole;
  restrictedProviderOutputReference?: Sensitive<string>;
  importedChecksum: string;
};
```

暗号化、least privilege、Asset retention以下の保持、通常Audit非表示。reference保存が不要なProviderではfingerprintだけを保持。Deletion/legal holdはPolicyに従う。

## 34. Asset Status

新しい永続status unionを作らず既存`AssetAvailabilityStatus`を使用する。

```text
download/validate中: Registry未作成またはprocessing
scan待ち: pending-scan
scan拒否: quarantined / blocked
integrity failure: corrupted
final success: available
cleanup/delete: deleted / missing
```

`ingesting/validating/failed`はWorkflow attempt stateでありAssetRecord statusと分離する。

## 35. Ingestion Result

```ts
type OutputIngestionResult =
  | { status: "completed"; requiredOutputsComplete: true; assets: ImportedAssetReference[]; audit: OutputIngestionAudit }
  | { status: "partial"; requiredOutputsComplete: boolean; assets: ImportedAssetReference[]; issues: OutputIngestionIssue[]; audit: OutputIngestionAudit }
  | { status: "failed"; requiredOutputsComplete: false; issues: OutputIngestionIssue[]; audit: OutputIngestionAudit };
```

0件成功ならfailed。1件以上成功し一部失敗ならpartial。Required完全かは明示fieldで判断する。

## 36. Required and Optional Outputs

Expected Contractがroleごとのrequired/optionalを正とする。Primaryは通常requiredだが固定しない。Alternate/Preview/StemもWorkflowが指定する。

Required失敗は`requiredOutputsComplete=false`。Optional失敗はtrueを維持しpartial。RoleをIngestionが昇格・降格しない。Publish/Review判断はWorkflow。

## 37. Partial Success

Partial preserveを採用する。成功した高コスト出力Assetを保持し、Required不足でもResult assetsとして返せる。ただし`requiredOutputsComplete=false`のためGeneration Workflowの完成出力として利用不可。

保持不要PolicyならWorkflowがcleanupを指示する。IngestionがRequired失敗を理由に成功Assetを即削除しない。

## 38. Duplicate Output

同一Provider reference重複はPlan invalid。異なるreferenceで同一checksumはDuplicate Lookup対象。同一contentを異なるroleへ紐付けることは許可し、Asset本体をreuseできる。同一role重複はExpected cardinalityに従う。

既存NEXCUT Assetはchecksum + size + MIME + policy/region/retention compatibilityが一致した場合だけreuseする。reference文字列をdedupe keyにしない。

## 39. Idempotency

```ts
type OutputIngestionIdempotencyContext = { ingestionKeyRef: string };
```

opaque、最大128、URL禁止。Provider reference/Asset/User IDを直接含めない。同一key + 同一safe input fingerprintは既存Result、異なるinputはinvalid。

Stage journalを保持し、fetch timeout、write後Registry失敗、Registry後response timeoutを再開・compensateする。assetId二重発行を防ぐためRegistry createにidempotency keyを渡す。

## 40. Transaction Boundary

```text
Plan → Fetch → Validate/Hash/Inspect → Temporary Store
→ Scan/Sanitize → Duplicate Lookup → Final Atomic Store
→ Registry → Provenance → Result
```

StorageとDBを跨ぐ単一transactionを仮定しない。各stageをjournal化し、final store後Registry失敗はorphan marker、Registry後Provenance失敗はAssetをnon-availableに保ちcompensationをscheduleする。

## 41. Cleanup

partial download、validation/scan failure、temporary content、failed atomic write、orphan object、duplicate temporary copy、cancelled executionをcleanupする。final registered AssetはWorkflow policyなしに削除しない。

CleanupSchedulerを本体から分離し、cleanup-required Reasonとrestricted handleだけを渡す。Provider expiry、workflow deletion、retention expiry、provenance deletionも別jobで処理する。

## 42. Cancellation

fetch/checksum/inspect/scan/write前後でsignalを確認する。in-flight interruptionは各dependencyがAbortSignalを実装する。Registry create開始後は結果を照会し、blind retryしない。

作成済みAssetは自動削除せずorphan/retained policyへ。成功済み他outputをResultに保持し、cancelled itemをIssue化する。

## 43. Retry Boundary

Fetcher/Scanner/Writer/Registryは1 attemptとretry adviceを返す。Workflowがbudget、backoff、cost、attempt stateを所有する。送信/書込済みか不明なtimeoutはidempotency journalで照会してから再試行する。

stream内部retryはbyte offset、hash state、provider range supportが安全に証明できる場合のみ。V1 Referenceではresumeしない。

## 44. Error Contract

```ts
type OutputIngestionErrorCategory =
  | "reference-invalid" | "reference-expired"
  | "fetch-failed" | "fetch-timeout" | "payload-too-large"
  | "mime-invalid" | "metadata-invalid" | "checksum-mismatch"
  | "content-corrupted" | "scan-failed" | "content-blocked"
  | "storage-failed" | "registry-failed" | "cancelled" | "unknown";
type NormalizedOutputIngestionError = { category: OutputIngestionErrorCategory; retryable: boolean; safeCode?: string };
```

Network timeout/unavailable、一時storage/registry failureはretry候補。invalid reference/MIME/checksum/content blocked/metadata/cancelledは不可。raw URL/reference/locator/body/message/stackを含めない。

## 45. Issue and Reason Codes

固定順:

```text
unsupported-contract-version
input-shape-invalid
generation-result-invalid
provider-mismatch
provider-api-version-mismatch
operation-mismatch
output-reference-invalid
duplicate-output-reference
required-output-missing
optional-output-failed
output-count-exceeded
output-role-invalid
output-fetch-failed
output-fetch-timeout
output-too-large
output-empty
mime-type-mismatch
codec-unsupported
checksum-mismatch
metadata-missing
duration-mismatch
dimensions-mismatch
aspect-ratio-mismatch
content-scan-pending
content-quarantined
content-blocked
storage-write-failed
registry-create-failed
provenance-write-failed
duplicate-content-reused
ingestion-cancelled
cleanup-required
```

item index、role、kind等のsafe enumだけを持ち、reference/URL/assetId/locator/raw valueを含めない。

## 46. Audit

```ts
type OutputIngestionAudit = {
  status: "completed" | "partial" | "failed";
  expectedCount: number;
  receivedCount: number;
  fetchedCount: number;
  validatedCount: number;
  importedCount: number;
  reusedCount: number;
  failedCount: number;
  roles: readonly GeneratedOutputRole[];
  mimeClasses: readonly ("audio" | "video" | "image" | "unknown")[];
  reasonCodes: readonly OutputIngestionReasonCode[];
};
```

配列はoutput/expected初出順・重複なし。Provider reference、URL/token、locator、assetId、filename、Prompt/Story/Lyrics、job ID、raw error/stackを含めない。

## 47. Imported Asset Reference

```ts
type ImportedAssetReference = {
  assetId: string;
  kind: AssetKind;
  role: GeneratedOutputRole;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  availability: AssetAvailabilityStatus;
};
```

Workflow Resultのrestricted領域にはassetIdを含めてよい。通常Audit/Analyticsへ出さない。正式`AssetReference`へ変換できるのはRegistry成功後だけ。

## 48. Security and Privacy

Provider reference/download accessをsecret、content/temporary/final locatorをrestrictedとする。SSRF、metadata leakage、EXIF/GPS、file exploit/malware、watermark/prompt metadata、personal voice/image、child safety、retention/residency/deletion/training opt-out/legal holdをPolicyとdependencyで強制する。

法務・Safety意味判断をIngestion Coreへ入れず、blocked/quarantined結果を尊重する。

## 49. Logging

禁止: reference、download URL/token、locator、assetId ordinary audit、Prompt/Story/Lyrics、raw response/file metadata/EXIF/error/stack/full endpoint。

許可: Provider ID、operation、status、role/kind/MIME/size class、validation category、retryable、attempt、scan status、imported/failed count。Provider IDをrestrictedとする環境ではclass/hashへ置換する。

## 50. Data Residency

Provider output、download endpoint、temporary/scan/final storageのregionをPolicyで照合する。cross-region不許可ならfetch前にblock。Scanner/Writerがdestination regionを守り、Client/Ingestionが別regionへ自動fallbackしない。

Retention、legal hold、deletion pending、training opt-outをProvenance/Storage policyへ伝播する。

## 51. Operations

表示可: status、role、kind、MIME/size class、duration/dimensions、checksum verified、scan、reused/imported、error category、retryable、attempt。

表示不可: provider reference、URL、locator、job ID、raw metadata、Prompt、Credential。assetId詳細はrestricted Asset画面だけ。

## 52. Determinism

Deterministic: input/role/count/reference shape、MIME/size/metadata/checksum比較、status/error mapping、duplicate rule、Audit/Issue order。

Non-deterministic: Network、Provider availability/access、stream timing、scan timing、Storage/Registry、assetId、timestamps。Clock/IDはdependencies/contextから注入し、Coreでrandom/Dateを呼ばない。

## 53. Plan Builder and Executor Split

```ts
type OutputIngestionPlanItem = {
  slotIndex: number;
  role: GeneratedOutputRole;
  requirement: "required" | "optional";
  expectedKind: AssetKind;
  allowedMimeTypes: readonly string[];
  allowedCodecs: readonly string[];
  allowedContainers: readonly string[];
  maximumSizeBytes: number;
  expectedDuration?: ExpectedDuration;
  expectedDimensions?: ExpectedDimensions;
  requireChecksum: boolean;
  requireDurationMetadata: boolean;
  requireDimensions: boolean;
};

type OutputIngestionPlan = {
  planVersion: "1.0";
  executorVersion: "reference-v1";
  providerId: string;
  providerApiVersion: string;
  operation: ProviderOperation;
  items: readonly OutputIngestionPlanItem[];
  policy: Omit<OutputIngestionPolicy, "allowedProviderIds">;
  context: OutputIngestionContext;
  idempotency?: OutputIngestionIdempotencyContext;
  warnings: readonly string[];
};

type OutputIngestionPlanResult =
  | { status: "planned"; plan: OutputIngestionPlan; references: ProviderOutputReferenceBundle; issues: [] }
  | { status: "invalid"; issues: OutputIngestionIssue[] };
```

`buildOutputIngestionPlan(input)`はこの`OutputIngestionPlanResult`を返すpure functionである。Builderはpure/sync/deterministic/secret-free。Plan itemはreference slot index、role、required、expected kind/MIME/size/metadata要件を持ち、raw referenceを含めない。Plan policyはinput Policyから`allowedProviderIds`だけを除いたshapeである。Provider allowlist検証はPlan構築時に完了し、Executorへ重複保持しない。

Executionでは別の`ProviderOutputReferenceBundle`をslot indexで結合する。Bundle型自体が`Sensitive`であり、呼出側で二重にwrapしない。Planへreferenceを含めるrestricted案はcache/log事故リスクが高いため採用しない。

## 54. Interfaces

Current Contract Shapeは`OutputIngestionPlanBuilder`、`OutputIngestionExecutor`、`OutputIngestionDependencies`というtype aliasをexportしない。Builder境界は`buildOutputIngestionPlan(input: OutputIngestionInput): OutputIngestionPlanResult`というfunction shapeである。Runtime Executorは`execute(plan: OutputIngestionPlan, references: ProviderOutputReferenceBundle): Promise<OutputIngestionResult>`を提供し、dependency capabilityはconstructorまたはCompositionで注入する。

将来facade typeを追加する場合は別versionで定義する。Documentだけに未実装type aliasを宣言してはならない。Service facadeはWorkflow convenienceとしてcompose可能だが、ExecutorはroleやExpected Output Contractを変更しない。

## 55. Dependency Interfaces

- ProviderOutputFetcher
- ContentInspector
- ContentScanner
- MediaSanitizer
- AssetStoreWriter
- ImportedAssetRegistry
- ProvenanceStore
- DuplicateAssetLookup
- IngestionJournal
- CleanupScheduler

CoreはProvider/Storage/DB SDKをimportせず、typed resultとretry adviceだけを受け取る。

## 56. Versioning

Current Contract Shapeで明示的に保持するversion fieldは次である。

| Shape | Version field |
| --- | --- |
| OutputIngestionInput | `contractVersion: "1.0"` |
| ExpectedOutputContract | `contractVersion: "1.0"` |
| OutputIngestionPolicy | `policyVersion: "1.0"` |
| OutputIngestionContext | `contextVersion: "1.0"` |
| OutputIngestionPlan | `planVersion: "1.0"` |
| OutputIngestionPlan executor compatibility | `executorVersion: "reference-v1"` |
| ProviderOutputReferenceBundle | `bundleVersion: "1.0"` |
| OutputContentHandle | `handleVersion: "1.0"` |
| AssetProvenanceRecord | `provenanceVersion: "1.0"` |

Fetcher、Inspector、Scanner、Sanitizer、Writer、Imported Asset Registry、Metadata、Error、Idempotencyのcurrent shapeには独立version fieldを追加しない。将来非互換shapeが必要な場合だけ別versioned Contractを追加する。Documentだけで未実装version fieldを要求してはならない。

validation/role/MIME/checksum/scan/AssetRecord/Provenance/partial/idempotency規則変更は該当versionを更新。旧Planはpinされたdependency compatible versionで実行し、非互換なら再buildする。

## 57. Reference Foundation

候補:

```text
lib/outputIngestion/types.ts
lib/outputIngestion/outputIngestionPlan.ts
lib/outputIngestion/outputIngestionUtils.ts
lib/outputIngestion/referenceOutputFetcher.ts
lib/outputIngestion/referenceContentInspector.ts
lib/outputIngestion/referenceScanner.ts
lib/outputIngestion/referenceAssetStore.ts
lib/outputIngestion/referenceRegistry.ts
lib/outputIngestion/referenceOutputIngestion.ts
```

実Network/StorageなしのfixtureでVocal audio、Music mix/stem、MV video/preview、required/optional、duplicate、MIME/size/checksum/metadata/scan/store/registry/partial/idempotency/cleanup/redactionを検証する。

## 58. End-to-End Reference Workflow

Foundation後に接続する。

```text
Adapter → Resolver → Materializer → Client
→ Adapter normalizeResponse → Output Ingestion → AssetReference
```

ここで初めて入力Asset IDから生成出力Asset IDまでReference Workflowが閉じる。Client Safe DTOと現行Adapter Response fixtureのbridgeはReference Workflow moduleが明示する。

## 59. Edge Cases

- empty/completed without output、partial/failed with outputs
- duplicate reference/role、count超過、required role missing
- expired reference、fetch timeout、redirect loop/host mismatch
- length missing、zero/oversized/compression bomb/partial
- MIME missing/spoof、codec unsupported
- checksum missing/provider mismatch/duplicate content
- metadata extraction、zero/wrong duration/dimensions/aspect
- scan pending/failed/quarantined/blocked
- write/registry/provenance failure、orphan cleanup
- retry after write/registry、cancel、cleanup failure
- region mismatch、deletion pending、reference expired

## 60. Test Matrix

### Input / Roles

valid/null/version/provider/API/operation/generation result、primary/alternate/preview/stem、required/optional/duplicate/missing/count超過。

### Fetch / MIME / Integrity

success/timeout/unavailable/expired/redirect/cancel/partial/size、MIME exact/normalized/parameter/missing/spoof、SHA-256/provider checksum/mismatch/duplicate/zero byte。

### Metadata / Scan

audio/video/image、duration/dimensions/aspect/codec、passed/pending/quarantined/blocked/failed。

### Storage / Registry / Result

atomic success/failure/orphan/reuse/region、create/duplicate/failure/idempotent/provenance、completed/partial/failed/required/optional/multiple roles。

### Security / Determinism / Regression

Auditにreference/URL/locator/assetId/raw metadata/Prompt/Story/Lyrics/errorなし。Plan validation、role/reason/MIME/status/duplicate order固定。Provider Client DTO、Adapter normalize、Asset Resolver、Materializer、AssetReference不変。

## 61. Future Extensions

実Fetcher/Storage/Registry、resumable stream、content-addressable store、multi-region import、restricted forensic evidence、Media Preparation handoff、Output lifecycle/revocation、watermark provenanceを追加できる。Director/Provider Selection責務を入れない。

## 62. Open Questions

1. 既存`GeneratedAssetReference.assetId`をいつProvider Output Reference型へ改名するか。
2. restricted provider referenceをProvenanceへ保存するProvider/期間。
3. Required不足時に保持したpartial Assetのdefault retention。
4. Sanitizer前raw contentのStorage classとaccess control。
5. Duplicate reuse時のProvenance/role linkage。
6. Unsupported codecをraw restricted importとしてMedia Preparationへ渡すV2。
7. Scanner pendingが長期化した場合のWorkflow timeout。

次フェーズはReference Output Ingestion Foundationから開始する。Provider Upload Contractを先行させる必要はなく、Output importとEnd-to-End Reference Workflowを先に閉じる。
