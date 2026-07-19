# MV Scene Planner Contract Specification V1

## 1. Purpose

MV Scene Plannerは、Story / Lyrics / Themeと`MVDecisionProjection`を、Provider非依存の`MVScenePlan`へ変換する中間レイヤーである。

このレイヤーが答える問いは次である。

```text
曲の各セクションで、物語上「何を映すか」。
```

Scene PlannerはSceneの内容、順序、継続性、素材割当を決める。Camera、Lens、Shot、Provider Prompt、API Requestは決めない。V1はRule-based Reference Plannerを想定し、同一入力から同一Planを返す安定Contractを定義する。

## 2. Design Philosophy

### Creator First

クリエイターはStory、Lyrics、Themeなど「何を作るか」を入力する。Shot ListやCamera設定を通常UIで要求しない。

### Director Logic First

Scene Plannerは文章分割器ではない。既に決定されたSection Purpose、mainPeak、afterglow、MV Directionを尊重し、物語内容を映像Sceneへ配置する。感情や演出判断を再決定しない。

### Provider Independent

Planに実在Provider、モデル、API field、固有Camera Command、Prompt構文を含めない。Provider CapabilityによってPlanを変えない。

### Separation of Content and Direction

```text
Scene Planner: 何を映すか
DirectorDecision: どう見せるか
MV Adapter / Shot Planner: どう撮影・生成指示へ落とすか
```

### Human Review by Default

Scene Planは動画生成前に読み取り専用Previewで確認できる。fallback、低confidence、continuity不足、安全性フラグはReview必須とする。

### Deterministic Foundation

Reference Plannerは時刻、乱数、UUID、Networkを使わない。将来LLMを利用しても、出力Contractとvalidation境界は維持する。

### Simple UI, Deep Intelligence

通常UIはStory、Theme、Director Preset、Generate、Previewを中心とする。Scene詳細はAdvanced Previewに限定する。

## 3. Scope

V1が定義するもの:

- version付きPlanner Input / Output
- 最小Story / Lyrics Contract
- MV向けDecision Projection
- Scene、Narrative、Subject、Setting、Action、Motif
- 5セクションへのScene割当
- Character / Environment / Temporal continuity
- mainPeak / afterglow反映
- Asset割当
- Timing、Scene ID、Scene Count
- Validation、Confidence、Reason Code、Rationale
- Provider Adapterとの境界
- Review、Security、Versioning

## 4. Non-Goals

V1仕様は以下を実装・決定しない。

- Story Engine、Emotion Engine、Director Decision Engineの実装変更
- StoryやLyricsの完全な再執筆・生成
- mainPeak、afterglow、Vocal/Music/MV Directionの再決定
- Shot List、Angle、Lens、Camera Motion
- Provider Prompt、API Request、Provider選択
- Scene Plannerコード、Reference MV Adapter
- HTTP、Retry、Polling、動画生成
- Lip Sync実行、Publish、Export、Analytics
- 実在人物のIdentity生成、権利・法務判断

## 5. Architecture Position

```text
Story Engine ───────────────┐
                            │ content
Emotion Engine              │
  ↓ EmotionGraph            │
Director Decision Engine    │
  ↓ MVDecisionProjection    │
                            ↓
                     MV Scene Planner
                            ↓ MVScenePlan
                     MV Provider Adapter
                            ↓ Provider Request
                     Provider Client
                            ↓
                     Video Provider
```

Story Engine出力とDirector Decisionは並列入力である。Emotion Engineの生GraphはPlannerへ渡さず、必要な感情・時間情報は`MVDecisionProjection`から受け取る。

## 6. Planner Responsibilities

担当する:

- Story / Lyrics / Themeの構造化入力を読む
- 5セクションとSceneを対応させる
- Scene内容、順序、主題、場所、行動、象徴を決める
- Narrative / Character / Environment / Temporal continuityを設計する
- mainPeak Section内にPrimary Peak Sceneを置く
- Outroにafterglow Sceneを置く
- Reference AssetをSceneへ割り当てる
- Performance ModeをScene構成へ反映する
- Planを検証し、短いReason Codeを残す

担当しない:

- 感情、mainPeak、afterglow、Director Directionの再計算
- Camera / Provider parameterへの変換
- Provider Capabilityへの近似
- Storyに存在しない重大Eventや人物の創作
- Provider通信、生成、運用Job管理

## 7. Planner and Adapter Boundary

Plannerは物語上のSceneを完成させる。Adapterは完成したPlanをProvider能力に合わせてShot / Clip指示へ変換する。

Adapterへ渡す:

- `MVDecisionProjection`
- `MVScenePlan`
- `MVWorkflowAssets`
- `MVGenerationConstraints`
- `MVProviderCapability`

Adapterへ渡さない:

- Raw Story / Lyrics（Planで不要になった場合）
- Planner内部候補、棄却Plan、Chain of Thought
- 内部score、Provider Prompt

AdapterはScene内容、順序、mainPeak、afterglowを再決定しない。Capability不足時はcollapse、approximation、omission、unsupportedとHuman Reviewを使用する。

## 8. Input Contract

```ts
type MVScenePlannerInput = {
  contractVersion: "1.0";
  story: StoryInput;
  lyrics?: LyricsInput;
  theme?: string;
  directorDecision: MVDecisionProjection;
  assets: MVScenePlannerAssets;
  constraints: MVScenePlannerConstraints;
};
```

InputはProvider Credential、URL、Prompt、Capabilityを持たない。現行画面の自由文Storyは`StoryInput.summary`へ格納する。

## 9. Story Input

```ts
type StoryInput = {
  schemaVersion: "1.0";
  summary: string;
  characters?: StoryCharacter[];
  setting?: StorySetting;
  events?: StoryEvent[];
  pointOfView?: "first-person" | "third-person" | "observational";
  endingIntent?: "resolved" | "open" | "circular" | "transformative";
};

type StoryCharacter = {
  characterId: string;
  role: "protagonist" | "supporting" | "antagonistic-force" | "performer";
  safeLabel: string;
};

type StorySetting = {
  environment: EnvironmentType;
  locationRef?: string;
};

type StoryEvent = {
  eventId: string;
  order: number;
  kind: "establish" | "change" | "conflict" | "reveal" | "choice" | "resolution";
  summary: string;
  characterRefs?: string[];
};
```

`summary`はV1で必須だが、空の場合はStoryなしとして扱う。`safeLabel`やevent summaryは短い内容表現であり、Promptではない。将来Story Engineが構造化出力を提供してもschemaをversion更新して移行できる。

## 10. Lyrics Input

```ts
type LyricsInput = {
  schemaVersion: "1.0";
  fullText?: string;
  language?: string;
  sections?: LyricsSection[];
};

type LyricsSection = {
  section: EmotionSectionName;
  summary: string;
  keywords?: string[];
};
```

- Lyricsは任意。Storyがあれば補助入力とする。
- 全文は必須ではなく、section summaryだけでもよい。
- StoryとLyricsが矛盾する場合、Storyの事実・人物を優先し、Lyricsはmotifとemotional nuanceに限定する。
- section情報がある場合は対応Section内だけで利用する。
- 原文をScene Plan、Rationale、Auditへ複製しない。
- StoryもLyricsも空の場合は`invalid`。Storyが空でLyricsがあれば`fallback` Planを許可する。

## 11. MV Decision Projection

```ts
type MVDecisionProjection = DecisionProjectionBase & {
  direction: MVDirection;
};

function createMVDecisionProjection(
  decision: DirectorDecision,
): MVDecisionProjection;
```

保持する:

- schema / engine version、preset
- overall direction、mainPeak、afterglow、confidence
- 5 section directions
- MV direction
- validation

保持しない:

- Vocal Direction
- Music Direction
- Rationale全文

Helperは将来実装し、既存Projectionと同様にdeep copyする。PlannerはProjectionのmainPeakやafterglowを変更しない。

## 12. Workflow Assets

```ts
type MVScenePlannerAssets = {
  referenceImages?: AssetReference[];
  referenceVideo?: AssetReference;
  characterAssets?: CharacterAssetReference[];
  locationAssets?: LocationAssetReference[];
  brandAssets?: AssetReference[];
  performerAsset?: CharacterAssetReference;
  audioAsset?: AssetReference;
};

type CharacterAssetReference = {
  characterRef: string;
  asset: AssetReference;
  continuityRole: "identity" | "appearance" | "costume";
};

type LocationAssetReference = {
  locationRef: string;
  asset: AssetReference;
};
```

- URL、Base64、Storage Keyを持たず`assetId`で参照する。
- Character/Location refとStory refの整合を検証する。
- Sceneには使用するAsset IDだけを配置する。
- RationaleやAudit SummaryにはAsset IDを置かない。
- 同意、権利、年齢確認済みかはWorkflow Asset Intakeの責務。Plannerは承認済み参照だけを受け取る。

## 13. Constraints

```ts
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
type VisualContinuityMode = "light" | "balanced" | "strict";
type PerformanceMode = "narrative" | "performance" | "hybrid";

type MVScenePlannerConstraints = {
  durationSeconds: number;
  aspectRatio: AspectRatio;
  targetSceneCount?: number;
  maxSceneCount?: number;
  maxCharacterCount?: number;
  maxLocationCount?: number;
  visualContinuityMode?: VisualContinuityMode;
  visualComplexity?: "simple" | "balanced" | "layered";
  performanceMode?: PerformanceMode;
  brandSafety?: "standard" | "strict";
  sensitiveContentMode?: "block" | "review";
  reviewMode?: "required" | "optional";
};
```

DurationとAspect Ratioは必須。Resolution、Frame Rate、codec、Provider clip上限はScene内容に不要なので含めない。Character/Location上限は物語複雑度の制約でありProvider制限ではない。

## 14. Output Contract

```ts
type MVScenePlan = {
  schemaVersion: "1.0";
  plannerVersion: "rule-v1";
  sourceDecisionSchemaVersion: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  narrativeArc: NarrativeArc;
  continuity: ContinuityPlan;
  scenes: MVScene[];
  rationale: MVScenePlanRationale;
  validation: MVScenePlanValidation;
  confidence: number;
  reviewRequired: boolean;
};

type MVScenePlannerResult =
  | { status: "planned"; plan: MVScenePlan }
  | {
      status: "invalid";
      plan?: never;
      validation: MVScenePlanValidation;
      confidence: 0;
      reviewRequired: false;
    };
```

`createMVScenePlan()`は`MVScenePlannerResult`を返す。StoryとLyricsが両方ない場合などは、Sceneを持つ見かけ上のPlanを作らず`status: "invalid"`の安全なResult Envelopeを返す。`createdAt`、random seed、保存Record ID、Provider情報を含めない。Planは生成素材を含み得るため、全体を無制限な通常ログへ保存しない。

## 15. Scene Contract

```ts
type MVScene = {
  sceneId: string;
  order: number;
  section: EmotionSectionName;
  startRatio: number;
  endRatio: number;
  startSeconds: number;
  endSeconds: number;
  narrativePurpose: SceneNarrativePurpose;
  subject: SceneSubject;
  setting: SceneSetting;
  action: SceneAction;
  emotionalIntent: SupportedEmotion;
  temporalMode: TemporalMode;
  visualMotif?: VisualMotif;
  continuityRefs: ContinuityReference[];
  assetRefs: SceneAssetReference[];
  isMainPeak: boolean;
  isAfterglow: boolean;
  reviewNotes?: SceneReviewNote[];
};

type ContinuityReference = {
  kind: "character" | "location" | "motif" | "temporal";
  ref: string;
  relation: "preserve" | "return" | "progress" | "contrast";
};

type SceneAssetReference = {
  assetId: string;
  role: "subject" | "identity" | "location" | "motif" | "style-reference";
};

type SceneReviewNote = {
  code: MVScenePlannerReasonCode;
  summary: string;
};
```

主要意味はunionと参照で保持する。補助descriptionは短くし、Story/Lyrics原文やProvider Promptを格納しない。

## 16. Scene ID

```text
scene-{section}-{section内1始まり2桁連番}
```

例:

```text
scene-verse-01
scene-chorus-02
scene-outro-01
```

正式Section順、Scene順から決定し、UUIDやhashを使わない。保存Record IDはWorkflow Envelopeが別に所有する。

## 17. Section and Scene Relationship

- 各Sectionに最低1 Sceneを必須とする。
- 1 Sectionに複数Sceneを許可する。
- SceneはSection境界をまたがない。
- Scene比率はSection比率を連続分割する。
- Primary Peak SceneはmainPeak Section内に1件だけ置く。
- Outro最終Sceneはafterglowを必須とする。
- mainPeakがOutroなら同一SceneがPeakとAfterglowを兼ねてもよい。
- Bridge PeakでもSectionを増減せず、Bridge内の配分だけを変える。
- `shotDensity`はScene Countの弱い補正にだけ使い、Shot数へ直接変換しない。

## 18. Scene and Shot Boundary

```text
Scene
- 物語上の意味単位
- 主体、場所、行動、感情、役割

Shot
- Camera単位
- Angle、Lens、Motion、Framing、Shot Duration
```

Scene PlannerはSceneまでを作る。Shot PlannerまたはMV AdapterがSceneをShot / Clipへ展開する。Scene PlanにLens、Camera API値、固有Motion token、Shot Promptを含めない。

## 19. Narrative Arc

```ts
type NarrativeArc =
  | "linear"
  | "memory-fragment"
  | "parallel"
  | "circular"
  | "transformation"
  | "symbolic"
  | "performance-driven";
```

固定決定順:

1. `performance` modeなら`performance-driven`
2. Story endingがcircularなら`circular`
3. memory eventや観測可能な回想構造があれば`memory-fragment`
4. 複数の明示的並行subjectがあれば`parallel`
5. change/choiceとtransformative endingがあれば`transformation`
6. Storyが弱くmotif中心なら`symbolic`
7. それ以外は`linear`

DirectorのNarrative Directionは同点時の固定補助に使い、PresetからStory事実を変更しない。

## 20. Scene Narrative Purpose

```ts
type SceneNarrativePurpose =
  | "establish"
  | "introduce-subject"
  | "develop"
  | "contrast"
  | "reveal"
  | "turn"
  | "climax"
  | "release"
  | "resolve"
  | "afterglow"
  | "perform";
```

Section Purposeとの既定対応:

```text
establish → establish / introduce-subject
build     → develop / contrast
release   → reveal / release
turn      → turn / contrast
climax    → climax
resolve   → resolve / afterglow
```

PlannerはSection Purposeを覆さず、複数Sceneへ具体化する。

## 21. Subject Contract

```ts
type SceneSubject =
  | { type: "character"; characterRef: string }
  | { type: "object"; objectKind: string; safeDescription?: string }
  | { type: "environment"; environment: EnvironmentType }
  | { type: "abstract"; motif: VisualMotif }
  | { type: "performance"; performerRef?: string }
  | { type: "none" };
```

未知Characterを新規Identityとして創作せず、既知のprotagonist、environment、abstract motifの順でfallbackする。実在人物のIdentityや外見生成は別レイヤーで扱う。

## 22. Setting Contract

```ts
type EnvironmentType =
  | "home" | "room" | "street" | "city" | "nature"
  | "shore" | "stage" | "studio" | "transit"
  | "abstract-space" | "unspecified";

type SceneSetting = {
  environment: EnvironmentType;
  locationRef?: string;
  timeOfDay?: "dawn" | "day" | "dusk" | "night" | "timeless";
  weather?: "clear" | "clouded" | "rain" | "snow" | "mist" | "none";
  spaceType?: "interior" | "exterior" | "mixed" | "abstract";
};
```

Location Promptは保持しない。`locationRef`はStoryまたはAsset Contract内の安定参照だけを指す。

## 23. Action Contract

```ts
type SceneActionType =
  | "observe" | "move" | "search" | "remember" | "choose"
  | "connect" | "separate" | "reveal" | "transform"
  | "perform" | "pause" | "depart" | "arrive";

type SceneAction = {
  actionType: SceneActionType;
  safeDescription?: string;
  direction?: "toward" | "away" | "across" | "still";
  interaction?: "none" | "environment" | "object" | "character" | "audience";
};
```

主要意味は`actionType`で保持する。descriptionは短い補助で、Camera motionやPromptではない。

## 24. Visual Motif

```ts
type BuiltInVisualMotif =
  | "light" | "rain" | "mirror" | "road" | "flower" | "sky"
  | "water" | "fire" | "shadow" | "door" | "photograph"
  | "empty-room";

type VisualMotif =
  | { kind: BuiltInVisualMotif }
  | { kind: "custom"; motifId: string; safeLabel: string };
```

customは80文字以下のsafe labelと安定IDを要求し、URL、個人情報、Provider構文を禁止する。Motifはcontinuity用の抽象表現である。

## 25. Character Continuity

```ts
type CharacterContinuity = {
  characterRef: string;
  identityIntent: "preserve";
  appearanceIntent: "stable" | "story-change";
  costumeIntent: "stable" | "section-change" | "story-change";
  stateProgression: CharacterStateChange[];
};

type CharacterStateChange = {
  section: EmotionSectionName;
  state: "stable" | "distressed" | "resolute" | "released";
};
```

- Character refは全Sceneで同一Identityを指す。
- 年齢やIdentityをSceneごとに再生成しない。
- 外見・衣装変化はStory eventとして明示された場合だけ許可する。
- CharacterなしScene、複数Character、Performanceとの併存を許可する。
- Assetがない場合もcontinuity intentは保持し、Reviewを要求する。
- ProviderのCharacter Consistency能力不足はAdapterが処理する。

## 26. Environment Continuity

```ts
type EnvironmentContinuity = {
  primaryLocationRef?: string;
  repeatedLocationRefs: string[];
  timeProgression: "stable" | "forward" | "nonlinear" | "timeless";
  weatherProgression: "stable" | "change-on-event";
  afterglowLocationRule: "preserve-final" | "return-origin" | "symbolic-space";
};
```

場所、時刻、天候の変化はeventまたはtemporal modeに結び付ける。Memory Sceneは`temporalMode`で区別し、新しい場所を無制限に増やさない。Reference Image非対応はAdapter側の問題である。

## 27. Temporal Continuity

```ts
type TemporalMode =
  | "present" | "flashback" | "dream" | "memory"
  | "parallel" | "time-jump" | "loop";

type TemporalContinuity = {
  defaultMode: TemporalMode;
  allowedTransitions: Array<{
    fromSceneId: string;
    toSceneId: string;
    kind: "continue" | "flashback" | "return" | "parallel-cut" | "loop-close";
  }>;
};

type ContinuityPlan = {
  characters: CharacterContinuity[];
  environment: EnvironmentContinuity;
  temporal: TemporalContinuity;
};
```

Temporal transitionはScene順を変更せず意味を示す。Provider transition commandは含めない。

## 28. Performance Scene

`performanceMode`はWorkflow Constraintとして受け取る。

- narrative: 原則すべて物語Scene
- performance: 各Section最低1 performance Scene
- hybrid: verseまたはpre-chorus、mainPeak、outroの固定優先順でperformance Sceneを配置

PlannerはVocal/Music Directionを直接参照しない。Lip Sync要否、音素、歌唱生成は後段Contractで扱う。performer Asset不足時はperformance subjectを保持しReviewを要求する。

## 29. Scene Count

V1規則:

```text
minimum = 5（各Section 1）
base = clamp(round(durationSeconds / 20), 5, 12)
movement dynamic か shotDensity >= 67 なら +1
movement still か shotDensity <= 32 なら -1（5未満不可）
hybrid なら performance配置に必要な範囲で最大 +2
targetSceneCount指定時は [5, max] へclamp
default max = 14
```

同点の追加順は`mainPeak → pre-chorus → bridge → verse → outro`。afterglow用Outro Sceneは削除しない。最小Scene長はV1で6秒とし、満たせない場合はScene数を減らす。Provider clip上限は参照しない。

## 30. Timing

PlanはRatioとSecondsを両方持つ。

- Duration所有元はPlanner Constraints。
- Section ratioはProjectionを正とする。
- Section内Sceneはratioを決定的に等分し、役割が複数ならPeak/Afterglow側へ最大10%重み付けできる。
- Ratioは小数第6位、Secondsも小数第6位。
- 最初は0、最後はduration。
- 各Scene startは直前endと同値。
- 隙間、重複、Section跨ぎなし。
- duration変更時はPlannerを再実行し、Adapterは物語Timingを再創作しない。

Provider Adapter共通Timeline UtilityはSection境界の検証に再利用できる。Scene内分割用Utilityは将来Planner側へ追加し、Provider固有ロジックを入れない。

## 31. Main Peak Handling

- `overallDirection.mainPeakSection`を変更しない。
- `isMainPeak=true`のPrimary Peak Sceneを全Planで1件に固定する。
- 対象Section内の最後のrelease/climax Sceneを既定Peakとする。
- Chorus Peakはreleaseまたはclimax、Bridge Peakはturn/reveal/climax、Outro Peakはresolveとafterglowの共存を許可する。
- 静かなPeakでもactionを無理に激しくせず、物語上のreveal、choice、connection、pauseで強調できる。
- visual intensityはScene内容の候補選択順を補助するが、感情やPeak位置を再計算しない。
- AdapterはPeakを移動しない。

## 32. Afterglow Handling

- Outro最終Sceneを`isAfterglow=true`にする。
- Afterglow Sceneは1件以上、V1 Reference Planでは1件に固定する。
- DirectorDecisionのemotion、intensity、releaseStyleを変更しない。
- releaseStyleをSubject/Actionの固定候補へ写像する。

```text
warm       → subject remains / connect or pause
quiet      → reduced action / observe or pause
hopeful    → light/sky / arrive or move toward
empty      → environment or none / depart or pause
inspired   → subject remains / choose or move toward
bittersweet→ photograph/memory / observe or depart
```

mainPeakがOutroなら同一Sceneが両flagを持てる。unresolved endingはStoryのopen intentまたはempty/bittersweetに限り許可する。

## 33. Validation

```ts
type MVScenePlanValidationStatus =
  | "valid" | "normalized" | "fallback" | "invalid";

type MVScenePlanValidation = {
  status: MVScenePlanValidationStatus;
  issueCodes: MVScenePlannerIssueCode[];
};
```

検証する:

- contract/schema/version
- Story/Lyricsの最低1入力
- duration、aspect ratio、scene count
- Scene ID一意性、order、正式Section順
- ratio/seconds有限・範囲・連続性
- start < end、0開始、duration終了
- 各Section最低1Scene
- Primary Peak 1件とmainPeak Section一致
- Outro Afterglow存在
- emotion、purpose、subject、setting、action union
- Character/Location/Asset/Continuity ref整合
- mainPeak/afterglowのDirectorDecision一致
- sensitive content flag

Planner ValidationはProvider Adapter statusと分離する。Provider非対応はPlan validationを変えない。

## 34. Confidence

`confidence`は整数0〜100で、映像品質や創造性ではなく入力・構造の十分さを示す。

V1固定減点:

```text
100から開始
Storyなし・Lyrics fallback      -30
Lyricsなし                      0
DirectorDecision normalized    -10
DirectorDecision fallback      -40、かつ最大50
Character参照fallback           -8/件（最大16）
割当済みAsset不足               -10
continuity fallback             -15
targetから25%以上Scene縮小      -10
mainPeak Scene修復              -20
afterglow Scene修復             -20
Sensitive Content flag          0（Reviewだけを必須化）
```

全減点を加算後0〜100へclampし、最後に`min(calculatedConfidence, directorDecision.confidence)`を適用する。芸術的品質、生成品質、Safety riskの大きさは表さない。Storyあり・Lyricsなしは減点せず、他に問題がなければ`valid`を維持する。

## 35. Reason Codes

```ts
type MVScenePlannerReasonCode =
  | "story-structure-derived"
  | "lyrics-section-aligned"
  | "director-section-aligned"
  | "main-peak-scene-assigned"
  | "afterglow-scene-preserved"
  | "character-continuity-applied"
  | "environment-continuity-applied"
  | "asset-reference-assigned"
  | "performance-scene-inserted"
  | "scene-count-reduced"
  | "scene-count-expanded"
  | "missing-story-fallback"
  | "missing-lyrics-fallback"
  | "unknown-character-fallback"
  | "continuity-fallback"
  | "main-peak-scene-fallback"
  | "afterglow-scene-fallback";
```

Reason CodeはPlannerが採用した設計理由であり、入力や構造の問題を示すIssue Codeとは別である。短く固定し、Chain of Thoughtを表現しない。

## 36. Rationale

```ts
type MVScenePlanSummary = {
  code: MVScenePlannerReasonCode;
  scope: "plan" | "section" | "scene";
  section?: EmotionSectionName;
  sceneId?: string;
  summary: string;
};

type MVScenePlanRationale = {
  reasonCodes: MVScenePlannerReasonCode[];
  summaries: MVScenePlanSummary[];
};
```

Summaryは120文字以下の定型説明とする。Story/Lyrics原文、個人情報、Asset ID、URL、Prompt、内部候補を含めない。

## 37. Determinism

Rule-based V1は次を保証する。

- 時刻、乱数、UUID、外部API、DB、環境変数を参照しない
- 正式Section順、固定同点順
- Scene Count、Motif、Character、Asset割当順を固定
- Scene IDと丸め規則を固定
- 入力配列順に依存する場合はorder/idで安定sort
- 入力を変更せず新しいPlanを返す
- 同一入力とplannerVersionから同一JSON

将来LLM Plannerは生成の完全決定性を保証できない可能性がある。その場合もschema、validation、sanitization、versioningを維持し、model/config versionをplannerVersionへ反映する。

## 38. Provider Capability Boundary

Scene Planner InputにProvider Capabilityを含めない。同じ作品はProviderに関係なく同じPlanを持つ。

Providerがmulti-scene、character consistency、timeline、reference image、first/last frame、camera controlに非対応ならAdapterが次を行う。

```text
exact → approximation → collapse/omission → unsupported
```

必要な近似はMappingとWarningへ残しHuman Reviewを要求する。Scene PlannerはProviderごとのPlanを生成しない。

## 39. Advanced Preview

通常UIでは非表示。読み取り専用Advanced Preview候補:

- Narrative Arc、Scene Count
- Section、Purpose、Subject、Setting、Action
- Main Peak、Afterglow
- Continuity、Motif、Asset割当有無
- Validation、Confidence、Reason Code

Asset ID、Story/Lyrics全文、Prompt、内部scoreは表示しない。V1で編集UIは作らない。

## 40. Human Review

Review必須:

- constraints.reviewModeがrequired
- validation normalized/fallback
- confidence 70未満
- Story fallback、continuity fallback
- Character/Performer Asset不足
- Scene Countがtargetから25%以上縮小
- mainPeak/afterglow fallback
- sensitive content flag
- Performance ModeとAsset不一致
- DirectorDecision normalized/fallback
- validation normalized/fallback
- mainPeak / afterglow Scene修復
- targetから25%以上のScene Count縮小

`valid`でもSensitive Content flag、Performance Asset不足、明示的`reviewMode: "required"`があればReview必須である。`invalid` Resultは生成へ渡さない。`fallback` PlanはReview承認前にAdapterへ渡さない。Review結果の保存やQueueはWorkflow責務である。

## 41. Security and Privacy

- Story/Lyrics全文を通常ログ、Rationale、Audit Summaryへ保存しない。
- Scene補助文へ原文を長く複製しない。
- Asset IDはScene実行参照には保持できるがAudit Summaryには含めない。
- URL、Storage Key、署名URL、Base64、API KeyをPlanへ含めない。
- 実在人物、子ども、Character Assetは権利確認済み参照だけを受け取る。
- Sensitive Content判断は専用Safety Layer。PlannerはflagとReview要求だけを受け取る。
- Providerへは選択Sceneに必要な最小情報・Assetだけを送る。
- Scene Plan retentionはWorkflow/Plan Store、Asset retentionはAsset Storeが管理する。
- Errorはsanitizeし、原文、URL、stack、credentialを含めない。
- Region / Data ResidencyはWorkflow PolicyとProvider Selectionの責務。

法務判断は本Contractの範囲外であり、技術的データ最小化境界だけを定義する。

## 42. Versioning

管理するversion:

- Planner Input contractVersion
- Story / Lyrics schemaVersion
- DirectorDecision schemaVersion
- Scene Plan schemaVersion
- plannerVersion
- Asset Reference schemaVersion（将来導入）
- MV Adapter contract/adapter/capability version

規則:

- 未知majorはunsupportedまたはinvalidとして生成停止。
- optional field追加はminor互換を許可。
- Scene Count、Timing、fallback、ID規則変更はplannerVersion更新。
- 出力shape変更はScene Plan schema major/minorを更新。
- 保存済みPlanは元versionで読める限り再利用可能。
- Migrationは純粋関数として別実装し、暗黙変換しない。
- 異なるplannerVersionでの再生成は新PlanとしてReview対象にする。

## 43. Example Input

```ts
const input: MVScenePlannerInput = {
  contractVersion: "1.0",
  story: {
    schemaVersion: "1.0",
    summary: "失った記憶を抱えながら朝へ進む物語",
    characters: [{
      characterId: "protagonist",
      role: "protagonist",
      safeLabel: "旅を続ける人物",
    }],
    endingIntent: "transformative",
  },
  lyrics: {
    schemaVersion: "1.0",
    language: "ja",
    sections: [{
      section: "chorus",
      summary: "過去を受け入れて前へ進む",
    }],
  },
  theme: "記憶から希望への移行",
  directorDecision: mvDecisionProjection,
  assets: {
    referenceImages: [],
  },
  constraints: {
    durationSeconds: 180,
    aspectRatio: "16:9",
    performanceMode: "narrative",
    visualContinuityMode: "balanced",
  },
};
```

## 44. Example Output

以下は説明を短くした7 Scene例である。Camera API値やProvider Promptは含まない。

```ts
const plan: MVScenePlan = {
  schemaVersion: "1.0",
  plannerVersion: "rule-v1",
  sourceDecisionSchemaVersion: "1.0",
  durationSeconds: 180,
  aspectRatio: "16:9",
  narrativeArc: "transformation",
  continuity: {
    characters: [{
      characterRef: "protagonist",
      identityIntent: "preserve",
      appearanceIntent: "stable",
      costumeIntent: "stable",
      stateProgression: [],
    }],
    environment: {
      repeatedLocationRefs: [],
      timeProgression: "forward",
      weatherProgression: "stable",
      afterglowLocationRule: "preserve-final",
    },
    temporal: { defaultMode: "present", allowedTransitions: [] },
  },
  scenes: [
    {
      sceneId: "scene-verse-01", order: 1, section: "verse",
      startRatio: 0, endRatio: 0.22,
      startSeconds: 0, endSeconds: 39.6,
      narrativePurpose: "introduce-subject",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "room", timeOfDay: "night", spaceType: "interior" },
      action: { actionType: "remember", direction: "still", interaction: "object" },
      emotionalIntent: "nostalgia", temporalMode: "present",
      visualMotif: { kind: "photograph" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: false,
    },
    {
      sceneId: "scene-pre-chorus-01", order: 2, section: "pre-chorus",
      startRatio: 0.22, endRatio: 0.4,
      startSeconds: 39.6, endSeconds: 72,
      narrativePurpose: "develop",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "street", timeOfDay: "dawn", spaceType: "exterior" },
      action: { actionType: "search", direction: "toward", interaction: "environment" },
      emotionalIntent: "hope", temporalMode: "present",
      visualMotif: { kind: "light" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: false,
    },
    {
      sceneId: "scene-chorus-01", order: 3, section: "chorus",
      startRatio: 0.4, endRatio: 0.55,
      startSeconds: 72, endSeconds: 99,
      narrativePurpose: "reveal",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "street", timeOfDay: "dawn", spaceType: "exterior" },
      action: { actionType: "choose", direction: "toward", interaction: "environment" },
      emotionalIntent: "determination", temporalMode: "present",
      visualMotif: { kind: "road" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: false,
    },
    {
      sceneId: "scene-chorus-02", order: 4, section: "chorus",
      startRatio: 0.55, endRatio: 0.7,
      startSeconds: 99, endSeconds: 126,
      narrativePurpose: "climax",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "street", timeOfDay: "dawn", spaceType: "exterior" },
      action: { actionType: "transform", direction: "toward", interaction: "environment" },
      emotionalIntent: "hope", temporalMode: "present",
      visualMotif: { kind: "light" }, continuityRefs: [], assetRefs: [],
      isMainPeak: true, isAfterglow: false,
    },
    {
      sceneId: "scene-bridge-01", order: 5, section: "bridge",
      startRatio: 0.7, endRatio: 0.87,
      startSeconds: 126, endSeconds: 156.6,
      narrativePurpose: "turn",
      subject: { type: "object", objectKind: "photograph" },
      setting: { environment: "abstract-space", timeOfDay: "timeless", spaceType: "abstract" },
      action: { actionType: "remember", direction: "still", interaction: "object" },
      emotionalIntent: "nostalgia", temporalMode: "memory",
      visualMotif: { kind: "photograph" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: false,
    },
    {
      sceneId: "scene-outro-01", order: 6, section: "outro",
      startRatio: 0.87, endRatio: 0.94,
      startSeconds: 156.6, endSeconds: 169.2,
      narrativePurpose: "resolve",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "street", timeOfDay: "day", spaceType: "exterior" },
      action: { actionType: "arrive", direction: "toward", interaction: "environment" },
      emotionalIntent: "hope", temporalMode: "present",
      visualMotif: { kind: "road" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: false,
    },
    {
      sceneId: "scene-outro-02", order: 7, section: "outro",
      startRatio: 0.94, endRatio: 1,
      startSeconds: 169.2, endSeconds: 180,
      narrativePurpose: "afterglow",
      subject: { type: "character", characterRef: "protagonist" },
      setting: { environment: "street", timeOfDay: "day", spaceType: "exterior" },
      action: { actionType: "pause", direction: "still", interaction: "environment" },
      emotionalIntent: "hope", temporalMode: "present",
      visualMotif: { kind: "sky" }, continuityRefs: [], assetRefs: [],
      isMainPeak: false, isAfterglow: true,
    },
  ],
  rationale: {
    reasonCodes: [
      "director-section-aligned",
      "main-peak-scene-assigned",
      "afterglow-scene-preserved",
    ],
    summaries: [{
      code: "main-peak-scene-assigned",
      scope: "scene",
      section: "chorus",
      sceneId: "scene-chorus-02",
      summary: "Primary peak was assigned within the directed peak section.",
    }],
  },
  validation: { status: "valid", issueCodes: [] },
  confidence: 95,
  reviewRequired: false,
};
```

## 45. Edge Cases

| Case | V1 handling |
|---|---|
| Storyなし、Lyricsあり | lyrics-derived symbolic fallback、Review |
| Lyricsなし、Storyあり | validまたはnormalized。Lyrics欠落だけでinvalidにしない |
| 両方なし | invalid、Plan生成停止 |
| 短いDuration | 5 Sceneを優先。各6秒未満ならinvalid |
| 長いDuration | maxSceneCountまで。Shot増加は後段 |
| Characterなし | environment/abstract subject |
| Character Assetなし | continuity intent維持、Review |
| 複数Character | maxCharacterCountとStory orderで固定選択 |
| Reference Imageなし | Plan内容は変更しない |
| Chorus/Bridge/Outro Peak | 指定Section内にPrimary Peak 1件 |
| Hope/Empty Afterglow |既定mappingでOutro最終Sceneへ反映 |
| Performance only | 各Sectionにperformance Scene |
| Narrative only | performance subjectを挿入しない |
| Hybrid | 固定優先Sectionへperformance Scene |
| Asset Reference不正 | invalid |
| Scene Count上限 | mainPeak/afterglowを守って縮小、Review条件判定 |
| Scene Count下限 | 各Section1件、5未満はinvalid |
| Continuity不能 | fallback + Review。Provider不足ならAdapter degradation |
| Sensitive Content | blockならinvalid、reviewならfallback/Review |
| DirectorDecision fallback | Plan fallback、confidence最大50、Review |

## 46. MVP Implementation Plan

候補ファイル:

```text
lib/mvScenePlanner.ts
components/MVScenePlanPreview.tsx
```

型が実装ファイルを圧迫する場合のみ:

```text
lib/mvScenePlannerTypes.ts
```

推奨順:

1. Contract型とvalidation
2. `createMVDecisionProjection()`
3. Rule-based Reference Scene Planner
4. Timing / ID / Scene Count pure utility
5. Provider-neutral fixtures
6. 決定性、mutation、security、edge matrix
7. 読み取り専用Advanced Preview

最初はRule-based Foundationとする。LLM導入前にContractと責務境界を固定し、同一fixtureで将来Plannerを比較できるようにする。

## 47. Reference MV Adapter Integration

次段階の入力:

```text
MVDecisionProjection
+ MVScenePlan
+ MVWorkflowAssets
+ MVGenerationConstraints
+ Reference MV Capability
↓
Reference MV Adapter
```

接続規則:

- Scene Plan invalid: Adapter Input invalid、Requestなし
- Scene Plan fallback: 原則Review承認必須。承認済みならAdapter degraded
- Scene Plan normalized: Adapter degraded + Review
- Scene Plan valid: Capability Mapping結果でready/degraded/unsupportedを決定
- AdapterはSceneを創作せず、順序・Peak・Afterglowを維持
- multi-scene/timeline/reference asset非対応はMappingへ記録
- Provider Prompt RendererはAdapter後段のversion付き別責務

## 48. Future Extensions

- version付きStory Engine Contract
- Lyrics alignment / timestamp Contract
- Shot Planner
- Lip Sync Plan
- LLM Scene Plannerとschema-constrained validation
- Scene alternative候補とReview差分
- Brand / Character continuity policy
- Safety Layer integration
- Scene Plan migration/replay
- Plan quality evaluation。ただしDirector Logicとは分離
- Collaborative Scene Review

## 49. Open Questions

1. Story Engine V1が提供する構造化eventの最小粒度。
2. Lyrics section summaryを誰が生成し、どのversionで保持するか。
3. 6秒の最小Scene長を作品尺別に変更するか。
4. `shotDensity`をScene Count補正へ使う閾値を固定するか。
5. Hybrid時のperformance比率をConstraintへ明示するか。
6. Lip Sync要否をScene Planner Constraintへ追加するか、Shot Plannerへ限定するか。
7. Custom Motif safe labelのschemaとSafety Layer境界。
8. Character appearance/costume stateの最小Contract。
9. Scene Plan全体のRetention期間と暗号化範囲。
10. Scene Plan fallbackのReview承認Envelope。
11. Story/Lyrics矛盾を検出する責務をStory EngineとPlannerのどちらに置くか。
12. Reference MV Adapter前にMV Workflow Assetsを共通Provider型へ追加する時期。

これらはRule-based Foundation実装を妨げない。Story fallback、Review承認、MV Workflow Assets、Scene Plan validationの接続ContractはAppendix AでV1既定値を確定する。上記Open QuestionsはFoundation後に高度化できる非blocking項目として扱う。

## Appendix A. Foundation Connection Contract V1

このAppendixはRule-based Foundation実装前に必要な接続既定値を確定する。本文と競合する場合は、このAppendixのV1固定規則を優先する。

### A.1 Story / Lyrics Fallback Matrix

優先順位は固定する。

```text
Storyの事実・人物
→ DirectorDecisionの感情・演出
→ Lyricsの象徴・Section補助
→ 安全なfallback
```

| Case | Input | Planner処理 | Validation | Confidence | Review / Adapter |
|---|---|---|---|---|---|
| A | Storyあり、Lyricsあり | Storyの人物・事実・eventを正とし、Lyricsは感情・motif・Section alignmentだけに利用 | 原則`valid` | 通常減点なし | 他条件がなければ自動接続可 |
| B | Storyあり、Lyricsなし | StoryだけでPlan生成。Lyrics alignmentを行わない | `valid` | Lyrics欠落による減点なし | Lyrics欠落だけではReview不要 |
| C | Storyなし、Lyricsあり | symbolic / abstract / environment / performanceだけで限定Plan | `fallback` | `-30` | Review承認までAdapter接続禁止 |
| D | Storyなし、Lyricsなし | Planを生成しない | `invalid` | `0` | Approvalに関係なく接続禁止 |
| E | 明示的構造化矛盾 | Storyを優先しLyrics metadataを無視 | `normalized` | 修復自体の追加減点なし。ただしReview必須 | Approval後のみ接続可 |

Case Bではinformationalな`missing-lyrics` Issue Codeを残してよいが、status、confidence、reviewRequiredを悪化させない。Case EでV1が検出するのは、Story character IDとLyrics section metadataの存在しないcharacter ref、またはStory endingIntentと構造化Lyrics ending tagの直接不一致だけである。自由文の深い意味矛盾は検出せず、将来のStory / Lyrics Alignment Engineへ委譲する。

Case Dの返却形は次に固定する。

```ts
{
  status: "invalid",
  validation: {
    status: "invalid",
    issueCodes: ["missing-story-and-lyrics"],
  },
  confidence: 0,
  reviewRequired: false,
}
```

`plan`と`scenes`は存在しない。invalidを安全な空Scene PlanとしてAdapterへ誤接続できないようにする。

### A.2 Lyrics-only Safe Fallback Content

Storyなし・Lyricsありで許可するもの:

- abstract / environment / performance subject
- 種別だけが明確なsymbolic object
- built-in Visual Motifの反復
- 非固有の移動、観察、停止、記憶、変化
- 非固有の感情遷移
- `unspecified`または`abstract-space` Setting
- Lyrics section metadataに明記されたmotif

禁止するもの:

- Lyrics metadataに存在しない固有人物やCharacter ID
- Lyricsに存在しない具体的事件、関係性、職業
- 実在人物、実在場所、組織の推定
- 時代、年齢、民族、病歴の断定
- 犯罪、病気、死因、被害、加害の事実補完
- Lyricsの比喩を現実の事実として断定すること

安全な既定値:

```ts
subject = { type: "abstract", motif: { kind: "light" } };
setting = {
  environment: "abstract-space",
  timeOfDay: "timeless",
  weather: "none",
  spaceType: "abstract",
};
action = {
  actionType: "observe",
  direction: "still",
  interaction: "environment",
};
```

Section Purposeとafterglow mappingが明確な場合だけ、`move`、`pause`、`transform`、別のbuilt-in motifへ固定規則で変更できる。

### A.3 Validation Contract

Issue CodeとRationale Reason Codeを別unionにする。

```ts
type MVScenePlanValidationStatus =
  | "valid" | "normalized" | "fallback" | "invalid";

type MVScenePlannerIssueCode =
  | "unsupported-input-version"
  | "missing-story-and-lyrics"
  | "missing-story-fallback"
  | "missing-lyrics"
  | "structured-story-lyrics-conflict"
  | "invalid-duration"
  | "audio-duration-mismatch"
  | "invalid-aspect-ratio"
  | "invalid-scene-count"
  | "duplicate-scene-id"
  | "invalid-scene-order"
  | "invalid-section-order"
  | "invalid-scene-timing"
  | "non-contiguous-scenes"
  | "invalid-main-peak-scene"
  | "missing-afterglow-scene"
  | "invalid-character-reference"
  | "invalid-location-reference"
  | "invalid-asset-reference"
  | "missing-assigned-asset"
  | "invalid-continuity-reference"
  | "scene-count-reduced"
  | "performance-asset-missing"
  | "sensitive-content-review-required"
  | "director-decision-normalized"
  | "director-decision-fallback";

type MVScenePlanValidation = {
  status: MVScenePlanValidationStatus;
  issueCodes: MVScenePlannerIssueCode[];
};
```

責務を重複させない。

| Field | Meaning |
|---|---|
| `validation.status` | Plan入力と構造の品質・修復段階 |
| `validation.issueCodes` | 発見または修復した問題 |
| `confidence` | 入力、参照、Director整合性に基づく信頼度 |
| `reviewRequired` | Workflowで人間確認が必要か |
| `rationale.reasonCodes` | Plannerが採用した演出配置の短い理由 |

`fallbackUsed`、`normalizedFields`、`missingReferences`はV1 Validationへ追加しない。必要な情報はstatusとIssue Codeから一意に追跡する。

### A.4 Review Approval Envelope

Approvalは純粋なPlanへ含めず、Workflow Recordへ分離する。

```ts
type MVScenePlanReviewState =
  | "not-required" | "pending" | "approved" | "rejected";

type MVScenePlanApproval = {
  state: MVScenePlanReviewState;
  approvedPlanSchemaVersion?: string;
  approvedPlannerVersion?: string;
  approvedPlanFingerprint?: string;
};

type MVScenePlanRecord = {
  plan: MVScenePlan;
  approval: MVScenePlanApproval;
};
```

`createdAt`、reviewer ID、comment、rejection reason、監査metadataは、さらに外側のWorkflow Audit Envelopeが所有する。これらは決定性のあるPlanにもApproval判定値にも含めない。保存実装、Review Queue、UIはFoundation範囲外である。

初期state:

- `reviewRequired=false`: `not-required`
- `reviewRequired=true`: `pending`
- invalid Result: Recordを作らずGateで拒否

### A.5 Plan Fingerprint

承認は特定のPlan内容にだけ有効とする。V1は`approvedPlanFingerprint`を予約し、hash実装はWorkflowフェーズへ保留する。

Fingerprint対象:

- Scene Plan schemaVersion、plannerVersion、sourceDecisionSchemaVersion
- duration、aspectRatio、narrativeArc
- continuityの構造化field
- Scene順、ID、Section、Timing
- Purpose、Subject、Setting、Action、Emotion、Temporal Mode、Motif
- continuityRefs、assetRefs、mainPeak、afterglow
- validation status / issueCodes、confidence、reviewRequired

対象外:

- Raw Story / Lyrics / Theme
- rationale summariesと自由文review note
- URL、Secret、Workflow audit metadata
- createdAt、reviewer、comment

Canonical JSONはobject keyを辞書順、arrayはContract順のまま、数値はPlanで確定した丸め値を使用し、UTF-8でhash化する。Hash algorithmは実装時にversion付きで固定する。現在fingerprintと`approvedPlanFingerprint`が一致しなければApprovalを`pending`へ戻す。schemaVersionまたはplannerVersion変更でも旧Approvalを無効にする。

### A.6 Adapter Gate Contract

GateはScene PlannerにもProvider Adapterにも属さず、Workflow Orchestratorの純粋判定とする。

```ts
type MVScenePlanGateReasonCode =
  | "scene-plan-invalid"
  | "scene-plan-review-pending"
  | "scene-plan-rejected"
  | "scene-plan-normalized-review-required"
  | "scene-plan-fallback-review-required"
  | "scene-plan-approval-stale"
  | "scene-plan-approved"
  | "scene-plan-ready";

type MVScenePlanGateResult = {
  allowed: boolean;
  reviewRequired: boolean;
  reasonCodes: MVScenePlanGateReasonCode[];
};
```

| Validation | Plan reviewRequired | Approval | Adapter接続 | Adapter最低status |
|---|---:|---|---|---|
| valid | false | not-required | 可 | readyになり得る |
| valid | true | approved + fingerprint一致 | 可 | Capability Mappingに従う |
| valid | true | pending/rejected/stale | 不可 | Requestなし |
| normalized | true固定 | approved + fingerprint一致 | 可 | degraded |
| normalized | true固定 | その他 | 不可 | Requestなし |
| fallback | true固定 | approved + fingerprint一致 | 可 | degraded |
| fallback | true固定 | その他 | 不可、自動送信禁止 | Requestなし |
| invalid | false | 全状態 | 不可 | Request生成禁止 |

`rejected`は常に禁止する。Approvalでinvalidを通すことはできない。Gate通過後もAdapter自身のInput/Capability validationは別に実行する。

### A.7 Scene Planner Assets and MV Workflow Assets

Planner用AssetはScene内容と論理割当のための候補集合である。

```ts
type MVScenePlannerAssets = {
  referenceImages?: readonly AssetReference[];
  referenceVideo?: AssetReference;
  characterAssets?: readonly CharacterAssetReference[];
  locationAssets?: readonly LocationAssetReference[];
  brandAssets?: readonly AssetReference[];
  performerAsset?: CharacterAssetReference;
  audioAsset?: AssetReference;
};
```

Adapter用Assetは実行時に利用可能な集合である。

```ts
type MVWorkflowAssets = {
  audioAsset: AssetReference;
  referenceImages?: readonly AssetReference[];
  referenceVideo?: AssetReference;
  characterAssets?: readonly CharacterAssetReference[];
  locationAssets?: readonly LocationAssetReference[];
  brandAssets?: readonly AssetReference[];
  performerAsset?: CharacterAssetReference;
};
```

規則:

- Audio AssetはPlannerでは任意で、duration整合検証にだけ使う。
- Audio AssetはMV Adapterでは必須。
- Planは論理的なScene Asset割当を`assetRefs`で保持する。
- Adapter Inputはその時点で解決可能な実行Asset集合を再度渡す。
- AdapterはPlanが参照したAsset IDだけを使う。
- Plannerで未割当だったAssetをAdapterが追加使用しない。
- AdapterはScene間のAsset割当、characterRef、continuityRoleを変更しない。
- Plan参照がWorkflow Assetsにない場合、必須Identity/Audioはunsupportedまたはinvalid、任意Referenceはdegraded omissionとReviewにする。
- Workflow AssetsにあるがPlan未参照のAssetは無視する。
- Asset Resolverだけが実行直前にassetIdをURL/upload handleへ変換する。

### A.8 Character Asset Contract

```ts
type CharacterContinuityRole =
  | "identity-primary"
  | "identity-alternate"
  | "appearance"
  | "costume";

type CharacterAssetReference = {
  characterRef: string;
  asset: AssetReference;
  continuityRole: CharacterContinuityRole;
};
```

- `characterRef`は`^[a-z][a-z0-9-]{0,63}$`に一致する。
- Story character ID、Scene character subject、continuity planと完全一致させる。
- 同一characterRefに複数Assetを許可するが、`identity-primary`は1件だけ。
- alternate、appearance、costumeは入力順ではなく`assetId`昇順で安定処理する。
- Character Asset kindは`character`、`image`または`video`。mimeType指定時はkindと整合する`image/`または`video/`を要求する。
- 空ID、256文字超、URL形式IDを拒否する。
- 権利確認flagをCharacter Asset、Scene Planへコピーしない。Asset Intake MetadataとWorkflow Policyが所有し、未承認AssetはPlanner Inputへ入れない。

### A.9 Duration Ownership

- Plannerでは`constraints.durationSeconds`が唯一の正である。
- Plannerの`audioAsset.durationSeconds`は検証metadataに限定する。
- 許容差は`max(0.25秒, constraints.durationSeconds × 0.005)`とする。
- 差が許容差以内なら一致として扱いIssueを残さない。
- 差が許容差を超えたら`audio-duration-mismatch`でinvalid Resultを返し、Planを生成しない。
- 音源確定後にdurationが変わった場合、WorkflowがConstraintsを更新してPlannerを再実行する。
- Adapterでは承認済みScene Planのduration/timingを正とし、Audio metadataとの同じ許容差を再検証する。
- Adapterで不一致ならRequest生成禁止。Scene Timingを再計算、stretch、trimしない。

### A.10 Story / Lyrics Retention Boundary

- Planner Inputには目的に必要なStory / Lyrics原文を含めてよい。
- Scene Plan、Rationale、Validation Issue、Errorへ原文を複製しない。
- Advanced Previewは構造化summaryだけを表示する。
- 通常ログへ原文を保存しない。
- 保存が必要な場合は暗号化・Retention Policyを持つWorkflow Input Recordが所有する。
- Scene Plan Record、Story/Lyrics Input Record、Approval Audit Recordを分離する。
- Fingerprintは原文ではなく生成済みPlanのcanonical structureを対象にする。

### A.11 Foundation Implementation Scope

必須候補ファイル:

```text
lib/mvScenePlanner.ts
```

公開型が実装ロジックを圧迫する、または他レイヤーから型だけをimportする必要が生じた場合のみ次へ分離する。

```text
lib/mvScenePlannerTypes.ts
```

PreviewはFoundation Logic完了後の任意段階とする。

```text
components/MVScenePlanPreview.tsx
```

Foundationに含める:

- 公開型、`createMVDecisionProjection()`、`createMVScenePlan()`
- Input/Asset/Version validation
- Story/Lyrics fallback
- Scene Count、allocation、timing、ID
- narrative purpose、mainPeak、afterglow
- basic continuity、performance mode
- confidence、rationale、validation、reviewRequired
- deep copy、入力非変更、決定性

含めない:

- LLM、外部API、Provider Adapter、Shot Planner
- Camera、Prompt、Safety Model
- Approval保存、Gate永続化、Review UI/Queue
- Asset Resolver、Provider Capability

### A.12 Foundation Validation Matrix

次フェーズではリポジトリ既存基盤を優先し、なければ残らないNode + TypeScript検証を行う。

| Group | Cases |
|---|---|
| Input | Story+Lyrics、Story only、Lyrics only、両方なし、Decision valid/normalized/fallback、不正duration/aspect/asset |
| Mode | narrative、performance、hybrid |
| Peak | Chorus、Bridge、Outro |
| Afterglow | warm、quiet、hopeful、empty、inspired、bittersweet |
| Count | minimum、default、target、max、short、long、reduced |
| Continuity | Character有無、Asset有無、複数Character、Location継続、Memory Scene |
| Contract | ID一意、Section/Scene順、Timing連続、Peak 1、Afterglow 1 |
| Safety | 原文非複製、URL/Secret/Promptなし、不正ref拒否 |
| Purity | 入力非変更、決定性、出力独立性、時刻/乱数なし |
| Connection | invalid no-plan、Review Gate、stale fingerprint、Asset集合整合、duration差 |

### A.13 Open Question Classification

Foundation前に本Appendixで確定したもの:

- Story/Lyrics fallback matrixと安全なScene内容
- Review Approvalの別Envelope
- Plan fingerprint対象と承認失効
- Validation / Approval / Gateの分離
- MV Workflow Assetsと論理Asset割当
- Character AssetのV1形式
- Duration所有関係と許容差
- Confidence固定減点と70未満Review
- invalid ResultがPlanを持たないこと

Foundation後へ保留できるもの:

- Story Engine event粒度
- Lyrics section summary生成責務
- Hybrid performance比率の高度化
- Lip Sync Contract
- 詳細Costume State
- Plan / Input retention期間の具体値
- Capability Extension schema
- LLM PlannerとAlignment Engine
- Fingerprint hash algorithmの具体名と保存実装

これらの保留事項はRule-based Foundationを停止しない。Foundation実装に必要なV1既定値と接続境界は確定済みである。
