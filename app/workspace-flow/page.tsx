"use client";

import { useMemo, useState, type DragEvent } from "react";

const steps = [
  {
    id: 1,
    label: "Upload",
    eyebrow: "STEP 1 / 5",
    title: "素材を追加する",
    description: "動画、YouTube URL、字幕ファイルをここに集めます。まずは作る素材を決めるだけです。",
    items: [
      "YouTube URL",
      "動画アップロード",
      "字幕アップロード",
    ],
    note: "主軸は動画アップロードです。YouTube URLはβ導線として扱います。",
  },
  {
    id: 2,
    label: "Analyze",
    eyebrow: "STEP 2 / 5",
    title: "AIで見どころを探す",
    description: "字幕AIまたは音声ハイライトで、ショート動画に使いやすいClip候補を整理します。",
    items: [
      "AI解析",
      "Clip候補",
      "候補理由の確認",
    ],
    note: "このプロトタイプでは解析処理には接続していません。",
  },
  {
    id: 3,
    label: "Creator Style",
    eyebrow: "STEP 3 / 5",
    title: "見え方を選ぶ",
    description: "StandardかCreatorを選び、必要ならAnimation Intensityで字幕の強さを調整します。",
    items: [
      "Standard",
      "Creator",
      "Animation Intensity 1-5",
    ],
    note: "Standardは読みやすく安全。Creatorは字幕に動きと強調を追加します。",
  },
  {
    id: 4,
    label: "Assets",
    eyebrow: "STEP 4 / 5",
    title: "投稿素材を整える",
    description: "字幕、翻訳、タイトル、説明文、ハッシュタグを確認し、投稿できる形へ近づけます。",
    items: [
      "字幕",
      "翻訳",
      "タイトル",
      "説明文",
      "ハッシュタグ",
    ],
    note: "ここでは成果物を増やすより、Previewで確認しやすい状態を目指します。",
  },
  {
    id: 5,
    label: "Export",
    eyebrow: "STEP 5 / 5",
    title: "確認して保存する",
    description: "Previewで最終確認し、MP4やZIPとして保存します。投稿前の最後の確認場所です。",
    items: [
      "Preview",
      "Export",
      "保存",
    ],
    note: "このプロトタイプでは実際のExport処理には接続していません。",
  },
];

type ClipCandidate = {
  start: string;
  end: string;
  reason: string;
  title: string;
  score: number;
};

export default function WorkspaceFlowPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [thumbnail, setThumbnail] = useState("");
  const [currentYoutubeUrl, setCurrentYoutubeUrl] = useState("");
  const [subtitles, setSubtitles] = useState<{ second: number; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [clips, setClips] = useState<ClipCandidate[]>([]);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");

  const activeStep = useMemo(
    () => steps.find((step) => step.id === currentStep) ?? steps[0],
    [currentStep]
  );

  const goBack = () => setCurrentStep((step) => Math.max(1, step - 1));
  const goNext = () => setCurrentStep((step) => Math.min(steps.length, step + 1));

  const hasVideo = Boolean(video || videoSrc);
  const hasSubtitles = subtitles.length > 0;
  const hasClips = clips.length > 0;
  const subtitleText = subtitles.map((subtitle) => subtitle.text).join("\n");

  const resetUploadResult = () => {
    setUploadMessage("");
    setErrorMessage("");
    setProgress(0);
  };

  const parseTimeToSeconds = (timeText: string) => {
    const normalized = timeText.replace(",", ".");
    const parts = normalized.split(":");

    if (parts.length === 1) return Number(parts[0]);

    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      return minutes * 60 + seconds;
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  };

  const parseSubtitleText = (text: string) => {
    const normalized = text.replace(/\r/g, "");
    const blocks = normalized.split(/\n\s*\n/);

    const parsedFromBlocks = blocks
      .map((block) => {
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const timeLine = lines.find((line) => line.includes("-->"));
        if (!timeLine) return null;

        const [startText] = timeLine.split("-->");
        const second = Math.floor(parseTimeToSeconds(startText.trim()));
        const textLines = lines.filter(
          (line) =>
            !line.includes("-->") &&
            !/^\d+$/.test(line) &&
            line.toUpperCase() !== "WEBVTT"
        );
        const subtitleText = textLines.join(" ").trim();

        if (!Number.isFinite(second) || subtitleText === "") return null;

        return { second, text: subtitleText };
      })
      .filter((item) => item !== null) as { second: number; text: string }[];

    if (parsedFromBlocks.length > 0) return parsedFromBlocks;

    return normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [secondText, ...words] = line.split(/\s+/);
        return {
          second: Number(secondText),
          text: words.join(" "),
        };
      })
      .filter((item) => Number.isFinite(item.second) && item.text !== "");
  };

  const handleVideoUpload = async (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setErrorMessage("動画ファイルを選択してください。");
      return;
    }

    try {
      setLoading(true);
      resetUploadResult();

      const formData = new FormData();
      formData.append("video", file);

      const res = await fetch("/api/upload-video", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "動画アップロードに失敗しました");
      }

      setVideo(file);
      setVideoSrc(`/api/video?t=${Date.now()}`);
      setCurrentYoutubeUrl("");
      setVideoTitle(file.name);
      setVideoDuration(0);
      setThumbnail("");
      setProgress(100);
      setUploadMessage("動画をアップロードしました。");
      setClips([]);
      setAnalyzeMessage("");
      setAnalyzeError("");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchYoutube = async () => {
    const trimmedUrl = youtubeUrl.trim();

    if (!trimmedUrl) {
      setErrorMessage("YouTube URLを入力してください。");
      return;
    }

    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(trimmedUrl)) {
      setErrorMessage("YouTubeのURLを入力してください。");
      return;
    }

    try {
      setLoading(true);
      resetUploadResult();
      setProgress(20);

      const infoRes = await fetch("/api/youtube-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const info = await infoRes.json();

      setProgress(55);
      setVideoTitle(info.title || "");
      setVideoDuration(info.duration || 0);
      setThumbnail(info.thumbnail || "");

      const downloadRes = await fetch("/api/youtube-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const result = await downloadRes.json();

      if (!downloadRes.ok || !result.success) {
        throw new Error(result.error || "動画ダウンロードに失敗しました");
      }

      setVideo(null);
      setVideoSrc(`/api/video?t=${Date.now()}`);
      setCurrentYoutubeUrl(trimmedUrl);
      setProgress(100);
      setUploadMessage("YouTubeから動画を取得しました。");
      setClips([]);
      setAnalyzeMessage("");
      setAnalyzeError("");
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      const isYoutubeBlocked =
        message.includes("Sign in to confirm") ||
        message.includes("not a bot") ||
        message.includes("HTTP Error 403") ||
        message.includes("HTTP Error 429") ||
        message.includes("Too Many Requests");

      setErrorMessage(
        isYoutubeBlocked
          ? "YouTubeから動画を取得できませんでした。動画ファイルをダウンロードしてから、動画アップロード機能を使ってください。"
          : message || "YouTubeから動画を取得できませんでした。動画アップロード機能を使ってください。"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubtitleFileUpload = async (file: File | null) => {
    if (!file) return;

    const isSubtitleFile = /\.(txt|srt|vtt)$/i.test(file.name);
    if (!isSubtitleFile) {
      setErrorMessage(".txt / .srt / .vtt の字幕ファイルを選択してください。");
      return;
    }

    try {
      resetUploadResult();
      const text = await file.text();
      const parsedSubtitles = parseSubtitleText(text);

      if (parsedSubtitles.length === 0) {
        setErrorMessage("字幕ファイルを読み取れませんでした。");
        return;
      }

      const safeSubtitles = parsedSubtitles.filter((item) => {
        if (!videoDuration || videoDuration <= 0) return true;
        return item.second >= 0 && item.second <= videoDuration;
      });

      if (safeSubtitles.length === 0) {
        setErrorMessage("動画の長さ内にある字幕がありません。");
        return;
      }

      setSubtitles(safeSubtitles);
      setUploadMessage(`字幕ファイルを読み込みました: ${safeSubtitles.length}行`);
      setClips([]);
      setAnalyzeMessage("");
      setAnalyzeError("");
    } catch (err) {
      console.error(err);
      setErrorMessage("字幕ファイルの読み込みに失敗しました。");
    }
  };

  const handleVideoDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleVideoUpload(event.dataTransfer.files?.[0] ?? null);
  };

  const handleAnalyze = async () => {
    if (!hasVideo) {
      setAnalyzeError("先にSTEP1で動画をアップロードしてください。");
      return;
    }

    try {
      setAnalyzeLoading(true);
      setAnalyzeMessage("");
      setAnalyzeError("");
      setClips([]);

      if (hasSubtitles) {
        const res = await fetch("/api/ai-highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subtitles,
            videoDuration,
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "AIハイライト生成に失敗しました");
        }

        const sortedClips = [...(data.clips ?? [])].sort(
          (a, b) => Number(b.score || 0) - Number(a.score || 0)
        );

        setClips(
          sortedClips.map(
            (clip: {
              start: string;
              end: string;
              reason: string;
              title?: string;
              score?: number;
            }) => ({
              start: String(clip.start),
              end: String(clip.end),
              reason: clip.reason,
              title: clip.title ?? "AIハイライト候補",
              score: clip.score ?? 0,
            })
          )
        );
        setAnalyzeMessage(`${sortedClips.length}個のAIハイライト候補を生成しました。`);
        return;
      }

      const res = await fetch("/api/audio-energy", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "音声ハイライト生成に失敗しました");
      }

      setClips(
        (data.clips ?? []).map(
          (clip: {
            start: string;
            end: string;
            reason: string;
            title: string;
            score: number;
          }) => ({
            start: String(clip.start),
            end: String(clip.end),
            reason: clip.reason,
            title: clip.title,
            score: clip.score,
          })
        )
      );
      setAnalyzeMessage(`${data.clips?.length ?? 0}件の音声ハイライト候補を生成しました。`);
    } catch (err) {
      console.error(err);
      setAnalyzeError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_82%_28%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_50%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <a href="/workspace" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
              ← Workspace Home
            </a>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Creator Flow Prototype
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            One Screen. One Goal.
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8">
          <div className="mx-auto mb-5 flex w-full max-w-4xl items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              STEP {activeStep.id} / {steps.length}
            </p>
            <p className="text-sm font-semibold text-gray-400">
              {activeStep.label}
            </p>
          </div>

          <article
            key={activeStep.id}
            className="mx-auto w-full max-w-5xl rounded-3xl border border-cyan-300/20 bg-zinc-950/80 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl transition-all duration-300 sm:p-8 lg:min-h-[460px]"
          >
            <div className="flex h-full flex-col justify-between gap-8">
              <div>
                <div className="mb-5 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  {activeStep.eyebrow}
                </div>

                <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                  {activeStep.title}
                </h2>

                <p className="mt-5 max-w-2xl text-sm leading-7 text-gray-300 sm:text-base">
                  {activeStep.description}
                </p>
              </div>

              {activeStep.id === 1 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-cyan-200">
                          YouTube URL
                        </h3>
                        <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[11px] font-semibold text-yellow-200">
                          β
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-5 text-gray-400">
                        ローカル環境向けの実験導線です。公開版では動画アップロードを推奨します。
                      </p>

                      <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        YouTube URL
                      </label>
                      <input
                        type="url"
                        value={youtubeUrl}
                        onChange={(event) => setYoutubeUrl(event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=xxxx"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/60 focus:bg-cyan-300/10"
                      />

                      <button
                        type="button"
                        onClick={handleFetchYoutube}
                        disabled={loading}
                        className={
                          loading
                            ? "mt-4 w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-500"
                            : "mt-4 w-full rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:from-red-500 hover:to-red-400"
                        }
                      >
                        YouTubeから動画を取得
                      </button>
                    </section>

                    <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
                      <h3 className="text-base font-bold text-cyan-200">
                        動画アップロード
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-gray-400">
                        MP4などの動画ファイルを追加します。ドラッグ&ドロップにも対応しています。
                      </p>

                      <label
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleVideoDrop}
                        className={
                          isDragging
                            ? "mt-4 flex min-h-[210px] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-300/15 p-5 transition"
                            : "mt-4 flex min-h-[210px] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cyan-400/40 bg-zinc-900/70 p-5 transition hover:border-cyan-300 hover:bg-cyan-300/10"
                        }
                      >
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(event) => handleVideoUpload(event.target.files?.[0] ?? null)}
                          className="hidden"
                        />

                        <div className="text-center">
                          <p className="text-base font-bold text-white">
                            ここをクリック、または動画をドロップ
                          </p>
                          <p className="mt-2 text-sm text-gray-400">
                            動画ファイルをアップロードできます
                          </p>
                          <p className="mt-4 break-all text-sm font-semibold text-cyan-200">
                            {video ? video.name : currentYoutubeUrl ? "YouTube動画を取得済み" : "動画未選択"}
                          </p>
                        </div>
                      </label>
                    </section>
                  </div>

                  {videoTitle && (
                    <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-white/[0.04]">
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          alt="YouTube thumbnail"
                          className="h-44 w-full object-cover"
                        />
                      )}
                      <div className="p-4">
                        <p className="text-sm font-bold text-white">{videoTitle}</p>
                        {videoDuration > 0 && (
                          <p className="mt-1 text-xs font-semibold text-gray-400">
                            {Math.floor(videoDuration)}秒
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <details className="rounded-2xl border border-purple-300/20 bg-purple-300/[0.04] p-4">
                    <summary className="cursor-pointer text-sm font-bold text-purple-200">
                      字幕ファイル（任意）
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-gray-400">
                      字幕がある場合だけ追加できます。字幕がない動画は次のSTEPで音声解析できます。
                    </p>

                    <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-purple-400/40 bg-zinc-900/70 p-4 text-center transition hover:border-purple-300 hover:bg-purple-300/10">
                      <input
                        type="file"
                        accept=".txt,.srt,.vtt"
                        onChange={(event) => handleSubtitleFileUpload(event.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                      <p className="text-sm font-semibold text-white">
                        字幕ファイルを選択
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        .txt / .srt / .vtt に対応しています
                      </p>
                      <p className="mt-3 text-sm font-semibold text-purple-200">
                        {hasSubtitles ? `${subtitles.length}行の字幕を読み込み済み` : "未選択"}
                      </p>
                    </label>
                  </details>

                  {(hasVideo || hasSubtitles || loading || uploadMessage || errorMessage) && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      {loading && (
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-cyan-200">
                            <span>アップロード処理中...</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-cyan-300 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {uploadMessage && (
                        <p className="text-sm font-semibold text-green-300">
                          {uploadMessage}
                        </p>
                      )}

                      {errorMessage && (
                        <p className="whitespace-pre-wrap text-sm font-semibold text-red-300">
                          {errorMessage}
                        </p>
                      )}

                      {(hasVideo || hasSubtitles) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          {hasVideo && (
                            <span className="rounded-full border border-green-300/25 bg-green-300/10 px-3 py-1 text-green-200">
                              動画: 追加済み
                            </span>
                          )}
                          {hasSubtitles && (
                            <span className="rounded-full border border-purple-300/25 bg-purple-300/10 px-3 py-1 text-purple-200">
                              字幕: {subtitles.length}行
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs leading-5 text-gray-500">
                    ご自身が利用権限を持つ動画、または利用許可のある素材をアップロードしてください。
                  </p>
                </div>
              ) : activeStep.id === 2 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                        Source
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        解析する動画
                      </h3>
                      <div className="mt-4 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <span className="text-gray-400">動画</span>
                          <span className={hasVideo ? "font-semibold text-green-300" : "font-semibold text-gray-500"}>
                            {hasVideo ? "追加済み" : "未追加"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <span className="text-gray-400">字幕</span>
                          <span className={hasSubtitles ? "font-semibold text-purple-300" : "font-semibold text-gray-500"}>
                            {hasSubtitles ? `${subtitles.length}行` : "未追加"}
                          </span>
                        </div>
                      </div>

                      {(videoTitle || video?.name || currentYoutubeUrl) && (
                        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="break-all text-sm font-semibold text-white">
                            {videoTitle || video?.name || "YouTube動画"}
                          </p>
                          {currentYoutubeUrl && (
                            <p className="mt-1 break-all text-xs text-gray-500">
                              {currentYoutubeUrl}
                            </p>
                          )}
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                        Analyze
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        AI解析を開始
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        {hasSubtitles
                          ? "読み込んだ字幕をもとに、ショート動画に使いやすい候補を探します。"
                          : "字幕がない場合は、音声の盛り上がりから候補を探します。"}
                      </p>

                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={analyzeLoading || !hasVideo}
                        className={
                          analyzeLoading || !hasVideo
                            ? "mt-5 w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-500"
                            : "mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200"
                        }
                      >
                        {analyzeLoading ? "AI解析中..." : "AI解析を開始"}
                      </button>

                      {!hasVideo && (
                        <p className="mt-3 text-xs font-semibold text-yellow-200">
                          STEP1で動画を追加すると解析できます。
                        </p>
                      )}
                    </section>
                  </div>

                  {(analyzeLoading || analyzeMessage || analyzeError || hasClips) && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      {analyzeLoading && (
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-cyan-200">
                            <span>AIが見どころを解析しています...</span>
                            <span>{hasSubtitles ? "字幕AI" : "音声解析"}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-300" />
                          </div>
                        </div>
                      )}

                      {analyzeMessage && (
                        <p className="text-sm font-semibold text-green-300">
                          {analyzeMessage}
                        </p>
                      )}

                      {analyzeError && (
                        <p className="whitespace-pre-wrap text-sm font-semibold text-red-300">
                          {analyzeError}
                        </p>
                      )}
                    </div>
                  )}

                  {hasClips && (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {clips.map((clip, index) => (
                        <article
                          key={`${clip.start}-${clip.end}-${index}`}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                                Clip {index + 1}
                              </p>
                              <h4 className="mt-1 text-sm font-bold text-white">
                                {clip.title || "ハイライト候補"}
                              </h4>
                            </div>
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-bold text-cyan-200">
                              {clip.score}
                            </span>
                          </div>

                          <p className="mt-3 text-xs font-semibold text-gray-400">
                            {clip.start}s - {clip.end}s
                          </p>
                          <p className="mt-2 text-sm leading-6 text-gray-300">
                            {clip.reason}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeStep.id === 4 ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      Assets Review
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-white">
                      投稿前の素材を確認
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                      現在のCreator Flowで生成済みの素材だけを表示します。未生成の項目は次の移行フェーズで接続します。
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-white">
                          字幕テキスト
                        </h3>
                        <span className={hasSubtitles ? "rounded-full border border-green-300/25 bg-green-300/10 px-2 py-1 text-xs font-bold text-green-200" : "rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-bold text-gray-500"}>
                          {hasSubtitles ? `${subtitles.length}行` : "未生成"}
                        </span>
                      </div>

                      {hasSubtitles ? (
                        <div className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/80 p-3 text-sm leading-6 text-gray-200">
                          {subtitleText}
                        </div>
                      ) : (
                        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-500">
                          字幕はまだ生成または読み込みされていません。
                        </p>
                      )}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-white">
                          翻訳字幕
                        </h3>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-bold text-gray-500">
                          未生成
                        </span>
                      </div>

                      <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-500">
                        翻訳字幕はまだCreator Flowへ移植していません。
                      </p>
                    </section>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-white">
                          投稿タイトル
                        </h3>
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-xs font-bold text-gray-500">
                          未生成
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-gray-500">
                        タイトル生成はまだ接続していません。
                      </p>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-white">
                          説明文
                        </h3>
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-xs font-bold text-gray-500">
                          未生成
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-gray-500">
                        説明文生成はまだ接続していません。
                      </p>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-white">
                          ハッシュタグ
                        </h3>
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-xs font-bold text-gray-500">
                          未生成
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-gray-500">
                        ハッシュタグ生成はまだ接続していません。
                      </p>
                    </section>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {activeStep.items.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <p className="text-sm font-semibold text-white">{item}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      Prototype Note
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-300">
                      {activeStep.note}
                    </p>
                  </div>
                </>
              )}
            </div>
          </article>

          <div className="mx-auto mt-6 flex w-full max-w-4xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 1}
              className={
                currentStep === 1
                  ? "rounded-xl border border-white/10 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-600"
                  : "rounded-xl border border-white/15 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-200 hover:bg-zinc-800"
              }
            >
              戻る
            </button>

            <div className="flex gap-2">
              {steps.map((step) => (
                <span
                  key={step.id}
                  className={
                    step.id === currentStep
                      ? "h-2 w-8 rounded-full bg-cyan-300"
                      : "h-2 w-2 rounded-full bg-white/20"
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={currentStep === steps.length}
              className={
                currentStep === steps.length
                  ? "rounded-xl border border-white/10 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-600"
                  : "rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-cyan-200"
              }
            >
              次へ
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
