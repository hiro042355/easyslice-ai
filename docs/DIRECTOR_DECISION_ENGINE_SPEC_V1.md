# Director Decision Engine Specification V1

## 1. Purpose

Director Decision Engineは、Emotion Engineが生成した`EmotionGraph`を、Vocal / Music / MV Directorが共有できる構造化された演出判断へ変換する中間レイヤーである。

このレイヤーが答える問いは次である。

```text
EmotionGraphが示す感情を、作品全体と各セクションでどう演出するか。
```

出力はProvider固有Promptではない。強弱、抑制、緊張、解放、最大ピーク、余韻、および説明可能な決定理由を、型で制限されたDirector Logicとして表現する。

## 2. Design Philosophy

### Creator First

クリエイターは「何を作るか」を決め、AI Directorが「どう作るか」を決める。Vocal、Music、MVの細かな値を通常ユーザーへ設定させない。

### Director Logic First

価値の中心はPrompt文字列ではなく、複数Directorが共有できる演出判断である。自由文は短い説明に限定し、主要判断はenum、boolean、0〜100のScoreで表す。

### AI over Settings

V1ではUI設定を追加しない。Director Presetは高水準の意図であり、手動ミキサーではない。

### Provider Independent

Provider名、モデル名、APIパラメータ、固有カメラコマンドをDecisionへ含めない。Provider固有変換は後段Adapterの責務とする。

### Human Review by Default

決定結果には短いReason Codeと説明を保持し、将来のReviewで「何が決まり、なぜ決まったか」を確認可能にする。内部思考やChain of Thoughtは保存しない。

### Simple UI, Deep Intelligence

Decisionの詳細は通常UIに表示しない。将来のAdvanced Previewは読み取り専用とし、標準フローを複雑化しない。

## 3. Scope

Director Decision Engineが担当する。

- `EmotionGraph`の検証、正規化、解釈
- 作品全体の演出方針
- 5セクションの演出強度、緊張、解放、目的
- `mainPeak`のVocal / Music / MVへの反映
- `afterglow`のOutroへの反映
- Vocal / Music / MV共通判断と固有判断
- Director Presetによる範囲内の補正
- 決定理由と監査用メタデータ
- 同じ入力から同じ出力を返す決定的なルール

## 4. Non-Goals

V1では以下を担当しない。

- Story、歌詞、楽曲、音声、画像、動画の生成
- StoryやLyricsの再解析、感情の再検出
- Provider API呼び出し
- Provider固有Promptまたはパラメータの生成
- Higgsfield / NVIDIA / Veo / Runway / Kling固有処理
- UI描画、Publish、Export、Analytics送信
- 自動Review承認
- ユーザー向けの詳細パラメータ編集
- 確率モデル、外部AI API、学習ベースの判断

## 5. Architecture Position

```text
Creator Intent
  ↓
Story / Theme / Mood / Lyrics
  ↓
Emotion Engine
  ↓ EmotionGraph
Director Decision Engine
  ├─ Overall Direction
  ├─ Section Directions
  ├─ Vocal Direction
  ├─ Music Direction
  └─ MV Direction
  ↓
Provider Adapters
  ↓
Generation Providers
```

Emotion Engineは「どう感じるか」のSource of Truthである。Director Decision Engineは感情を再判定せず、「その感情をどう演出するか」へ変換する。

## 6. Input Contract

V1の最終入力案は次とする。

```ts
type DirectorDecisionInput = {
  emotionGraph: EmotionGraph;
  directorPreset: DirectorPreset;
};
```

### Input decisions

- `EmotionGraph`は必須。感情、時間構造、mainPeak、afterglowを受け取る。
- `directorPreset`は必須。現行`EmotionGraph`がPresetを保持しないため、演出補正の再現に別入力が必要である。
- Story、Theme、Mood、LyricsはV1では渡さない。再参照するとEmotion Engineと責務が重複し、同じGraphから異なる解釈が生まれるためである。
- 将来、Story Engineが構造化したNarrative Metadataを提供する場合は、自由文ではなくversion付きの別契約として検討する。
- 呼び出し側の型は`DirectorPreset`で制限し、実行時の未知値はDecision Engine入口で`auto`へ正規化する。
- 入力オブジェクトと配列は変更しない。

## 7. Output Contract

```ts
type DirectorDecision = {
  schemaVersion: "1.0";
  engineVersion: "rule-v1";
  normalizedPreset: DirectorPreset;
  overallDirection: OverallDirection;
  sectionDirections: SectionDirection[];
  vocalDirection: VocalDirection;
  musicDirection: MusicDirection;
  mvDirection: MVDirection;
  rationale: DirectorRationale;
  validation: DecisionValidation;
};
```

```ts
type DecisionValidation = {
  status: "valid" | "normalized" | "fallback";
  issueCodes: ValidationIssueCode[];
};

type ValidationIssueCode =
  | "unknown-preset"
  | "empty-sections"
  | "missing-section"
  | "duplicate-section"
  | "invalid-score"
  | "invalid-ratio"
  | "non-contiguous-ratios"
  | "invalid-main-peak"
  | "invalid-afterglow";
```

`validation`は監査可能な結果であり、例外のstackや内部思考を含めない。

## 8. Overall Direction

```ts
type OverallDirection = {
  emotionalTone: SupportedEmotion;
  intensityCurve: IntensityCurve;
  pacing: PacingStyle;
  contrast: ContrastLevel;
  mainPeakSection: EmotionSectionName;
  afterglow: AfterglowDirection;
  narrativeDirection: NarrativeDirection;
  visualTone: VisualTone;
  confidence: number; // integer 0-100
};

type IntensityCurve =
  | "steady-rise"
  | "rise-and-release"
  | "late-peak"
  | "bridge-turn"
  | "quiet-resolution";

type PacingStyle = "restrained" | "measured" | "progressive" | "driving";
type ContrastLevel = "low" | "medium" | "high";
type NarrativeDirection =
  | "reflection-to-release"
  | "tension-to-resolution"
  | "growth-to-climax"
  | "sustained-emotion"
  | "intimate-afterglow";
type VisualTone = "soft" | "balanced" | "luminous" | "shadowed" | "expansive" | "stylized";

type AfterglowDirection = {
  emotion: SupportedEmotion;
  intensity: number; // integer 0-100
  releaseStyle: "warm" | "quiet" | "hopeful" | "empty" | "inspired" | "bittersweet";
};
```

`confidence`は感情判断の確率ではない。入力Graphがどの程度補正なしで使用できたかを示すデータ品質Scoreである。完全に有効なら100、正規化ごとに規定量を減算し、fallback時は最大50とする。

未知Presetは演出Decision上ではAutoと一致する。ただし監査可能性のため、`normalizedPreset`は`auto`、Validationには`unknown-preset`を残し、Confidenceを3減点する。したがってJSON全体では正常Autoと一致せず、演出フィールドだけが一致する。

## 9. Section Direction

```ts
type SectionDirection = {
  section: EmotionSectionName;
  startRatio: number; // 0-1
  endRatio: number;   // 0-1
  intensity: number;        // 総合演出強度
  tension: number;          // 未解決感と溜め
  release: number;          // 感情を開放する度合い
  vocalIntensity: number;   // Vocal Director入力
  musicIntensity: number;   // Music Director入力
  visualIntensity: number;  // MV Director入力
  transitionStyle: TransitionStyle;
  isMainPeak: boolean;
  purpose: SectionPurpose;
};

type TransitionStyle = "hold" | "gentle" | "build" | "impact" | "dissolve";
type SectionPurpose =
  | "establish"
  | "build"
  | "release"
  | "turn"
  | "climax"
  | "resolve";
```

Scoreは必要な判断に限定する。`intensity`は全体整合、`tension`と`release`はセクションの役割、3つのDirector強度は各下流レイヤーで使用する。Emotion EngineのScoreをそのまま複製しない。

出力は常に`verse → pre-chorus → chorus → bridge → outro`の順とし、各Sectionは1件だけ存在する。

## 10. Vocal Direction

```ts
type VocalDirection = {
  delivery: VocalDelivery;
  dynamics: DynamicsShape;
  breathiness: number; // 0-100
  vibrato: number;     // 0-100
  articulation: ArticulationStyle;
  emotionalExpression: SupportedEmotion;
  mainPeakTreatment: VocalPeakTreatment;
  outroTreatment: VocalOutroTreatment;
};

type VocalDelivery = "intimate" | "controlled" | "open" | "urgent" | "resolute";
type DynamicsShape = "narrow" | "gradual" | "wide" | "late-expansion";
type ArticulationStyle = "soft" | "natural" | "clear" | "accented";
type VocalPeakTreatment = "lift" | "sustain" | "breakthrough" | "vulnerable-focus";
type VocalOutroTreatment = "release" | "whispered" | "sustained" | "resolved";
```

セクションごとの強弱は`SectionDirection.vocalIntensity`を共有し、VocalDirectionでは作品全体の歌唱方針とPeak / Outroの変化だけを保持する。数値はAdapterがProvider範囲へ変換し、意味ラベルは未対応Providerでの安全なfallbackに使う。

## 11. Music Direction

```ts
type MusicDirection = {
  tempoRange: { minBpm: number; maxBpm: number };
  energyCurve: IntensityCurve;
  instrumentationDensity: number; // 0-100
  rhythmIntensity: number;         // 0-100
  harmonicTension: number;         // 0-100
  dynamicRange: "narrow" | "moderate" | "wide";
  sectionMovement: SectionMusicMovement[];
  mainPeakTreatment: MusicPeakTreatment;
  afterglowTreatment: MusicAfterglowTreatment;
};

type SectionMusicMovement = {
  section: EmotionSectionName;
  densityChange: "reduce" | "hold" | "add" | "expand";
};

type MusicPeakTreatment = "full-arrangement" | "rhythmic-impact" | "harmonic-release" | "intentional-space";
type MusicAfterglowTreatment = "thin-texture" | "long-decay" | "gentle-pulse" | "clean-stop";
```

BPMは単一値ではなく範囲とする。Decision Engineは演出上の速度幅を示し、具体値はMusic DirectorまたはAdapterがProvider能力と作品長に合わせて選ぶ。範囲は40〜200、`minBpm <= maxBpm`とする。ジャンル名やPrompt構文は含めない。

## 12. MV Direction

```ts
type MVDirection = {
  visualMood: SupportedEmotion;
  colorDirection: ColorDirection;
  lightingDirection: LightingDirection;
  cameraEnergy: number;        // 0-100
  movementStyle: MovementStyle;
  shotDensity: number;         // 0-100
  transitionIntensity: number; // 0-100
  subjectFocus: SubjectFocus;
  environmentDirection: EnvironmentDirection;
  mainPeakTreatment: MVPeakTreatment;
  afterglowTreatment: MVAfterglowTreatment;
};

type ColorDirection = "warm" | "cool" | "neutral" | "muted" | "vivid" | "high-contrast";
type LightingDirection = "soft" | "natural" | "low-key" | "radiant" | "contrast-led";
type MovementStyle = "still" | "floating" | "controlled" | "progressive" | "dynamic";
type SubjectFocus = "intimate" | "balanced" | "environmental" | "symbolic";
type EnvironmentDirection = "minimal" | "grounded" | "atmospheric" | "expansive" | "surreal";
type MVPeakTreatment = "scale-expansion" | "motion-impact" | "intimate-close-focus" | "contrast-break";
type MVAfterglowTreatment = "slow-fade" | "held-final-image" | "soft-departure" | "abrupt-absence";
```

これらは映像意図の抽象表現であり、Provider固有カメラ名、レンズ名、API値ではない。

## 13. Decision Rules

すべての計算は正規化後の整数Scoreを使い、各式の最後に四捨五入して0〜100へclampする。

### Base section transforms

```text
intensity = 0.55 * emotionScore + 0.30 * energyScore + 0.15 * peakLevel
tension   = 0.45 * emotionScore + 0.35 * peakLevel + 0.20 * (100 - energyScore)
release   = 0.60 * peakLevel + 0.25 * energyScore + 0.15 * emotionScore

vocalIntensity  = 0.60 * emotionScore + 0.25 * energyScore + 0.15 * peakLevel
musicIntensity  = 0.15 * emotionScore + 0.65 * energyScore + 0.20 * peakLevel
visualIntensity = 0.30 * emotionScore + 0.45 * energyScore + 0.25 * peakLevel
```

セクション意味補正を式の後に適用する。

- Verse: tension `-5`、release `-10`
- Pre Chorus: tension `+10`、release `-5`
- Chorus: release `+8`
- Bridge: tension `+8`
- Outro: tension `-15`、通常はrelease `+5`
- mainPeak: 3 Director強度に`+8`、releaseを最低90、intensityを最低90

mainPeak補正後、総合`intensity`についてmainPeakを一意な最大値にする。非Peak最大値より1高くできる場合はmainPeakを引き上げ、mainPeakが100へ到達した場合は同値の非Peakを99へ制限する。`tension`は溜めを表し、Vocal / Music / Visual強度はBridgeの静かなPeakなどDirector固有の表現を保つため、この一意最大制約の対象外とする。

### Labels

- `transitionStyle`: 0〜29=`hold`、30〜49=`gentle`、50〜69=`build`、70〜89=`impact`、Outroかつafterglow保持=`dissolve`
- `purpose`: Verse=`establish`、Pre Chorus=`build`、Chorus=`release`、Bridge=`turn`、Outro=`resolve`。mainPeakはSectionを問わず`climax`へ上書きする。
- `intensityCurve`: mainPeakがBridgeなら`bridge-turn`、Outroなら`late-peak`。それ以外はSection強度の増減から`steady-rise`、`rise-and-release`、`quiet-resolution`を決める。
- `pacing`:平均EnergyとPreset補正後の閾値で`restrained / measured / progressive / driving`を決める。
- `contrast`:最大intensityと最小intensityの差が20未満=`low`、20〜39=`medium`、40以上=`high`。

## 14. Peak Handling

正規化後のmainPeakは必ず1件とし、`overallDirection.mainPeakSection`、`SectionDirection.isMainPeak`、3 DirectorのPeak Treatmentを一致させる。

### Chorus peak

- `release`を最低90
- Vocalは`lift`または`breakthrough`
- Musicは`full-arrangement`または`harmonic-release`
- MVは`scale-expansion`または`motion-impact`
- Chorus直前のPre Chorusはtensionを最低65にする

### Bridge peak

- 高Energyならimpact、低EnergyでもEmotionが高ければ静かな最大ピークとして扱う
- Vocalは`vulnerable-focus`
- Musicは`intentional-space`を優先し、音数の多さをPeakと同一視しない
- MVは`intimate-close-focus`または`contrast-break`
- ChorusよりBridgeの`isMainPeak`とPeak Treatmentを優先する

### Outro peak

- Outroを単なる減衰として扱わない
- Vocalは`sustain`、Musicは`harmonic-release`または`long-decay`、MVは`held-final-image`を優先
- afterglowはPeak後に別Sectionがないため、Outro内部の後半で解放へ移る判断として表す
- intensityを最低90にする一方、Energyを強制的に高くしない

## 15. Afterglow Handling

`EmotionGraph.afterglow`をOutroの残留感情として扱う。未知または空ならOutroの`primaryEmotion`、それもなければGraphの`primaryEmotion`、最終的に`hope`へfallbackする。

Afterglowは次へ反映する。

- Outroのtensionを下げ、releaseを上げる。ただし`empty`方向ではreleaseを上げず、意図的な不在を保持する。
- Vocal Outro Treatmentを`release / whispered / sustained / resolved`から選ぶ。
- Musicの密度を`reduce`し、`thin-texture / long-decay / gentle-pulse / clean-stop`を選ぶ。
- MVはshot densityとtransition intensityを下げ、最終像を長く保持する。
- mainPeakがOutroの場合はPeak強度を保持したまま、Outro後半だけ余韻処理へ移行する。

`releaseStyle`はafterglow感情とOutroのEmotion / Energyから決定する。例としてHope=`hopeful`、Joy/Love=`warm`、Loneliness/Fear=`empty`、Sadness+Hope=`bittersweet`、Determination=`inspired`を優先する。

## 16. Preset Handling

未知Presetは`auto`へ正規化し、`validation.issueCodes`へ`unknown-preset`を追加する。PresetはEmotionGraphを上書きせず、Director強度と意味ラベルを限定的に補正する。

| Preset | Vocal | Music | MV | Global intent |
| --- | ---: | ---: | ---: | --- |
| auto | +0 | +0 | +0 | Graphをそのまま解釈 |
| epic | +5 | +10 | +10 | wide dynamics、expansive、strong contrast |
| emotional | +8 | -5 | -3 | intimate、breathiness増、低Energyでも感情を保持 |
| cinematic | +0 | +2 | +6 | measured pacing、controlled movement、atmospheric |
| fantasy | +0 | +4 | +7 | floating、surreal、luminous |
| dark | +3 | -2 | +5 | shadowed、high contrast、tension保持 |
| bright | -2 | +6 | +6 | clear articulation、radiant、progressive |
| anime-inspired | +6 | +8 | +8 | expressive、dynamic、stylized。固有作品・スタジオ表現は禁止 |

補正後は必ず0〜100へclampする。

競合優先順位は次で固定する。

1. 正規化されたEmotionGraphのmainPeakとafterglow
2. Sectionの感情・Energy・Peak Score
3. Sectionの構造的役割
4. Preset補正
5. 安全な既定値

PresetはmainPeak Sectionやprimary emotionを移動・置換しない。EmotionとPresetが競合する場合、EmotionGraphを優先し、Presetは表現方法だけを変える。

## 17. Rationale and Explainability

```ts
type DirectorRationale = {
  decisions: DirectorReason[];
};

type DirectorReason = {
  code: DirectorReasonCode;
  section?: EmotionSectionName;
  targets: Array<"overall" | "vocal" | "music" | "mv">;
  summary: string;
};

type DirectorReasonCode =
  | "emotion-main-peak"
  | "afterglow-preservation"
  | "preset-modulation"
  | "low-energy-high-emotion"
  | "pre-chorus-tension-build"
  | "chorus-release"
  | "bridge-emotional-turn"
  | "outro-resolution"
  | "input-normalized"
  | "safe-fallback";
```

`summary`は短い説明可能な事実とする。例: `Bridge is the normalized main peak, so vocal focus rises while music density is restrained.` 内部推論過程、隠れたPrompt、Chain of Thoughtは保存しない。

同じ入力ではReasonの順序も同じにする。順序はOverall、Sectionの時間順、Vocal、Music、MV、Validationとする。

## 18. Validation and Normalization

Decision Engine入口で入力を新しい内部オブジェクトへコピーして正規化する。

### Score and ratio

- Scoreは有限数へ変換し、NaN / Infinity / -Infinityは既定値へ置換する。
- Scoreは四捨五入し0〜100へclampする。
- Ratioは有限数へ変換して0〜1へclampする。
- `startRatio <= endRatio`を保証する。

### Sections

- 正式順序は`verse → pre-chorus → chorus → bridge → outro`。
- 重複Sectionは入力配列で最初に現れた有効候補を採用する。
- 欠落Sectionは安全な既定Sectionで補完する。
- すべてのRatioが有効、昇順、連続なら入力Ratioを維持する。
- 不正、重複時間、空白が1件でもあれば、Foundation既定境界`0 / 0.25 / 0.43 / 0.70 / 0.87 / 1`へ全体を修復する。
- 空Graphは5つのfallback Sectionを生成する。感情=`hope`、mainPeak=`chorus`とし、VerseからOutroへ上昇・解放する低〜中強度の既定Curveを使う。

### Main peak

- `mainPeakSection`が存在し、そのSectionだけが`mainPeak: true`なら維持する。
- 不一致時は`mainPeakSection`の有効Sectionを優先する。
- それも無効なら`mainPeak: true`の候補から`peakLevel`最大を選び、同点は正式Section順で決める。
- 候補がなければ全Sectionの`peakLevel`最大を選び、同点は正式Section順で決める。
- 全Section fallback時はChorusとする。
- 選択Peakの`peakLevel`を全Section最大以上に正規化し、`mainPeak: true`を1件だけにする。

正規化は入力を書き換えず、issue codeを残す。recover可能な不正値では例外を投げない。

## 19. Determinism

以下により同じ入力から同じ出力を保証する。

- 純粋な同期関数として実装する
- 現在時刻、乱数、locale依存sort、ネットワーク、環境変数を参照しない
- enumの優先順位と同点処理を明示する
- 全Score計算、丸め、clampの順序を固定する
- SectionとReasonの出力順を固定する
- 入力と定数を変更せず、実行ごとに新しい配列・オブジェクトを返す
- `createdAt`、request ID、Provider応答をDecisionへ含めない

監査イベントに時刻が必要な場合は、純粋なDecision生成後に外側のPersistence層がEnvelopeへ付与する。

## 20. Provider Adapter Boundary

```text
Emotion Engine
  ↓
Director Decision Engine
  ↓
Vocal / Music / MV Direction
  ↓
Provider Adapter
  ↓
Higgsfield / NVIDIA / Veo / Runway / Kling / Vocal / Music Providers
```

Provider Adapterが担当する。

- Decisionの意味ラベルとScoreをProvider固有Promptへ変換
- Provider固有パラメータと許容範囲への変換
- 未対応機能のfallback
- API request body、認証、再試行、エラー変換
- Providerの長さ、解像度、モデル能力などの制約調整

Director Decision EngineはProvider名、モデルID、Prompt構文、API key、解像度、固有カメラコマンドを知らない。

## 21. Versioning

- `schemaVersion: "1.0"`は出力構造の互換性を表す。
- `engineVersion: "rule-v1"`は同一Schema内のルールセットを表す。
- `createdAt`は含めない。純粋なDecisionの決定性を壊すためである。
- Adapterは対応可能な`schemaVersion`を宣言し、未知major versionを拒否する。
- minor互換のフィールド追加はoptionalとして扱い、既存Adapterを壊さない。
- V2で意味や必須フィールドを変える場合は`schemaVersion: "2.0"`と別の変換関数を使用する。
- 保存時刻や実行IDは外部の`DecisionRecord` Envelopeへ格納し、Decision本体から分離する。

## 22. Advanced Preview

将来の読み取り専用Advanced Preview候補:

- Overall Direction
- Intensity CurveとPacing
- Main Peak Sectionと各DirectorのPeak Treatment
- AfterglowとOutro Treatment
- SectionごとのVocal / Music / MV強度
- Transition StyleとSection Purpose
- Reason Codeと短い説明
- ConfidenceとValidation Issue
- Schema / Engine Version

通常UIには表示せず、V1では編集機能を設けない。Previewを閉じてもDecisionやCreator入力は失われない設計とする。

## 23. Example Input

```ts
const input: DirectorDecisionInput = {
  directorPreset: "emotional",
  emotionGraph: {
    primaryEmotion: "love",
    secondaryEmotions: ["nostalgia", "hope"],
    overallArc: "love → hope → determination → nostalgia → love",
    mainPeakSection: "outro",
    afterglow: "love",
    sections: [
      { section: "verse", startRatio: 0, endRatio: 0.25, primaryEmotion: "love", emotionScore: 66, energyScore: 20, peakLevel: 18, mainPeak: false, directionNote: "Intimate opening." },
      { section: "pre-chorus", startRatio: 0.25, endRatio: 0.43, primaryEmotion: "hope", emotionScore: 80, energyScore: 44, peakLevel: 48, mainPeak: false, directionNote: "Build gently." },
      { section: "chorus", startRatio: 0.43, endRatio: 0.70, primaryEmotion: "determination", emotionScore: 96, energyScore: 74, peakLevel: 88, mainPeak: false, directionNote: "Open release." },
      { section: "bridge", startRatio: 0.70, endRatio: 0.87, primaryEmotion: "nostalgia", emotionScore: 92, energyScore: 24, peakLevel: 68, mainPeak: false, directionNote: "Reflective turn." },
      { section: "outro", startRatio: 0.87, endRatio: 1, primaryEmotion: "love", emotionScore: 70, energyScore: 14, peakLevel: 100, mainPeak: true, directionNote: "Quiet final peak." },
    ],
  },
};
```

## 24. Example Output

以下は主要フィールドを示す省略例である。

```ts
const decision: DirectorDecision = {
  schemaVersion: "1.0",
  engineVersion: "rule-v1",
  normalizedPreset: "emotional",
  overallDirection: {
    emotionalTone: "love",
    intensityCurve: "late-peak",
    pacing: "measured",
    contrast: "high",
    mainPeakSection: "outro",
    afterglow: { emotion: "love", intensity: 70, releaseStyle: "warm" },
    narrativeDirection: "intimate-afterglow",
    visualTone: "soft",
    confidence: 100,
  },
  sectionDirections: [
    { section: "verse", startRatio: 0, endRatio: 0.25, intensity: 45, tension: 51, release: 14, vocalIntensity: 50, musicIntensity: 27, visualIntensity: 34, transitionStyle: "gentle", isMainPeak: false, purpose: "establish" },
    { section: "pre-chorus", startRatio: 0.25, endRatio: 0.43, intensity: 65, tension: 73, release: 40, vocalIntensity: 68, musicIntensity: 49, visualIntensity: 56, transitionStyle: "build", isMainPeak: false, purpose: "build" },
    { section: "chorus", startRatio: 0.43, endRatio: 0.70, intensity: 88, tension: 88, release: 93, vocalIntensity: 89, musicIntensity: 81, visualIntensity: 84, transitionStyle: "impact", isMainPeak: false, purpose: "release" },
    { section: "bridge", startRatio: 0.70, endRatio: 0.87, intensity: 68, tension: 88, release: 60, vocalIntensity: 78, musicIntensity: 43, visualIntensity: 55, transitionStyle: "build", isMainPeak: false, purpose: "turn" },
    { section: "outro", startRatio: 0.87, endRatio: 1, intensity: 90, tension: 55, release: 90, vocalIntensity: 90, musicIntensity: 45, visualIntensity: 61, transitionStyle: "dissolve", isMainPeak: true, purpose: "climax" },
  ],
  vocalDirection: {
    delivery: "intimate",
    dynamics: "late-expansion",
    breathiness: 68,
    vibrato: 55,
    articulation: "soft",
    emotionalExpression: "love",
    mainPeakTreatment: "sustain",
    outroTreatment: "sustained",
  },
  musicDirection: {
    tempoRange: { minBpm: 68, maxBpm: 88 },
    energyCurve: "late-peak",
    instrumentationDensity: 48,
    rhythmIntensity: 44,
    harmonicTension: 72,
    dynamicRange: "wide",
    sectionMovement: [
      { section: "verse", densityChange: "reduce" },
      { section: "pre-chorus", densityChange: "add" },
      { section: "chorus", densityChange: "expand" },
      { section: "bridge", densityChange: "reduce" },
      { section: "outro", densityChange: "reduce" },
    ],
    mainPeakTreatment: "harmonic-release",
    afterglowTreatment: "long-decay",
  },
  mvDirection: {
    visualMood: "love",
    colorDirection: "warm",
    lightingDirection: "soft",
    cameraEnergy: 55,
    movementStyle: "controlled",
    shotDensity: 46,
    transitionIntensity: 52,
    subjectFocus: "intimate",
    environmentDirection: "atmospheric",
    mainPeakTreatment: "intimate-close-focus",
    afterglowTreatment: "held-final-image",
  },
  rationale: {
    decisions: [
      { code: "emotion-main-peak", section: "outro", targets: ["overall", "vocal", "music", "mv"], summary: "Outro is the normalized main peak, so intensity is preserved without forcing high energy." },
      { code: "afterglow-preservation", section: "outro", targets: ["vocal", "music", "mv"], summary: "Love afterglow uses sustained vocal release, long musical decay, and a held final image." },
      { code: "preset-modulation", targets: ["vocal", "music", "mv"], summary: "Emotional preset favors intimate expression and restrained production density." },
    ],
  },
  validation: { status: "valid", issueCodes: [] },
};
```

実装時は例の値を固定せず、Section Transform、Preset補正、Peak / Afterglowルールから算出する。

## 25. Edge Cases

- 空Section配列: 5 Section fallback、Chorus Peak、Hope Afterglow
- Section欠落: 正式順に補完しRatio全体を既定境界へ修復
- 重複Section: 入力上の最初の有効候補を採用
- 不正Score: 有限な既定値へ置換後clamp
- 不正Ratio、重複時間、空白時間: 既定境界へ全体修復
- mainPeakが0件または複数: Peak Levelと正式順による決定的な1件へ修復
- `mainPeakSection`不一致: 有効な`mainPeakSection`を優先
- 未知Preset: Autoへfallback
- 未知Afterglow: Outro、Graph primary、Hopeの順でfallback
- 高Emotion / 低Energy: Vocal感情強度を保ち、Music / MVの運動量を無理に上げない
- Bridge Peak: 静けさや空白も最大演出として扱う
- Outro Peak: PeakとAfterglowをOutro前半・後半の意味として共存させる
- 同点: 正式Section順、固定enum順で解決
- 非常に長い自由文: V1入力に自由文を含めないためDecision Engineの計算量へ影響しない

## 26. MVP Implementation Plan

次フェーズの候補ファイル:

```text
lib/directorDecisionEngine.ts
components/DirectorDecisionPreview.tsx
```

実装順序:

1. `lib/directorDecisionEngine.ts`に型、正規化、純粋な`createDirectorDecision()`を実装
2. 既存テスト基盤があれば、決定性、境界、fallback、全Preset、3種類のPeakを単体テスト
3. `components/DirectorDecisionPreview.tsx`を読み取り専用のAdvanced Previewとして実装
4. `app/ai-mv/page.tsx`で既存`emotionGraph`と`directorPreset`を`useMemo`経由で`createDirectorDecision()`へ渡す
5. 通常生成APIのrequest / responseは変更せず、Decisionはまずクライアント内Advanced Previewだけへ接続
6. Provider Adapter接続は別フェーズとする

UIとロジックを分離し、Preview内でScore計算、Preset補正、fallbackを重複実装しない。

## 27. Future Extensions

- Story Engine由来のversion付きNarrative Metadata
- Section数が可変になった場合のSchema V2
- Review QueueへDecision Recordを保存する外部Envelope
- CreatorのReview結果を使ったルール評価。ただし自動学習は別仕様
- Provider Capabilityに応じたAdapter fallback matrix
- Vocal / Music / MV Directorを個別サービスへ分離
- 多言語の短いRationale表示
- Decision差分比較とversion migration
- Confidenceを入力品質以外の検証指標へ拡張

## 28. Open Questions

1. 現行EmotionGraphはPeak Decision Reasonを公開していない。将来、Emotion Engineの非破壊的なmetadataとして渡すか。
2. `afterglow`は現在`string`契約の例がある一方、実装ではSupported Emotionである。将来、`warm / bittersweet / empty`など独立したAfterglow型へ分離するか。
3. Tempo RangeをDirector Decisionが所有するか、Music Directorの次段で決めるか。V1案では演出幅としてDecisionが所有する。
4. Section可変化はSchema V2まで禁止するか。
5. `confidence`減算値をどのissue codeで何点とするか。実装前に固定tableが必要である。
6. Advanced PreviewでRationale summaryを日本語化する層をUI側に置くか、表示用Adapterとして分離するか。
7. Decisionを保存する場合の`DecisionRecord` EnvelopeとReview Queueの責務境界を別仕様で定義する必要がある。
