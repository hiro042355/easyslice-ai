# MV Scene Plan Gate Contract V1

## 1. Purpose

本Contractは、完成済み`MVScenePlan`をReference MV Adapterへ渡してよいかを、pureかつ決定的に判定する境界を定義する。正式な接続目標は次である。

```text
MVScenePlan
+ MVDecisionProjection
+ DirectorDecision
+ MVScenePlanGatePolicy
+ MVScenePlanGateContext
→ createMVScenePlanGate()
→ MVScenePlanGateResult
```

GateはSceneを生成・修正せず、既存Planと上流Decisionの整合だけを検証する。
## 2. Confirmed Current Gap

現在の`createMVScenePlan()`は`MVScenePlanResult`を返す。`status: "planned"` branchには`plan: MVScenePlan`があり、`status: "invalid"` branchにはPlanがない。

一方、`ReferenceMVAdapterInput`は`gate: MVScenePlanGateResult`を必須とする。型は存在するが、生成・評価factoryは存在しない。

したがって、PlanからAdapter Inputへの正式経路が未接続である。

## 3. Source of Truth

実コードを本Contractの第一の正とする。

確認対象は次である。

```text
lib/mvContracts.ts
lib/mvScenePlanner.ts
lib/providers/referenceMVAdapter.ts
lib/providers/types.ts
lib/directorDecisionEngine.ts
```

指定されていた次の文書名は現ワークツリーに存在しない。

```text
docs/REFERENCE_PROVIDER_ADAPTER_CONTRACT_V1.md
docs/REFERENCE_WORKFLOW_CONTRACT_V1.md
```

代替根拠として、現存する`PROVIDER_ADAPTER_ARCHITECTURE_V1`、`REFERENCE_MV_ADAPTER_SPEC_V1`、`WORKFLOW_ENTRY_POINT_INTEGRATION_CONTRACT_V1`を参照する。

## 5. Architecture Position

```text
createEmotionGraph()
→ createDirectorDecision()
→ createMVDecisionProjection()
→ createMVScenePlan()
→ createMVScenePlanGate()
→ ReferenceMVAdapterInput
→ Reference MV Adapter
```

GateはScene PlannerにもProvider Adapterにも属さない。Foundation上の配置はProvider非依存のpure validation layerとする。

WorkflowはGate結果を受けて次の処理へ進むかを決める。

## 6. Design Principles

1. 実コードのfieldだけを検証する。
2. Scene配列順をsemantic orderとして扱う。
3. 不正入力を修復しない。
4. Plan本文をResultへ複製しない。
5. safe reason codeだけを返す。
6. Adapter validationを緩和しない。
7. Provider capabilityをGate判断へ混ぜない。
8. Approvalがない状態を承認済みと推測しない。
9. 同一入力には同一Resultを返す。
10. 入力を変更しない。

## 7. Scope

Foundation V1の対象は次である。

- Plan shapeとversion
- Scene identity、order、timeline
- duration coverage
- Decision、Projection、Planの整合
- main peakとafterglow
- 論理Asset Reference shape
- Plan validationとreview状態
- safe Gate Result生成
- Registry descriptor

## 8. Non-goals

Gateは次を担当しない。

- Scene生成または再生成
- Scene並べ替えまたは時間補正
- Story解釈
- Lyrics再解析
- Director Decision再計算
- Projection再生成
- Asset Resolution
- Provider選択
- Materialization
- Provider request生成
- GenerationまたはOutput Ingestion
- UI表示
- manual review実行
- Approval保存
- Fingerprint計算または照合

## 9. Current Gap Matrix

| Source | Current output | Required downstream input | Missing information | Current workaround risk |
|---|---|---|---|---|
| `createMVScenePlan()` | `MVScenePlanResult` | planned PlanとGate | Gate Result | 手書きGateがvalidationを迂回する |
| `MVScenePlanResult` | plannedまたはinvalid | planned branchのみ | invalid時のPlanなし | branch無視で不正castする危険 |
| `MVScenePlan` | scenes、validation、review | Adapter用Gate | approval state、fingerprint | review-requiredを自動承認する危険 |
| `MVScenePlanGateResult` | 型のみ | Adapterの必須field | factory、status、audit | reasonの意味が呼出側ごとに分岐する |
| `ReferenceMVAdapterInput` | gate必須 | `allowed: true` | Gate生成owner | fixture独自判定が本番と乖離する |
| Reference MV Adapter | `gate.allowed`を防御確認 | 正式Gate結果 | upstream factory | fake allowedでAdapterへ到達する |

## 10. Gate Responsibilities

Gateは完成済みPlanを読み取り専用で検証する。

構造不正、順序不正、時間不正、alignment不正は通過させない。

Plan自身の`validation.status`と`reviewRequired`を尊重する。

ResultはAdapter接続可否を表す最小envelopeとする。

## 12. Proposed Input Contract

Foundation候補は次である。

```ts
type MVScenePlanGateInput = {
  gateVersion: "1.0";
  plan: MVScenePlan;
  projection: MVDecisionProjection;
  decision: DirectorDecision;
  policy: MVScenePlanGatePolicy;
  context: MVScenePlanGateContext;
};
```

既存のPlan、Projection、Decision型をimportし、再定義しない。

## 13. Excluded Input

Inputへ次を含めない。

```text
Provider Credential
Provider Session
Provider Handle
Materialized Request
HTTP Context
User ID
tenant
idempotency key
fixture scenario
Story本文
Lyrics本文
```

Approval recordとfingerprintもFoundation V1 Inputには含めない。

## 14. Gate Context

時間依存判定を行わないため`baselineTime`は採用しない。

```ts
type MVScenePlanGateContext = {
  contextVersion: "1.0";
  operationRef: string;
};
```

`operationRef`は呼出追跡用opaque値であり、Result、Issue、Auditへ返さない。

Gateの判定値そのものには使用しない。

## 16. Gate Policy

Policyは判定規則を明示し、暗黙の環境設定を禁止する。

```ts
type MVScenePlanGatePolicy = {
  policyVersion: "1.0";
  timelineMode: "exact-contiguous";
  minimumSceneCount: 5;
  requireSingleMainPeak: true;
  requireFinalOutroAfterglow: true;
  reviewRequiredAction: "deny";
  normalizedPlanAction: "require-review";
  fallbackPlanAction: "require-review";
};
```

このPolicyは現行PlannerとAdapterの既存規則だけを表す。

## 17. Threshold Policy

Foundation V1はgap、overlap toleranceを新設しない。

現行PlannerはSceneを完全連続で生成する。

現行Adapterも前Sceneの`endSeconds`と次Sceneの`startSeconds`の完全一致を要求する。

したがってReference Policyは`exact-contiguous`とする。

minimum Scene Count 5は現行PlannerとAdapterの既存規則に基づく。

根拠のないmaximum Scene Countやminimum durationをGateへ追加しない。

## 18. Existing Result Contract

実装済み型は次である。

```ts
type MVScenePlanGateResult = {
  allowed: boolean;
  reviewRequired: boolean;
  reasonCodes: MVScenePlanGateReasonCode[];
};
```

Foundation V1ではこの型を変更しない。

Plan、Projection、Decision、Scene、AssetをResultへ含めない。

## 19. Derived Status

現行Resultには`status` fieldがない。

Foundation V1では次の意味をtupleから導出する。

| Meaning | allowed | reviewRequired | Primary reason |
|---|---:|---:|---|
| ready | true | false | `scene-plan-ready` |
| review-required | false | true | `scene-plan-review-pending` |
| blocked-invalid | false | false | `scene-plan-invalid` |

明示的`approved`、`rejected`、`stale`はFoundation factory単体では生成しない。

## 20. Approval Meaning

Foundationの`ready`は構造的な自動通過を意味する。

これはPlanが`valid`かつ`reviewRequired: false`で、全alignment検証を満たす場合だけである。

`ready`は映像品質、Provider成功、著作権、moderation、人間の承認を保証しない。

`scene-plan-approved`は人間または外部Policyの承認を意味する既存codeである。

Approval入力がないFoundation V1では、このcodeを推測して発行しない。

## 21. Review Required

Planの`reviewRequired: true`はAdapterへ自動送信しない。

`validation.status`が`normalized`または`fallback`の場合も同様である。

Resultは`allowed: false`、`reviewRequired: true`とする。

理由には`scene-plan-review-pending`を含める。

normalizedまたはfallback固有の既存reasonもcanonical順で追加する。

manual review queueへの投入は本Contract外である。

## 22. Blocked and Invalid

構造またはalignmentが不正なら`allowed: false`とする。

Foundation V1の現行Resultには`blocked` statusがない。

そのためsafeな表現は`scene-plan-invalid`である。

invalidをApprovalで通過させてはならない。

Resultへ不正field値、Scene ID、Asset IDを含めない。

## 23. Validation Order

判定順を次で固定する。

1. root Input shape
2. Gate、Context、Policy version
3. Plan versionとvalidation branch
4. Plan structural shape
5. Scene identityとarray order
6. ratioとsecondsの時間範囲
7. timeline coverage
8. DecisionとProjectionの整合
9. ProjectionとPlanのsection整合
10. main peak整合
11. afterglow／outro整合
12. logical asset reference shape
13. Policy evaluation
14. final Result生成

先に発見した秘密値をReasonへ転記しない。

## 24. Input Shape Validation

rootはplain recordでなければならない。

必須field欠落を拒否する。

`gateVersion`、`plan`、`projection`、`decision`、`policy`、`context`を検証する。

Foundation V1はexact root key allowlistを採用する。

unknown root fieldはinvalidとするが、field名をResultへ返さない。

malformed branchでも例外を投げない。

## 25. Version Validation

受理するversionは次である。

```text
Gate Input: 1.0
Gate Policy: 1.0
Gate Context: 1.0
MV Scene Plan schema: 1.0
MV Scene Planner: rule-v1
Director Decision schema: 1.0
MV Decision Projection schema: 1.0
```

unknown majorはinvalidとして生成停止する。

暗黙migrationまたは直接castは禁止する。

## 26. Plan Structural Validation

Planはplain recordでなければならない。

`durationSeconds`はfiniteかつ正でなければならない。

`aspectRatio`は現行`AspectRatio` union内でなければならない。

`scenes`は配列で、5件以上でなければならない。

`validation.status: "invalid"`は常にblocked-invalidとする。

Planのunknown field厳格拒否は既存保存互換性への影響があるためOpen Questionとする。

## 27. Scene Structural Validation

各Sceneについて実コードのfieldを検証する。

```text
sceneId
order
section
startRatio / endRatio
startSeconds / endSeconds
narrativePurpose
subject
setting
action
emotionalIntent
temporalMode
continuityRefs
assetRefs
isMainPeak
isAfterglow
```

Sceneを補完または正規化しない。

## 28. Scene Identity and Order

`sceneId`はnon-empty、256文字以下、URL禁止、CR/LF禁止とする。

Scene IDは全Plan内で一意でなければならない。

GateはScene IDを生成しない。

`order`はsafe integerで、array index + 1と完全一致させる。

配列をorder fieldで並べ替えて救済しない。

Scene IDをIssueまたはResultへ返さない。

## 29. Time Units

Sceneはratioとsecondsの両方を保持する。

`startRatio`、`endRatio`の単位は0〜1 ratioである。

`startSeconds`、`endSeconds`の単位は秒である。

millisecondsへ変換しない。

すべてfiniteでなければならない。

negative、zero duration、end before startを拒否する。

## 30. Ratio Validation

各Sceneで`0 <= startRatio < endRatio <= 1`を要求する。

先頭Sceneは`startRatio === 0`とする。

隣接Sceneは前の`endRatio ===`次の`startRatio`とする。

最終Sceneは`endRatio === 1`とする。

ratioをroundまたはclampしない。

Plannerが出力した6桁丸め済み値をそのまま検証する。

## 31. Seconds Validation

各Sceneで`0 <= startSeconds < endSeconds <= plan.durationSeconds`を要求する。

先頭Sceneは`startSeconds === 0`とする。

隣接Sceneは前の`endSeconds ===`次の`startSeconds`とする。

最終Sceneは`endSeconds === plan.durationSeconds`とする。

Gate側で秒値を再計算して置換しない。

## 32. Timeline Coverage

Reference Foundationでは完全coverageを必須とする。

gapは許可しない。

overlapは許可しない。

intentional gapとtransition overlapを表すfieldは現行`MVScene`に存在しない。

したがって、それらを推測して許可しない。

将来許容する場合はScene schemaとPolicyのversion更新が必要である。

## 33. Duration Binding

Gateが確認できるdurationは`plan.durationSeconds`と最終Sceneの`endSeconds`である。

ProjectionとDirector Decisionにはduration fieldがない。

したがって「projection duration」との照合はV1では実行不能である。

requested generation durationもGate Inputに含まれない。

Adapterは別途Planと`MVGenerationConstraints.durationSeconds`を既存許容差で照合する。

GateはそのAdapter責務を重複実装しない。

## 34. Decision and Projection Identity

Projectionの`decisionSchemaVersion`はDecisionの`schemaVersion`と一致させる。

Projectionの`engineVersion`はDecisionの`engineVersion`と一致させる。

`normalizedPreset`、`overallDirection`、`sectionDirections`、`validation`、`confidence`、`direction`を照合する。

`confidence`はDecisionの`overallDirection.confidence`と一致させる。

`direction`はDecisionの`mvDirection`とfield単位で一致させる。

JSON文字列化やobject field順へ依存しない。

## 35. Director Decision Alignment

GateはDecisionのmainPeak Sectionを読み取る。

DecisionのSection配列は5 Section、正式順、連続ratioでなければならない。

mainPeakは1 Sectionだけでなければならない。

Decisionの`overallDirection.mainPeakSection`と`isMainPeak` Sectionを一致させる。

afterglowは`overallDirection.afterglow`として存在することだけを検証する。

GateはDecision本文を再計算しない。

## 36. Projection Alignment

Projectionは5件の`sectionDirections`を保持する。

Section順、ratio、mainPeak SectionをDecisionと完全一致させる。

Planの各Scene sectionはProjectionの対応Section内でなければならない。

Scene ratioは対応Sectionのstart/end範囲内でなければならない。

最初と最後のSceneがSection境界をcoverageすることを要求する。

visual tone、movement、lightingはPlanに同一fieldがないため直接照合しない。

## 37. Main Peak

Planの`isMainPeak: true` Sceneは必ず1件とする。

そのSceneの`section`はProjectionとDecisionの`mainPeakSection`に一致させる。

Sceneが保持する明示fieldを使い、ratio位置からPeakを推測しない。

Peak Sceneのnarrative purposeをGateが書き換えない。

現行型ではPeak treatmentはProjectionにのみ存在する。

Planとのtreatment一致は検証不能であり、Adapter mappingの責務である。

## 38. Afterglow and Outro

Planの`isAfterglow: true` Sceneは必ず1件とする。

そのSceneは配列の最終要素でなければならない。

Sectionは`outro`でなければならない。

`narrativePurpose`は`afterglow`でなければならない。

PlanにはAfterglow treatment fieldがない。

ProjectionのtreatmentとScene action等の意味的対応をGateが推測しない。

## 39. Continuity Validation

Gateは既存`continuity` shapeを構造検証できる。

Temporal transitionの`fromSceneId`と`toSceneId`はPlan内Sceneを参照しなければならない。

参照先IDをResultへ出さない。

Character、Location、Motifの創作的妥当性は判定しない。

Continuity fallbackの品質判断はPlanner validationとreview flagを正とする。

## 40. Asset Slots

現行Sceneは`assetRefs: SceneAssetReference[]`を持つ。

Gateは各entryの`assetId`と`role`のshapeを検証する。

同一Scene内の同一Asset/role重複はinvalid候補とする。

ただしGate InputにWorkflow Asset inventoryがない。

そのためAssetの存在、kind、required/optional、usage、availabilityは検証不能である。

実Asset照合はReference MV AdapterとAsset Resolverの責務を維持する。

## 41. Output Constraints

Planが保持するoutput関連fieldはdurationとaspect ratioである。

resolution、frame rate、output formatはPlanにもGate Inputにも存在しない。

したがってGate V1はそれらを検証しない。

Provider capability compatibilityも検証しない。

unsupported output constraintをreview/blockedへ推測mappingしない。

Adapterの既存Capability validationを正とする。

## 42. Plan Validation Mapping

| Plan validation | Plan reviewRequired | Foundation result |
|---|---:|---|
| valid | false | 全検証成功ならready |
| valid | true | review-required |
| normalized | true | review-required |
| fallback | true | review-required |
| invalid | 任意 | blocked-invalid |

normalized/fallbackなのに`reviewRequired: false`ならPlan自己矛盾としてinvalidとする。

`valid + reviewRequired: true`を自動承認しない。

## 43. Pure Factory

正式関数候補は次である。

```ts
function createMVScenePlanGate(
  input: MVScenePlanGateInput,
): MVScenePlanGateResult;
```

関数はsynchronous、pure、deterministic、non-mutatingとする。

例外を外へ投げずsafe Resultを返す。

Store、Network、Date、Random、env、filesystemを使わない。

## 44. Reason Codes

Foundation V1は既存unionを変更しない。

canonical順は既存宣言順とする。

```text
scene-plan-invalid
scene-plan-review-pending
scene-plan-rejected
scene-plan-normalized-review-required
scene-plan-fallback-review-required
scene-plan-approval-stale
scene-plan-approved
scene-plan-ready
```

同一codeは1回だけ返す。

## 45. Foundation Reason Usage

Foundation factoryが発行できるcodeは限定する。

```text
scene-plan-invalid
scene-plan-review-pending
scene-plan-normalized-review-required
scene-plan-fallback-review-required
scene-plan-ready
```

Approval入力がないため`approved`、`rejected`、`approval-stale`は発行しない。

構造不正の詳細codeは現行unionにないため、V1では`scene-plan-invalid`へ安全に集約する。

## 46. Issue and Audit

現行ResultにはIssueまたはAudit fieldがない。

Foundation V1では別の公開Issue/Audit envelopeを追加しない。

テスト内部のsafe diagnosticsは次に限定する。

```text
derived status
scene count
gap count
overlap count
reason codes
```

Scene本文、Scene ID、Asset ID、Story、Lyrics、Prompt、Reference、Credential、Provider、tenant、raw errorを禁止する。

## 47. Normalization

許可するnormalizationはReason Codeの重複除去とcanonical順だけである。

safe countは計算してもResultへ追加しない。

禁止事項:

```text
Scene並べ替え
時間修正
duration補正
Scene生成
Peak挿入
Afterglow挿入
Asset slot追加
Projection書換え
Decision書換え
```

## 48. Determinism

同一Inputでは`allowed`、`reviewRequired`、Reason順が同一になる。

Object field順に依存しない。

Scene array順はsemanticとして維持する。

ContextのoperationRef値によってGate判定を変えない。

外部時刻やprocess stateを参照しない。

## 49. Mutation Isolation

Gateは次を変更しない。

```text
plan
projection
decision
policy
context
```

配列をsortしない。

重複確認にはSet等のローカル状態を使用する。

Result配列を変更してもInput配列へ影響しない。

Registryはfreezeしたsourceからcopyを返す。

## 50. Sensitive Boundary

Plan、Projection、Decisionは内部入力であり、通常ログへ出さない。

Gate Resultは本文を保持しないためsecret-freeな最小結果にできる。

Issue、Audit、DescriptorにもScene本文やAsset IDを含めない。

既存`Sensitive<T>`を型だけで利用する余地はあるが、Foundation Gate Resultには不要である。

runtime brandは追加しない。

## 51. Versioning

Gate Input、Policy、Contextはそれぞれ`1.0`を持つ。

既存Gate Resultにはversion fieldがない。

Reason Codeにも独立version fieldはない。

Result shapeまたはstatus追加は既存Adapter互換性に影響するためV2候補とする。

unknown majorを暗黙受理しない。

migrationは別のpure functionで明示する。

## 52. Existing Type Compatibility

正常な`valid + review不要` PlanをAdapterへ接続するだけなら、既存`MVScenePlanGateResult`を変更せずfactory追加が可能である。

review-requiredを停止として表すことも既存booleanで可能である。

一方、approved、rejected、staleの真正な判定にはApproval/Fingerprint Inputが不足する。

Resultにもstatus、version、auditがない。

したがってFoundation V1はstructural auto gateに限定し、approval-aware gateは別ContractまたはV2とする。

## 53. Adapter Connection

実コード上の接続fieldは次である。

```ts
const sceneResult = createMVScenePlan(sceneInput);
if (sceneResult.status !== "planned") {
  // safe failure; Adapterを呼ばない
}
const gate = createMVScenePlanGate({
  gateVersion: "1.0",
  plan: sceneResult.plan,
  projection,
  decision,
  policy,
  context,
});
```

`ReferenceMVAdapterInput`には`projection`、`scenePlan`、`gate`、`assets`、`constraints`、`capability`を渡す。

Adapterは`gate.allowed !== true`を`scene-plan-gate-denied`として拒否する。

## 54. Adapter Defensive Validation

Gate通過はAdapter validationの代替ではない。

Adapterはtimeline、duration、aspect、Peak、Afterglow、Asset、Capabilityを再検証する。

Gateが`allowed: true`でもAdapterがinvalid、unsupported、degradedを返し得る。

GateはAdapter statusを事前に保証しない。

GateとAdapterの重複する構造検証は防御境界として許容する。

## 55. Workflow Mapping

Workflow Resultへの正式mappingは今回の対象外である。

将来候補は次である。

```text
ready → Adapterへ進む
review-required → Adapterを呼ばずreview境界へ
blocked-invalid → safe failed
```

現行Workflowにmanual review statusを新設しない。

degraded mapping、queue、retryは別Integration Contractで決める。

## 56. Approval-aware Gate Separation

既存Planner仕様はfingerprint一致したApprovalを想定する。

しかし現行コードにApproval record、fingerprint型、照合factoryはない。

Foundation V1へ架空の型やhash規則を導入しない。

将来のapproval-aware GateはPlan fingerprint、approval status、対象version、expiry semanticsを別Contractで定義する。

その境界だけが`scene-plan-approved`、`rejected`、`approval-stale`を発行できる。

## 57. Reference Policy

Reference Foundation Policyは次を固定する。

```text
exact contiguous timeline
minimum 5 scenes
single explicit main peak
single final outro afterglow
valid and reviewRequired false only auto-ready
normalized/fallback require review
invalid never allowed
```

これは現行`createMVScenePlan()`の正常なvalid出力を通す。

テスト都合でgap、overlap、missing Peakを許容しない。

## 58. Failure Scenarios

Foundation testsは最低限次を含む。

- valid Plan
- empty scenes
- duplicate Scene ID
- duplicate order
- reversed array order
- negative start
- end before start
- zero duration Scene
- duration overflow
- gap
- overlap
- projection mismatch
- decision mismatch
- missing Peak
- multiple Peaks
- missing Afterglow
- non-final Afterglow
- unsupported version
- malformed root
- unknown root field
- input mutation attempt

## 59. Registry

Foundation候補IDは次である。

```text
reference-mv-scene-plan-gate-v1
```

Descriptor候補:

```ts
type MVScenePlanGateDescriptor = {
  gateId: "reference-mv-scene-plan-gate-v1";
  contractVersion: "1.0";
  supportedPlanSchemaVersion: "1.0";
  supportedProjectionSchemaVersion: "1.0";
  availability: "available" | "disabled";
};
```

## 61. Foundation File Plan

実装候補は次である。

```text
lib/mvSceneGate/types.ts
lib/mvSceneGate/mvSceneGateUtils.ts
lib/mvSceneGate/createMVScenePlanGate.ts
lib/mvSceneGate/mvSceneGateRegistry.ts
```

既存`MVScenePlanGateResult`とReason Codeは`lib/mvContracts.ts`からimportする。

重複型を作らない。

Input、Policy、Context、DescriptorだけをGate moduleが所有する。

## 63. Test Matrix

候補ファイル:

```text
tests/mvSceneGate/mvSceneGateValid.test.ts
tests/mvSceneGate/mvSceneGateInvalid.test.ts
tests/mvSceneGate/mvSceneGateAlignment.test.ts
tests/mvSceneGate/mvSceneGateSecurity.test.ts
tests/mvSceneGate/mvSceneGateStaticContract.test.ts
```

最低300,000の意味あるassertionsを目標とする。

単一assertionの反復で水増ししない。

section、scene count、duration、Peak位置、Afterglow、mutationの組合せを系統的に生成する。

## 65. Canonical Fixture Connection

Gate Foundation完成後の正式経路は次である。

```text
Canonical Director Fixture
→ MV Decision Projection
→ MV Scene Plan
→ MV Scene Plan Gate
→ ReferenceMVAdapterInput
```

Canonical FixtureはGate Resultを手書きしない。

`createMVScenePlanGate()`の`allowed: true`結果だけを使用する。

review-requiredを成功fixtureとして自動承認しない。

## 66. Canonical Fixture Restart Conditions

再開条件は次のすべてである。

- pure Gate factoryがexport済み
- existing Result型を直接返す
- valid canonical Planがreadyになる
- Adapter runtime validationが通る
- `as any`、`unknown as`、直接castが不要
- no mutation testsが通る
- static boundary testsが通る
- Gate理由へAsset ID等が出ない

Approval-aware機能はcanonical valid fixture再開の必須条件ではない。

## 67. Production Provider Boundary

このGateはReference／Production共通の構造validation候補である。

次は含めない。

```text
Provider content moderation
copyright review
brand safety adjudication
billing
upload readiness
Provider API capability
regional availability
```

必要な場合は別GateまたはAdapter boundaryとする。

## 70. Open Questions

1. review-requiredのWorkflow Result mapping owner。
2. manual review queue owner。
3. Approval recordの正式型とStore owner。
4. Plan fingerprintのcanonicalizationとhash owner。
5. Approval staleの時間またはversion判定。
6. gap／overlapを将来許可するか。
7. Scene unknown fieldをV1で厳格拒否するか。
8. Asset slot完全性をGate Inputへ追加するか。
9. output constraintsをGate Inputへ追加するか。
10. Gate Result persistence owner。
11. Gate Audit owner。
12. 現行Resultを維持するかstatus付きV2へ移行するか。

## 72. Readiness

| Item | Decision | Reason |
|---|---|---|
| Gate Contract設計 | complete | pure structural boundaryを固定した |
| Pure Foundation実装 | possible | 現行Plan/Decision/Projectionで検証可能 |
| Existing Result互換性 | conditional | auto-ready/review/invalidは表現可能 |
| Adapter接続 | possible | `allowed: true`を既存fieldへ渡せる |
| Canonical Fixture再開 | Gate Foundation後に可能 | hand-written Gateを除去できる |
| Workflow接続 | not ready | review mappingが未確定 |
| Approval-aware Gate | not ready | Approval/Fingerprint Contract不足 |
| Production利用 | not ready | integration、audit、review owner未確定 |
