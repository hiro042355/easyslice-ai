"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import CreatorStylePanel from "../../components/CreatorStylePanel";
import { trackEvent } from "../../lib/analytics";
import { createHookPreview, type AiHookConfig } from "../../lib/aiHook";
import { getCreatorStyleConfig, type CreatorStyle } from "../../lib/creatorStyleConfig";
import { detectUrlSource, type UrlSource } from "../../lib/urlImport";

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

const urlSourceLabels: Record<UrlSource, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  unknown: "Unknown",
};

const aiHookModes: Array<{
  value: AiHookConfig["mode"];
  label: string;
}> = [
  { value: "smart", label: "Smart (Recommended)" },
  { value: "3s", label: "3 sec" },
  { value: "5s", label: "5 sec" },
  { value: "7s", label: "7 sec" },
];

function formatHookTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

export default function WorkspaceFlowPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [universalUrl, setUniversalUrl] = useState("");
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
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [zipDownloadUrl, setZipDownloadUrl] = useState("");
  const [zipFileName, setZipFileName] = useState("");
  const [generatedClipCount, setGeneratedClipCount] = useState(0);
  const [burnedVideoUrl, setBurnedVideoUrl] = useState("");
  const [lastExportCreatorStyleConfig, setLastExportCreatorStyleConfig] = useState("");
  const [creatorStyle, setCreatorStyle] = useState<CreatorStyle>("standard");
  const [animationIntensity, setAnimationIntensity] = useState(3);
  const [aiHookConfig, setAiHookConfig] = useState<AiHookConfig>({
    enabled: false,
    mode: "smart",
  });

  const activeStep = useMemo(
    () => steps.find((step) => step.id === currentStep) ?? steps[0],
    [currentStep]
  );
  const detectedUrlSource = useMemo(
    () => detectUrlSource(universalUrl),
    [universalUrl]
  );
  const detectedUrlSourceLabel = urlSourceLabels[detectedUrlSource];

  useEffect(() => {
    trackEvent("workspace_open", {
      workspace: "creator_flow",
      route: "/workspace-flow",
    });
  }, []);

  const goBack = () => setCurrentStep((step) => Math.max(1, step - 1));
  const goNext = () => setCurrentStep((step) => Math.min(steps.length, step + 1));

  const handleCreatorStyleChange = (style: CreatorStyle) => {
    setCreatorStyle(style);
    trackEvent("creator_style_selected", {
      workspace: "creator_flow",
      style,
      intensity: animationIntensity,
    });
  };

  const handleAnimationIntensityChange = (intensity: number) => {
    setAnimationIntensity(intensity);
    trackEvent("creator_style_selected", {
      workspace: "creator_flow",
      style: creatorStyle,
      intensity,
    });
  };

  const hasVideo = Boolean(video || videoSrc);
  const hasSubtitles = subtitles.length > 0;
  const hasClips = clips.length > 0;
  const subtitleText = subtitles.map((subtitle) => subtitle.text).join("\n");
  const creatorStyleConfig = getCreatorStyleConfig(creatorStyle, animationIntensity);
  const hookPreview = createHookPreview(aiHookConfig);
  const primaryClip = clips[0] ?? {
    start: "0",
    end: "30",
    reason: "",
    title: "Default clip",
    score: 0,
  };

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
      trackEvent("upload_video", {
        workspace: "creator_flow",
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      setClips([]);
      setAnalyzeMessage("");
      setAnalyzeError("");
      setDownloadUrl("");
      setZipDownloadUrl("");
      setZipFileName("");
      setGeneratedClipCount(0);
      setBurnedVideoUrl("");
      setExportMessage("");
      setExportError("");
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
      trackEvent("upload_youtube", {
        workspace: "creator_flow",
        hasTitle: Boolean(info.title),
        duration: info.duration || 0,
      });
      setClips([]);
      setAnalyzeMessage("");
      setAnalyzeError("");
      setDownloadUrl("");
      setZipDownloadUrl("");
      setZipFileName("");
      setGeneratedClipCount(0);
      setBurnedVideoUrl("");
      setExportMessage("");
      setExportError("");
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
      trackEvent("analyze_start", {
        workspace: "creator_flow",
        mode: hasSubtitles ? "subtitle" : "audio_energy",
        hasSubtitles,
      });

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
        trackEvent("analyze_complete", {
          workspace: "creator_flow",
          mode: "subtitle",
          clipCount: sortedClips.length,
        });
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
      trackEvent("analyze_complete", {
        workspace: "creator_flow",
        mode: "audio_energy",
        clipCount: data.clips?.length ?? 0,
      });
    } catch (err) {
      console.error(err);
      setAnalyzeError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const resetExportResult = () => {
    setExportMessage("");
    setExportError("");
    setLastExportCreatorStyleConfig(JSON.stringify(creatorStyleConfig, null, 2));
  };

  const handleExportMp4 = async () => {
    if (!hasVideo) {
      setExportError("先にSTEP1で動画を追加してください。");
      return;
    }

    try {
      setExportLoading(true);
      resetExportResult();

      const formData = new FormData();
      if (video) {
        formData.append("video", video);
      } else {
        formData.append("youtube", "true");
      }
      formData.append("start", primaryClip.start || "0");
      formData.append("end", primaryClip.end || "30");
      formData.append("creatorStyleConfig", JSON.stringify(creatorStyleConfig));
      console.log("CreatorStyleConfig -> /api/cut", creatorStyleConfig);

      const res = await fetch("/api/cut", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("MP4生成に失敗しました");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setExportMessage("MP4を生成しました。");
      trackEvent("export_mp4", {
        workspace: "creator_flow",
        creatorStyle: creatorStyleConfig.style,
        intensity: creatorStyleConfig.intensity,
        clipStart: primaryClip.start,
        clipEnd: primaryClip.end,
      });
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : "MP4生成に失敗しました。");
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportZip = async () => {
    const validClips = clips
      .filter((clip) => clip.start.trim() !== "" && clip.end.trim() !== "")
      .map((clip) => ({
        ...clip,
        start: String(Math.max(0, Number(clip.start))),
        end: String(Number(clip.end)),
      }))
      .filter((clip) => Number(clip.end) > Number(clip.start));

    if (validClips.length === 0) {
      setExportError("ZIP生成にはClip候補が必要です。STEP2でAI解析を実行してください。");
      return;
    }

    try {
      setExportLoading(true);
      resetExportResult();
      console.log("CreatorStyleConfig -> /api/multi-cut", creatorStyleConfig);

      const res = await fetch("/api/multi-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: validClips,
          outputFormat: "normal",
          creatorStyleConfig,
        }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "ZIP生成に失敗しました");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safeTitle =
        videoTitle.trim() !== ""
          ? videoTitle.replace(/[\\/:*?"<>|]/g, "_")
          : "creator-flow";
      const fileName = `${safeTitle}_clips.zip`;

      setZipDownloadUrl(url);
      setZipFileName(fileName);
      setGeneratedClipCount(validClips.length);
      setExportMessage(`${validClips.length}本のクリップをZIPにまとめました。`);
      trackEvent("export_zip", {
        workspace: "creator_flow",
        creatorStyle: creatorStyleConfig.style,
        intensity: creatorStyleConfig.intensity,
        clipCount: validClips.length,
      });
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : "ZIP生成に失敗しました。");
    } finally {
      setExportLoading(false);
    }
  };

  const handleBurnSubtitle = async () => {
    if (!hasVideo) {
      setExportError("先にSTEP1で動画を追加してください。");
      return;
    }

    if (!subtitleText.trim()) {
      setExportError("字幕付き動画には字幕テキストが必要です。字幕ファイルを追加してください。");
      return;
    }

    try {
      setExportLoading(true);
      resetExportResult();
      console.log("CreatorStyleConfig -> /api/burn-subtitle", creatorStyleConfig);

      const res = await fetch("/api/burn-subtitle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: subtitleText,
          start: primaryClip.start || "0",
          end: primaryClip.end || "30",
          creatorStyleConfig,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "字幕付き動画の作成に失敗しました");
      }

      if (data.url) {
        setBurnedVideoUrl(data.url);
      }
      setExportMessage(data.message || "字幕付き動画を作成しました。");
      trackEvent("export_burn_subtitle", {
        workspace: "creator_flow",
        creatorStyle: creatorStyleConfig.style,
        intensity: creatorStyleConfig.intensity,
        clipStart: primaryClip.start,
        clipEnd: primaryClip.end,
      });
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : "字幕付き動画の作成に失敗しました。");
    } finally {
      setExportLoading(false);
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
              Short Video Workspace
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
                  <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-bold text-cyan-200">
                          Universal URL Import
                        </h3>
                        <p className="mt-2 text-xs leading-5 text-gray-400">
                          YouTube / TikTok / Instagram / X のURL種類だけを判定します。動画取得やSNS接続はまだ行いません。
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-bold text-gray-300">
                        Detected Source:{" "}
                        <span className="text-cyan-200">{detectedUrlSourceLabel}</span>
                      </div>
                    </div>

                    <input
                      type="url"
                      value={universalUrl}
                      onChange={(event) => setUniversalUrl(event.target.value)}
                      placeholder="https://youtube.com/... / https://tiktok.com/..."
                      className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/60 focus:bg-cyan-300/10"
                    />

                    <div className="mt-3 rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-3 text-xs leading-5 text-yellow-100">
                      <p className="font-bold">URL Import Safety Notice</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-yellow-100/85">
                        <li>現在はURL判定のみです。</li>
                        <li>YouTube URL取得はβ対応です。</li>
                        <li>TikTok / Instagram / X は今後対応予定です。</li>
                        <li>利用権限のある動画のみ使用してください。</li>
                      </ul>
                    </div>

                    <p className="mt-2 text-xs text-gray-500">
                      判定のみのFoundationです。既存のYouTube取得処理とは分離しています。
                    </p>
                  </section>

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
              ) : activeStep.id === 3 ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                      Creator Style
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-white">
                      作品の見え方を選ぶ
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                      Standardは現在のNEXCUTと同じ安全な出力です。Creatorを選ぶとExportへ演出パラメータを渡します。
                    </p>
                  </div>

                  <CreatorStylePanel
                    creatorStyle={creatorStyle}
                    animationIntensity={animationIntensity}
                    creatorStyleConfig={creatorStyleConfig}
                    onCreatorStyleChange={handleCreatorStyleChange}
                    onAnimationIntensityChange={handleAnimationIntensityChange}
                  />

                  <section className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.05] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                          AI Hook
                        </p>
                        <h3 className="mt-2 text-lg font-black text-white">
                          Add a strong opening moment
                        </h3>
                        <p className="mt-2 text-xs leading-5 text-gray-400">
                          Clipの冒頭に入れるHook候補をPreviewします。今回は動画編集処理には接続しません。
                        </p>
                      </div>

                      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-gray-200">
                        <input
                          type="checkbox"
                          checked={aiHookConfig.enabled}
                          onChange={(event) =>
                            setAiHookConfig((config) => ({
                              ...config,
                              enabled: event.target.checked,
                            }))
                          }
                          className="accent-fuchsia-300"
                        />
                        {aiHookConfig.enabled ? "ON" : "OFF"}
                      </label>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-4">
                      {aiHookModes.map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() =>
                            setAiHookConfig((config) => ({
                              ...config,
                              enabled: true,
                              mode: mode.value,
                            }))
                          }
                          className={
                            aiHookConfig.enabled && aiHookConfig.mode === mode.value
                              ? "rounded-xl border border-fuchsia-300 bg-fuchsia-300/15 px-3 py-3 text-sm font-bold text-white"
                              : "rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-bold text-gray-300 hover:border-fuchsia-300/35 hover:bg-fuchsia-300/10"
                          }
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {hookPreview && (
                      <div className="mt-4 rounded-2xl border border-fuchsia-300/25 bg-black/30 p-4">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Hook
                            </p>
                            <p className="mt-1 text-xl font-black text-white">
                              {formatHookTime(hookPreview.start)}
                            </p>
                            <p className="text-xs font-bold text-gray-500">
                              to {formatHookTime(hookPreview.end)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Duration
                            </p>
                            <p className="mt-1 text-xl font-black text-white">
                              {hookPreview.duration}s
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Confidence
                            </p>
                            <p className="mt-1 text-xl font-black text-fuchsia-200">
                              {hookPreview.confidence}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Source
                            </p>
                            <p className="mt-1 text-sm font-black text-white">
                              AI Highlight
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">
                          Exportへ渡す設定
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          STEP5のMP4 / ZIP / 字幕付き動画生成で、このCreatorStyleConfigを送信します。
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
                        {creatorStyle === "standard" ? "Standard" : `Creator / ${animationIntensity}`}
                      </span>
                    </div>
                  </div>
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
              ) : activeStep.id === 5 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                        Preview
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        保存前に確認
                      </h3>

                      {videoSrc ? (
                        <video
                          src={videoSrc}
                          controls
                          className="mt-4 aspect-video w-full rounded-2xl border border-white/10 bg-black object-contain"
                        />
                      ) : (
                        <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-black/40">
                          <p className="text-sm font-semibold text-gray-500">
                            STEP1で動画を追加するとPreviewできます。
                          </p>
                        </div>
                      )}

                      <div className="mt-4 grid gap-2 text-xs font-semibold sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <p className="text-gray-500">動画</p>
                          <p className={hasVideo ? "mt-1 text-green-300" : "mt-1 text-gray-500"}>
                            {hasVideo ? "追加済み" : "未追加"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <p className="text-gray-500">Clip候補</p>
                          <p className={hasClips ? "mt-1 text-cyan-300" : "mt-1 text-gray-500"}>
                            {hasClips ? `${clips.length}件` : "未生成"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <p className="text-gray-500">字幕</p>
                          <p className={hasSubtitles ? "mt-1 text-purple-300" : "mt-1 text-gray-500"}>
                            {hasSubtitles ? `${subtitles.length}行` : "未追加"}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                        Export
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        保存形式を選ぶ
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        まずは必要な形式だけ保存します。CreatorStyleConfigはExportへ渡されます。
                      </p>

                      <div className="mt-5 space-y-3">
                        <button
                          type="button"
                          onClick={handleExportMp4}
                          disabled={exportLoading || !hasVideo}
                          className={
                            exportLoading || !hasVideo
                              ? "w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-500"
                              : "w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-cyan-200"
                          }
                        >
                          MP4を生成
                        </button>

                        <button
                          type="button"
                          onClick={handleExportZip}
                          disabled={exportLoading || !hasClips}
                          className={
                            exportLoading || !hasClips
                              ? "w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-500"
                              : "w-full rounded-xl border border-green-300/25 bg-green-300/10 px-4 py-3 text-sm font-bold text-green-200 transition hover:bg-green-300/15"
                          }
                        >
                          ZIP一括生成
                        </button>

                        <button
                          type="button"
                          onClick={handleBurnSubtitle}
                          disabled={exportLoading || !hasVideo || !hasSubtitles}
                          className={
                            exportLoading || !hasVideo || !hasSubtitles
                              ? "w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-500"
                              : "w-full rounded-xl border border-purple-300/25 bg-purple-300/10 px-4 py-3 text-sm font-bold text-purple-200 transition hover:bg-purple-300/15"
                          }
                        >
                          字幕付き動画を生成
                        </button>
                      </div>
                    </section>
                  </div>

                  {(exportLoading || exportMessage || exportError) && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      {exportLoading && (
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-cyan-200">
                            <span>Export処理中...</span>
                            <span>Creator Flow</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-300" />
                          </div>
                        </div>
                      )}

                      {exportMessage && (
                        <p className="text-sm font-semibold text-green-300">
                          {exportMessage}
                        </p>
                      )}

                      {exportError && (
                        <p className="whitespace-pre-wrap text-sm font-semibold text-red-300">
                          {exportError}
                        </p>
                      )}
                    </div>
                  )}

                  {(downloadUrl || zipDownloadUrl || burnedVideoUrl) && (
                    <div className="grid gap-3 lg:grid-cols-3">
                      {downloadUrl && (
                        <a
                          href={downloadUrl}
                          download="creator-flow-cut.mp4"
                          className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-center text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
                        >
                          MP4を保存
                        </a>
                      )}

                      {zipDownloadUrl && (
                        <a
                          href={zipDownloadUrl}
                          download={zipFileName || "creator-flow-clips.zip"}
                          className="rounded-2xl border border-green-300/25 bg-green-300/10 p-4 text-center text-sm font-bold text-green-100 transition hover:bg-green-300/15"
                        >
                          ZIPを保存
                          {generatedClipCount > 0 && (
                            <span className="mt-1 block text-xs text-green-200/80">
                              {generatedClipCount} clips
                            </span>
                          )}
                        </a>
                      )}

                      {burnedVideoUrl && (
                        <a
                          href={burnedVideoUrl}
                          download="creator-flow-subtitled.mp4"
                          className="rounded-2xl border border-purple-300/25 bg-purple-300/10 p-4 text-center text-sm font-bold text-purple-100 transition hover:bg-purple-300/15"
                        >
                          字幕付き動画を保存
                        </a>
                      )}
                    </div>
                  )}

                  {burnedVideoUrl && (
                    <section className="rounded-2xl border border-purple-300/20 bg-purple-300/[0.04] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">
                        Subtitled Preview
                      </p>
                      <video
                        src={burnedVideoUrl}
                        controls
                        className="mt-4 aspect-video w-full rounded-2xl border border-white/10 bg-black object-contain"
                      />
                    </section>
                  )}

                  {lastExportCreatorStyleConfig && (
                    <details className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <summary className="cursor-pointer text-sm font-bold text-gray-300">
                        Export Debug / CreatorStyleConfig
                      </summary>
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/50 p-3 text-xs leading-5 text-gray-400">
                        {lastExportCreatorStyleConfig}
                      </pre>
                    </details>
                  )}
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
