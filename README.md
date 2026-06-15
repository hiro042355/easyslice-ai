# NEXCUT AI
> Smart Video Clipping Platform

YouTubeの動画を自動で切り抜いて、TikTokやYouTubeショート用のクリップを生成するAIツールです。

## 機能

- YouTube URLから動画を自動ダウンロード
- 無音区間検出による自動クリップ候補生成
- 字幕取得＆キーワードスコアリングによるハイライト抽出
- AI要約によるクリップ候補生成
- 複数クリップを一括生成してZIPダウンロード

## 技術スタック

- フロントエンド: Next.js (TypeScript)
- バックエンド: Express.js (port 3001)
- 動画処理: ffmpeg, yt-dlp

## セットアップ

### 必要なもの

- Node.js
- ffmpeg（PATHに追加済み）
- yt-dlp.exe（プロジェクトルートに配置）

### インストール

npm install

### 環境変数

.env.local を作成してください：

OPENAI_API_KEY=your_key_here

### 起動

ターミナル1（メインサーバー）：
npm run dev

ターミナル2（YouTubeサーバー）：
node server.js

ブラウザで http://localhost:3000 を開く。

## 使い方

1. YouTube URLを入力して「動画を取得する」
2. 「字幕取得」でハイライト候補を自動生成
3. 「一括生成」でZIPダウンロード

## 今後の予定

- OpenAI API導入による切り抜き精度向上
- Railwayへのデプロイ
- 課金機能（Stripe）