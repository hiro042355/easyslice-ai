# NEXCUT AI: AI MV生成 β 実装仕様

## 目的

AI MV生成 βは、既存のStory Wizardとは独立した実験機能として追加する。
既存の「動画を編集するAI」に対して、「出来事や感情から作品を設計するAI」として位置づける。

最初のMVPでは、動画生成・楽曲生成・Voice Cloningは行わない。
入力された出来事、ジャンル、雰囲気から、MV作品の企画一式を生成する。

## ページ

### Route

`/ai-mv`

### Navigation Label

`AI MV生成 β`

### UI方針

- Story Wizardには組み込まない
- 独立ページとして提供する
- 既存NEXCUT AIの操作導線を壊さない
- Beta機能であることを明示する
- 生成コストの高い処理を行わないため、気軽に試せる実験機能として見せる

## 入力項目

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| story | string | yes | 日記、出来事、思い出、感情、恋愛、夢、失敗談など |
| genre | string | yes | J-POP、バラード、ロック、HIPHOP、Lo-fiなど |
| mood | string | yes | 切ない、明るい、映画的、青春、エモい、前向きなど |
| length | string | no | short / medium / long |

## 出力項目

| Field | Type | Notes |
| --- | --- | --- |
| title | string | 曲タイトル |
| lyrics | string | 歌詞 |
| mvConcept | string | MV全体のコンセプト |
| scenes | array | シーン構成 |
| jacketDesign | string | ジャケットデザイン案 |
| thumbnailText | string | サムネ文言 |
| postTitle | string | 投稿タイトル |
| postDescription | string | 投稿説明文 |
| hashtags | array | ハッシュタグ |

## API

### Endpoint

`POST /api/ai-mv`

### Request

```json
{
  "story": "今日、会社で怒られた。帰り道で雨が降っていた。でも家に帰ったら家族が笑って迎えてくれた。",
  "genre": "J-POP",
  "mood": "切ないけど前向き",
  "length": "medium"
}
```

### Response

```json
{
  "title": "雨上がりのただいま",
  "lyrics": "...",
  "mvConcept": "...",
  "scenes": [
    {
      "time": "0:00-0:15",
      "title": "雨の帰り道",
      "description": "濡れたアスファルトと街灯。主人公が一人で歩いている。"
    }
  ],
  "jacketDesign": "...",
  "thumbnailText": "今日のしんどさを一曲にした",
  "postTitle": "会社で怒られた日をAIで曲にしてみた",
  "postDescription": "...",
  "hashtags": ["#AI作曲", "#日記が曲になる", "#NEXCUTAI"]
}
```

## 生成プロンプト方針

AIには、単なる歌詞生成ではなく「ユーザーの出来事を作品化する」役割を与える。

### System Prompt案

```text
あなたはNEXCUT AIのAI MVプランナーです。
ユーザーの日記、出来事、思い出、感情をもとに、SNS投稿に向いた音楽作品の企画を作成してください。
目的は、ユーザーの人生の一場面を、曲・歌詞・MV構成・投稿素材に変換することです。

既存曲、実在アーティスト、特定作品の模倣は避けてください。
歌詞はオリジナルにしてください。
出力は必ずJSONとして返してください。
```

## バリデーション

- storyは10文字以上
- genreは空文字不可
- moodは空文字不可
- storyが長すぎる場合は上限を設定する
- 既存曲の歌詞入力を促さない
- 実在人物の声・作風コピーを前提にしない

## エラー設計

| Case | Message |
| --- | --- |
| story missing | 出来事や思い出を入力してください |
| genre missing | ジャンルを選択してください |
| mood missing | 雰囲気を選択してください |
| API failure | 作品案の生成に失敗しました。少し時間をおいて再度お試しください |
| invalid JSON | 生成結果の解析に失敗しました。再生成してください |

## UI構成

### Left/Form

- Beta badge
- story textarea
- genre select
- mood select
- length segmented control
- generate button
- loading state
- error state

### Right/Result

- 曲タイトル
- 歌詞
- MVコンセプト
- シーン構成
- ジャケットデザイン案
- サムネ文言
- 投稿タイトル
- 投稿説明文
- ハッシュタグ
- copy buttons

## MVPで実装しないもの

- 動画生成
- 楽曲生成
- 音声合成
- Voice Cloning
- MP4書き出し
- YouTube投稿連携
- 画像生成

## 将来拡張

1. ジャケット画像生成
2. 楽曲生成
3. MV生成
4. 自分の声で歌うVoice Cloning
5. 完全なMVとしてMP4出力
6. NEXCUT Studioへの統合

## 成功指標

- 生成ボタン押下率
- 生成完了率
- 生成結果コピー率
- SNS投稿素材のコピー率
- 同一ユーザーの再生成回数
- 「曲生成まで欲しい」と答えたユーザー比率

## 位置づけ

この機能はNEXCUT AIの本線ではなく、低コストで需要を検証するBeta機能とする。
価値が確認できた場合のみ、音楽生成・画像生成・動画生成へ段階的に投資する。
