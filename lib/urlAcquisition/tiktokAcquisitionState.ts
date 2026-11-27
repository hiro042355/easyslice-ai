import type { SupportedTikTokUrl } from "./types";

export type TikTokAcquisitionCapability =
  | "url_recognized_binary_restricted"
  | "user_file_required"
  | "unsupported_link_type";

export type TikTokGuidance = Readonly<{
  capability: TikTokAcquisitionCapability;
  title: string;
  explanation: string;
  actionRequired: string;
  fileAccept: string;
  isAutomatedDownloadAvailable: boolean;
}>;

export function evaluateTikTokAcquisitionGuidance(
  classification: SupportedTikTokUrl | Readonly<{ kind: "UNSUPPORTED_TIKTOK" }>
): TikTokGuidance {
  if (classification.kind === "SUPPORTED_TIKTOK") {
    return Object.freeze({
      capability: "url_recognized_binary_restricted",
      title: "TikTok動画URLを認識しました",
      explanation:
        "TikTok公式APIは動画MP4バイナリの自動取得を提供していません。また、利用規約（第5条）およびクリエイターの権利保護に基づき、無断スクレイピングや自動ダウンロードは行いません。",
      actionRequired:
        "お持ちの動画ファイル（MP4形式）を直接アップロードしてください。アップロードされた動画は既存のAIハイライト解析・縦型9:16切り出し・字幕生成パイプラインで処理されます。",
      fileAccept: "video/mp4",
      isAutomatedDownloadAvailable: false,
    });
  }

  return Object.freeze({
    capability: "unsupported_link_type",
    title: "未対応のTikTokリンクです",
    explanation:
      "プロフィールページ、LIVE配信、ハッシュタグ、サウンド単体のURLは動画クリップ生成の対象外です。",
    actionRequired: "公開された単一のTikTok動画URLを入力するか、動画ファイルを直接アップロードしてください。",
    fileAccept: "video/mp4",
    isAutomatedDownloadAvailable: false,
  });
}
