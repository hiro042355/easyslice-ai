"use client";

import { useState, useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";


export default function Home() {
 const [postAssets, setPostAssets] = useState<
  {
    clipIndex: number;
    postTitle: string;
    description: string;
    hashtags: string[];
    thumbnailText?: string;
    thumbnailSubText?: string;
    thumbnailLayout?: string;
    thumbnailMood?: string;
  }[]
>([]);
  const [currentYoutubeUrl, setCurrentYoutubeUrl] = useState("");
  const [zipFileName, setZipFileName] = useState("");
const [generatedClipCount, setGeneratedClipCount] = useState(0);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState("");
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  const [expandedClipIndex, setExpandedClipIndex] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [summary, setSummary] = useState("");
const [fullText, setFullText] = useState("");
const [subtitles, setSubtitles] = useState<{second: number; text: string}[]>([]);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [clips, setClips] = useState([
  {
    start: "",
    end: "",
    reason: "",
    title: "",
    score: 0,
  },
]);
const [successMessage, setSuccessMessage] = useState("");
const [errorMessage, setErrorMessage] = useState("");
const [transcriptText, setTranscriptText] = useState("");
const addClip = () => {
  setClips([
    ...clips,
    {
      start: "",
      end: "",
      reason: "",
      title: "",
      score: 0,
    },
  ]);
};

const [scriptLength, setScriptLength] = useState<"15" | "30" | "60" | "90">("30");

const [scriptResult, setScriptResult] = useState<{
  hook: string;
  script: string;
  ending: string;
  fullScript: string;
  length: string;
} | null>(null);
const [resultTab, setResultTab] = useState<"assets" | "script">("assets");
const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
const steps = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Analyze" },
  { id: 3, label: "Clips" },
  { id: 4, label: "Assets" },
  { id: 5, label: "Export" },
] as const;

const canGoStep = (stepId: 1 | 2 | 3 | 4 | 5) => {
  if (stepId === 1) return true;
  if (stepId === 2) return Boolean(videoSrc || video);
  if (stepId === 3) return clips.length > 0;
  if (stepId === 4) return clips.length > 0;
  if (stepId === 5) return clips.length > 0;

  return false;
};
const currentStepGuide = {
  1: "動画と字幕ファイルを追加します。字幕がない動画でも次のSTEPで音声解析できます。",
  2: "字幕AIまたは音声ハイライトで、切り抜き候補を作成します。",
  3: "候補Clipを確認し、開始秒・終了秒を微調整します。",
  4: "投稿タイトル、説明文、ハッシュタグ、サムネ案、AI台本を生成します。",
  5: "出力形式を選び、複数ClipをZIPで一括保存します。",
} as const;
const scrollToStep = (stepId: 1 | 2 | 3 | 4 | 5) => {
  const stepTargets = {
    1: "step-upload",
    2: "step-analyze",
    3: "step-clips",
    4: "step-assets",
    5: "step-export",
  } as const;

  const element = document.getElementById(stepTargets[stepId]);

  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
};
const [outputFormat, setOutputFormat] = useState<"original" | "shorts">("original");
const [thumbnailTemplate, setThumbnailTemplate] = useState<"impact" | "clean" | "news">("impact");
const removeClip = (index: number) => {
  setClips(clips.filter((_, i) => i !== index));
};
const updateClip = (
  index: number,
  field: "start" | "end" | "reason",
  value: string
) => {
  const newClips = [...clips];

  newClips[index][field] = value;

  setClips(newClips);
};
  const [video, setVideo] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
 const setStartFromCurrent = () => {
  if (!videoRef.current) return;
  const current = Math.floor(videoRef.current.currentTime);
  setStart(current.toString());
};
const setEndFromCurrent = () => {
  if (!videoRef.current) return;
  const current = Math.floor(videoRef.current.currentTime);
  setEnd(current.toString());
};

  const [loading, setLoading] = useState(false);
  const [aiCooldownUntil, setAiCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
const isAiCoolingDown = now < aiCooldownUntil;
const aiCooldownSeconds = Math.max(
  0,
  Math.ceil((aiCooldownUntil - now) / 1000)
);
useEffect(() => {
  const timer = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(timer);
}, []);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [cutVideoUrl, setCutVideoUrl] = useState("");
const [videoTitle, setVideoTitle] = useState("");
const [videoDuration, setVideoDuration] = useState(0);
const [thumbnail, setThumbnail] = useState("");
const [videoSrc, setVideoSrc] = useState("");
  // ✂️ 切り抜き
  const handleCut = async () => {
    if ((!video && !videoSrc) || !start || !end) {
      alert("動画・開始・終了を入力してね");
      return;
    }

    setLoading(true);

    setProgress(0);

const interval = setInterval(() => {
  setProgress((prev) => {
    if (prev >= 90) return prev;
    return prev + 5;
  });
}, 500);

    const formData = new FormData();

if (video) {
  formData.append("video", video);
} else {
  formData.append("youtube", "true");
}

formData.append("start", start);
formData.append("end", end);
    const res = await fetch("/api/cut", {
  method: "POST",
  body: formData,
});

const blob = await res.blob();

const url = URL.createObjectURL(blob);

setDownloadUrl(url);
setCutVideoUrl(url);
setProgress(100);
clearInterval(interval);
setLoading(false);
};
 const handleFetchYoutube = async () => {
  if (!youtubeUrl) {
    alert("YouTube URL を入力してね");
    return;
  }

  setLoading(true);
  setProgress(0);

  const interval = setInterval(() => {
    setProgress((prev) => {
      if (prev >= 90) return prev;
      return prev + 5;
    });
  }, 500);

  try {
    const infoRes = await fetch("/api/youtube-info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: youtubeUrl,
      }),
    });

    const info = await infoRes.json();

    console.log(info);

    setVideoTitle(info.title || "");
    setVideoDuration(info.duration || 0);
    setThumbnail(info.thumbnail || "");

    const downloadRes = await fetch("/api/youtube-download", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: youtubeUrl,
  }),
});

const result = await downloadRes.json();

console.log(result);

if (!downloadRes.ok || !result.success) {
  throw new Error(result.error || "動画ダウンロードに失敗しました");
}

setVideoSrc(`/api/video?t=${Date.now()}`);
setCurrentYoutubeUrl(youtubeUrl);
setClips([
  {
    start: "",
    end: "",
    reason: "",
    title: "",
    score: 0,
  },
]);

setSuccessMessage("");
setZipFileName("");
setGeneratedClipCount(0);
setPreviewEnd(null);
setActivePreviewIndex(null);
setDownloadUrl("");
setCutVideoUrl("");
setSummary("");
setFullText("");
setSubtitles([]);
setStart("0");
setEnd("");
setProgress(100);
setErrorMessage("");
        alert("ダウンロード完了");
    } catch (err) {
    console.error(err);

    const message =
      err instanceof Error
        ? err.message
        : "";

    const isYoutubeBlocked =
      message.includes("Sign in to confirm") ||
      message.includes("not a bot") ||
      message.includes("HTTP Error 403") ||
      message.includes("HTTP Error 429") ||
      message.includes("Too Many Requests");

    if (isYoutubeBlocked) {
      setErrorMessage(
        "YouTubeから動画を取得できませんでした。\n\n" +
          "YouTube側の制限により、取得がブロックされた可能性があります。\n\n" +
          "動画ファイルをダウンロードしてから、動画アップロード機能を使ってください。"
      );
    } else {
      setErrorMessage(
        message ||
          "YouTubeから動画を取得できませんでした。動画アップロード機能を使ってください。"
      );
    }
  } finally {
    clearInterval(interval);
    setLoading(false);
  }
};
const handleMultiCut = async () => {
  const durationLimit =
    videoDuration && videoDuration > 0
      ? videoDuration
      : Infinity;

  const validClips = clips
    .filter(
      (clip) =>
        clip.start.trim() !== "" &&
        clip.end.trim() !== ""
    )
    .map((clip) => {
      const start = Math.max(0, Number(clip.start));
      const end = Math.min(durationLimit, Number(clip.end));

      return {
        ...clip,
        start: String(start),
        end: String(end),
      };
    })
    .filter((clip) => Number(clip.end) > Number(clip.start));

  if (validClips.length === 0) {
    alert("動画の長さ内に収まるクリップがありません");
    return;
  }

  const totalSeconds = validClips.reduce((total, clip) => {
    return total + (Number(clip.end) - Number(clip.start));
  }, 0);

  const outputLabel =
  outputFormat === "shorts" ? "Shorts 9:16" : "通常";

const ok = window.confirm(
  `${validClips.length}本 / 合計${totalSeconds}秒 / ${outputLabel} でクリップを生成します。よろしいですか？`
);

  if (!ok) {
    return;
  }

  try {
    setLoading(true);
    setSuccessMessage("");

    const res = await fetch("/api/multi-cut", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
  clips: validClips,
  outputFormat,
}),
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "一括生成に失敗しました");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const safeTitle =
      videoTitle.trim() !== ""
        ? videoTitle.replace(/[\\/:*?"<>|]/g, "_")
        : "clips";

    const fileName = `${safeTitle}_clips.zip`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);

    setZipFileName(fileName);
    setGeneratedClipCount(validClips.length);
setErrorMessage("");
    setSuccessMessage(
      `🎉 ${validClips.length}個のクリップ生成完了`
    );
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "不明なエラー"
    );
  } finally {
    setLoading(false);
  }
};
const handleSubtitle = async () => {
  if (!currentYoutubeUrl) {
    alert("先に動画を取得してください");
    return;
  }

  try {
    const res = await fetch("/api/subtitle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: currentYoutubeUrl,
      }),
    });

    const data = await res.json();

    setFullText(data.fullText ?? "");
    setSubtitles(data.subtitles ?? []);

    console.log(data.highlights);
    console.log(data.subtitles);

    if (data.highlights && data.highlights.length > 0) {
      const newClips = data.highlights.slice(0, 5).map(
        (highlight: { second: number; text: string; score: number }) => ({
          start: String(highlight.second),
          end: String(highlight.second + 30),
          reason: highlight.text + ` (score:${highlight.score})`,
          title: "字幕ハイライト候補",
          score: highlight.score ?? 0,
        })
      );

      setClips(newClips);
      setSuccessMessage(`📝 ${data.highlights.length}件のハイライトを検出`);
    } else if (data.subtitles && data.subtitles.length > 0) {
      setSuccessMessage("字幕を取得しました。AI候補生成を使えます");
    } else {
      setSuccessMessage(
        "字幕が見つかりませんでした。音楽・字幕なし動画の場合は「音声ハイライト生成」を使ってください。"
      );
    }
  } catch (err) {
    console.error(err);
  }
};
useEffect(() => {
  const video = videoRef.current;

  if (!video || previewEnd === null) return;

  const handleTimeUpdate = () => {
    if (video.currentTime >= previewEnd) {
  video.pause();
  setPreviewEnd(null);
  setActivePreviewIndex(null);
}
  };

  video.addEventListener("timeupdate", handleTimeUpdate);

  return () => {
    video.removeEventListener("timeupdate", handleTimeUpdate);
  };
}, [previewEnd]);
 useEffect(() => {
  if (!video) {
    setLocalVideoUrl("");
    return;
  }

  const url = URL.createObjectURL(video);
  setLocalVideoUrl(url);

  return () => {
    URL.revokeObjectURL(url);
  };
}, [video]);
const previewVideoUrl = videoSrc || localVideoUrl;
const validClips = clips.filter(
  (clip) =>
    clip.start.trim() !== "" &&
    clip.end.trim() !== "" &&
    Number(clip.end) > Number(clip.start)
);

const totalClipSeconds = validClips.reduce((total, clip) => {
  return total + (Number(clip.end) - Number(clip.start));
}, 0);
const resetClips = () => {
  setClips([
    {
      start: "",
      end: "",
      reason: "",
      title: "",
      score: 0,
    },
  ]);

  setPostAssets([]);
  setSuccessMessage("");
  setZipFileName("");
  setGeneratedClipCount(0);
  setPreviewEnd(null);
  setActivePreviewIndex(null);
  setScriptResult(null);
};
const singleClipDuration = Math.max(
  0,
  Number(end || 0) - Number(start || 0)
);
const handleUploadVideo = async (file: File | null) => {
  if (!file) {
    return;
  }

  try {
    setLoading(true);
    setSuccessMessage("");

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

    setClips([
      {
        start: "",
        end: "",
        reason: "",
        title: "",
        score: 0,
      },
    ]);

    setSuccessMessage("動画をアップロードしました");
    setZipFileName("");
    setGeneratedClipCount(0);
    setPreviewEnd(null);
    setActivePreviewIndex(null);
    setDownloadUrl("");
    setCutVideoUrl("");
    setSummary("");
    setFullText("");
    setSubtitles([]);
    setStart("0");
    setEnd("");
    setProgress(0);
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "不明なエラー"
    );
  } finally {
    setLoading(false);
  }
};
const parseTimeToSeconds = (timeText: string) => {
  const normalized = timeText.replace(",", ".");
  const parts = normalized.split(":");

  if (parts.length === 1) {
    return Number(parts[0]);
  }

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

    if (!timeLine) {
      return null;
    }

    const [startText] = timeLine.split("-->");
    const second = Math.floor(parseTimeToSeconds(startText.trim()));

    const textLines = lines.filter(
      (line) =>
        !line.includes("-->") &&
        !/^\d+$/.test(line) &&
        line.toUpperCase() !== "WEBVTT"
    );

    const subtitleText = textLines.join(" ").trim();

    if (!Number.isFinite(second) || subtitleText === "") {
      return null;
    }

    return {
      second,
      text: subtitleText,
    };
  })
  .filter((item) => item !== null) as {
    second: number;
    text: string;
  }[];

  if (parsedFromBlocks.length > 0) {
    return parsedFromBlocks;
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [secondText, ...words] = line.split(/\s+/);
      const second = Number(secondText);

      return {
        second,
        text: words.join(" "),
      };
    })
    .filter((item) => Number.isFinite(item.second) && item.text !== "");
};
const handleSubtitleFileUpload = async (file: File | null) => {
  if (!file) return;

  try {
    const text = await file.text();
    const parsedSubtitles = parseSubtitleText(text);

    if (parsedSubtitles.length === 0) {
      alert("字幕ファイルを読み取れませんでした");
      return;
    }

    const safeSubtitles = parsedSubtitles.filter((item) => {
      if (!videoDuration || videoDuration <= 0) return true;

      return item.second >= 0 && item.second <= videoDuration;
    });

    if (safeSubtitles.length === 0) {
      alert("動画の長さ内にある字幕がありません");
      return;
    }

    setSubtitles(safeSubtitles);
    setFullText(safeSubtitles.map((item) => item.text).join(" "));

    setSuccessMessage(
      `字幕ファイルを読み込みました: ${safeSubtitles.length}行`
    );
  } catch (err) {
    console.error(err);
    alert("字幕ファイルの読み込みに失敗しました");
  }
};
const hasPreviewVideo = Boolean(previewVideoUrl);
const hasSubtitles = subtitles.length > 0;
const getScoreClassName = (score: number) => {
  if (score >= 7) {
    return "border-green-400/30 bg-green-400/10 text-green-300";
  }

  if (score >= 4) {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  }

  return "border-gray-400/30 bg-gray-400/10 text-gray-300";
};

const previewClip = (
  clip: { start: string; end: string },
  index: number
) => {
  const video = videoRef.current;

  if (!video) {
    alert("プレビュー動画がありません");
    return;
  }

  const startSecond = Number(clip.start);
  const endSecond = Number(clip.end);

  if (isNaN(startSecond) || isNaN(endSecond) || endSecond <= startSecond) {
    alert("開始秒・終了秒が不正です");
    return;
  }

  setPreviewEnd(endSecond);
  setActivePreviewIndex(index);

  video.pause();
  video.currentTime = startSecond;

  video.addEventListener(
    "seeked",
    () => {
      video.play().catch(console.error);
    },
    { once: true }
  );
};
const handleSummary = async () => {
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: fullText.replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
        subtitles,
      }),
    });

    const data = await res.json();

    setSummary(
      data.highlights
        ?.map((item: any) => item.sentence)
        .join("\n\n") ?? ""
    );

    if (data.highlights && data.highlights.length > 0) {
      const newClips = data.highlights.map((item: any) => ({
        start: String(Math.max(0, item.second - 5)),
        end: String(item.second + 25),
        reason: item.sentence,
        title: "AI要約候補",
        score: item.score ?? 0,
      }));

      setClips(newClips);
      setSuccessMessage(`🤖 ${data.highlights.length}件のAI候補を生成`);
    }
  } catch (err) {
    console.error(err);
  }
};

const handleAiHighlight = async () => {
  if (aiLoading) {
    return;
  }

  if (subtitles.length === 0) {
    alert("先に字幕を取得してください");
    return;
  }

  try {
    setAiLoading(true);
    setSuccessMessage("");

    const res = await fetch("/api/ai-highlight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subtitles,
        videoDuration,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "AIハイライト生成に失敗しました");
    }

    const sortedClips = [...data.clips].sort(
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
          title: clip.title ?? "",
          score: clip.score ?? 0,
        })
      )
    );

    setSuccessMessage(
      `${sortedClips.length}個のAIハイライト候補を生成しました`
    );
  } catch (err) {
    console.error(err);

    const message =
      err instanceof Error
        ? err.message
        : "不明なエラー";

    setSuccessMessage(
      message.includes("混雑") || message.includes("上限")
        ? message
        : `AI候補生成に失敗しました。理由: ${message}`
    );
  } finally {
    setAiLoading(false);
  }
};

const handleAudioEnergy = async () => {
  try {
    setLoading(true);
    setSuccessMessage("");

    const res = await fetch("/api/audio-energy", {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "音声ハイライト生成に失敗しました");
    }

    setClips(
      data.clips.map(
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

    setSuccessMessage(
      `🎧 ${data.clips.length}件の音声ハイライト候補を生成`
    );
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "不明なエラー"
    );
  } finally {
    setLoading(false);
  }
};
const enableYoutube =
  process.env.NEXT_PUBLIC_ENABLE_YOUTUBE === "true";
  const handleVideoFileUpload = async (file: File | null) => {
  if (!file) return;

  try {
    setLoading(true);
    setSuccessMessage("");

    setVideo(file);

    const formData = new FormData();
    formData.append("video", file);

    const res = await fetch("/api/upload-video", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error("動画アップロードに失敗しました");
    }

    setVideoSrc(`/api/video?t=${Date.now()}`);
    setVideoDuration(0);
    setDownloadUrl("");
    setCutVideoUrl("");
setErrorMessage("");
    setSuccessMessage("動画アップロード完了");
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "動画アップロードに失敗しました"
    );
  } finally {
    setLoading(false);
  }
};
const handlePostAssets = async () => {
  if (loading || isAiCoolingDown) return;

  const validClips = clips.filter(
    (clip) =>
      clip.start.trim() !== "" &&
      clip.end.trim() !== ""
  );

  if (validClips.length === 0) {
    setErrorMessage("先にクリップ候補を作成してください");
    return;
  }

  setLoading(true);
  setErrorMessage("");
  setSuccessMessage("");

  try {

    const res = await fetch("/api/post-assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips: validClips,
        videoTitle,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "投稿素材生成に失敗しました");
    }

setPostAssets(data.items ?? []);
setResultTab("assets");
setErrorMessage("");
setSuccessMessage("投稿タイトル・説明文・ハッシュタグを生成しました");
setAiCooldownUntil(Date.now() + 10000);
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "投稿素材生成に失敗しました"
    );
  } finally {
    setLoading(false);
  }
};
const handleScriptGenerate = async () => {
  if (loading || isAiCoolingDown) return;

  const validClips = clips.filter(
    (clip) =>
      clip.start.trim() !== "" &&
      clip.end.trim() !== ""
  );

  if (validClips.length === 0) {
    setErrorMessage("先にクリップ候補を作成してください");
    return;
  }

  setLoading(true);
  setErrorMessage("");
  setSuccessMessage("");

  try {
    const res = await fetch("/api/script", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips: validClips,
        videoTitle,
        summary,
        length: scriptLength,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "台本生成に失敗しました");
    }

 setScriptResult(data.script);
setResultTab("script");
setSuccessMessage(
  data.fallback
    ? "AIが混雑していたため、簡易台本を生成しました"
    : `${scriptLength}秒台本を生成しました`
);
setAiCooldownUntil(Date.now() + 10000);
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "台本生成に失敗しました"
    );
  } finally {
    setLoading(false);
  }
};
const handleTranscriptGenerate = async () => {
  setSuccessMessage("自動字幕ボタンが押されました");

  if (loading) return;
  setLoading(true);
  setErrorMessage("");
  setSuccessMessage("");

  const validClips = clips.filter(
  (clip) =>
    clip.start.trim() !== "" &&
    clip.end.trim() !== ""
);

if (validClips.length === 0) {
  setErrorMessage("先にクリップ候補を作成してください");
  return;
}
  try {
const targetClip = validClips[0];

const res = await fetch("/api/transcript", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    start: targetClip.start,
    end: targetClip.end,
  }),
});

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "自動字幕生成に失敗しました");
    }

    setTranscriptText(data.transcript ?? "");
    setSuccessMessage("自動字幕を生成しました");
  } catch (err) {
    console.error(err);

    setErrorMessage(
      err instanceof Error
        ? err.message
        : "自動字幕生成に失敗しました"
    );
  } finally {
    setLoading(false);
  }
};
const copyText = async (text: string) => {
  if (!text.trim()) {
    alert("コピーする内容がありません");
    return;
  }

  await navigator.clipboard.writeText(text);
  setSuccessMessage("コピーしました");
};
const downloadThumbnail = async (clipIndex: number) => {
  const element = document.getElementById(`thumbnail-preview-${clipIndex}`);

  if (!element) {
    alert("サムネプレビューが見つかりません");
    return;
  }

  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `thumbnail-${clipIndex}.png`;
  a.click();

  setSuccessMessage("サムネ画像を保存しました");
};
  return (
<main className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-blue-900 px-3 py-5 text-white sm:p-6">
  <div className="mx-auto mt-4 max-w-xl rounded-xl border border-white/20 bg-white/10 p-4 shadow-xl backdrop-blur-md animate-fadeIn sm:mt-10 sm:p-8">
       <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
  NEXCUT AI
</h1>
<div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/70 p-4">
  <div className="mb-3 flex items-center justify-between">
    <p className="text-sm font-semibold text-cyan-300">
      Story Wizard
    </p>

    <p className="text-xs text-gray-400">
      STEP {currentStep} / 5
    </p>
  </div>

  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {steps.map((step) => {
      const canGo = canGoStep(step.id);
      const isActive = currentStep === step.id;

      return (
        <button
          key={step.id}
          type="button"
          disabled={!canGo}
          onClick={() => {
  setCurrentStep(step.id);
  scrollToStep(step.id);
}}
          className={
            isActive
              ? "rounded-lg border border-cyan-400 bg-cyan-500/20 px-3 py-3 text-left text-sm font-semibold text-cyan-200"
              : canGo
                ? "rounded-lg border border-white/10 bg-zinc-900 px-3 py-3 text-left text-sm font-semibold text-gray-300 hover:bg-zinc-800"
                : "cursor-not-allowed rounded-lg border border-white/5 bg-zinc-900/50 px-3 py-3 text-left text-sm font-semibold text-gray-600"
          }
        >
          <span className="block text-xs opacity-70">
            0{step.id}
          </span>
          <span>
            {step.label}
          </span>
        </button>
      );
    })}
  </div>
  <p className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
  {currentStepGuide[currentStep]}
</p>
</div>
 <div className="mt-3 grid grid-cols-2 gap-3">
  <button
    type="button"
    onClick={() =>
      setCurrentStep((prev) =>
        prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3 | 4 | 5)
      )
    }
    disabled={currentStep === 1}
    className={
      currentStep === 1
        ? "rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-gray-600 cursor-not-allowed"
        : "rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
    }
  >
    戻る
  </button>

  <button
    type="button"
    onClick={() => {
      const nextStep = Math.min(5, currentStep + 1) as 1 | 2 | 3 | 4 | 5;

      if (!canGoStep(nextStep)) {
        alert("このステップに進むには、先に必要な操作を完了してください");
        return;
      }

      setCurrentStep(nextStep);
    }}
    disabled={currentStep === 5}
    className={
      currentStep === 5
        ? "rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-gray-600 cursor-not-allowed"
        : "rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
    }
  >
    次へ
  </button>
</div>
<div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
  <p className="text-xs font-semibold text-cyan-300">
    STEP {currentStep}
  </p>
  <p className="mt-1 text-sm leading-6 text-gray-300">
    {currentStepGuide[currentStep]}
  </p>
</div>
<div className="mb-6 flex flex-wrap gap-4">
  <a
    href="/landing"
    className="inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200"
  >
    ← 紹介ページへ戻る
  </a>

  <a
    href="/guide"
    className="inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200"
  >
    使い方を見る
  </a>
  <a
  href="/guide#video"
  className="inline-block text-sm font-semibold text-pink-300 hover:text-pink-200"
>
  3分で使い方を見る
</a>
</div>
<p className="text-zinc-400 text-sm mt-2">
  Smart Video Clipping Platform
</p>
{currentStep === 1 && (
  <div id="step-upload">
{enableYoutube && (
  <>
    <h2 className="mt-6 mb-3 text-lg font-semibold text-cyan-300">
      YouTubeから取得
    </h2>

    {/* YouTube URL */}
    <div className="mb-4">
      <label className="block mb-2 font-semibold">YouTube URL</label>
      <input
        type="text"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=xxxx"
        className="w-full p-2 rounded bg-white/20 border border-white/30"
      />
    </div>

    <p className="mt-2 mb-4 text-xs text-yellow-300">
      YouTube取得はローカル環境向けの実験機能です。公開版では動画アップロードを推奨します。
    </p>

    <button
      type="button"
      onClick={handleFetchYoutube}
      disabled={loading}
      className="w-full py-3 mb-4 rounded-lg font-semibold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 transition-all duration-300 shadow-lg hover:shadow-red-500/40"
    >
      YouTubeから動画を取得
    </button>
  </>
)}
{videoTitle && (
  <div className="mb-6 overflow-hidden rounded-xl border border-cyan-500/20 bg-zinc-900 shadow-xl shadow-cyan-500/10 hover:shadow-cyan-500/30 transition-all duration-300">
    
    {thumbnail && (
      <img
        src={thumbnail}
        alt="thumbnail"
        className="w-full object-cover"
      />
    )}

    <div className="p-4">
      <h2 className="text-lg font-bold text-white mb-2">
        {videoTitle}
      </h2>

      <p className="text-gray-300">
        ⏱ {videoDuration} 秒
      </p>
    </div>

  </div>
)}
<h2 className="mb-3 text-lg font-semibold text-cyan-300">
  動画をアップロード
</h2>

<label className="block cursor-pointer rounded-xl border-2 border-dashed border-cyan-500/40 bg-zinc-900/60 p-5 transition hover:border-cyan-400 hover:bg-cyan-500/10">
  <input
  type="file"
  accept="video/*"
  onChange={(e) => handleVideoFileUpload(e.target.files?.[0] || null)}
  className="hidden"
/>

  <div className="text-center">
    <p className="text-base font-semibold text-white">
      ここをクリックして動画を選択
    </p>

    <p className="mt-2 text-sm text-gray-400">
      MP4などの動画ファイルをアップロードできます
    </p>

    <p className="mt-3 text-sm font-semibold text-cyan-300">
      {video ? video.name : "未選択"}
    </p>
  </div>
</label>
<div className="mt-4">
  <h2 className="mb-3 text-lg font-semibold text-cyan-300">
  字幕ファイル
</h2>

<label className="block cursor-pointer rounded-xl border-2 border-dashed border-purple-500/40 bg-zinc-900/60 p-5 transition hover:border-purple-400 hover:bg-purple-500/10">
  <input
    type="file"
    accept=".txt,.srt,.vtt"
    onChange={(e) => handleSubtitleFileUpload(e.target.files?.[0] || null)}
    className="hidden"
  />

  <div className="text-center">
    <p className="text-base font-semibold text-white">
      ここをクリックして字幕ファイルを選択
    </p>

    <p className="mt-2 text-sm text-gray-400">
      .txt / .srt / .vtt に対応しています
    </p>

    <p className="mt-3 text-sm font-semibold text-purple-300">
      {subtitles.length > 0
        ? `${subtitles.length}行の字幕を読み込み済み`
        : "未選択"}
    </p>
  </div>
</label>
</div>
<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
  <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
    <p className="text-sm text-gray-400">
      動画
    </p>

    <p className={hasPreviewVideo ? "mt-1 font-semibold text-green-300" : "mt-1 font-semibold text-gray-500"}>
      {hasPreviewVideo
        ? `アップロード済み / ${Math.floor(videoDuration || 0)}秒`
        : "未アップロード"}
    </p>
  </div>

  <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
    <p className="text-sm text-gray-400">
      字幕
    </p>

    <p className={hasSubtitles ? "mt-1 font-semibold text-green-300" : "mt-1 font-semibold text-gray-500"}>
      {hasSubtitles
        ? `${subtitles.length}行 読み込み済み`
        : "未読み込み"}
    </p>
  </div>
</div>
<p className="mt-3 text-xs text-gray-400">
  字幕がある動画は「AIが内容から候補生成」、字幕がない動画や音楽は「音声ハイライト生成」を使ってください。
</p>
  </div>
)}
        {/* 切り抜き範囲 */}
<div className="mb-6">
  <label className="block text-sm font-semibold mb-2 text-gray-300">
    切り抜き範囲
  </label>

  <p className="mb-2 text-cyan-300 font-semibold">
    開始: {start}秒 / 終了: {end}秒
  </p>

  <Slider
    range
    min={0}
    max={videoDuration}
    value={[
      Number(start),
      Number(end),
    ]}
    onChange={(value) => {
      const values = value as number[];
      setStart(String(values[0]));
      setEnd(String(values[1]));
    }}
  />
</div>

{currentStep === 3 && (
  <div
    id="step-clips"
    className="mt-6 rounded-xl border border-cyan-500/20 bg-zinc-900/70 p-4"
  >
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-cyan-300">
        複数クリップ
      </h2>

      <span className="text-sm text-gray-400">
        {clips.length} clips
      </span>
    </div>

    {clips.map((clip, index) => (
      <div
        key={index}
        className={
          activePreviewIndex === index
            ? "mb-4 rounded-xl border border-cyan-400 bg-cyan-500/10 p-4 shadow-lg shadow-cyan-500/20"
            : "mb-4 rounded-xl border border-white/10 bg-zinc-800 p-4"
        }
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-cyan-300 font-semibold">
              Clip {index + 1}
            </p>

            {clip.title && (
              <p className="mt-1 text-sm font-semibold text-white">
                {clip.title}
              </p>
            )}

            {clip.reason && (
              <div className="mt-1">
                <p
                  className={
                    expandedClipIndex === index
                      ? "text-sm text-purple-300"
                      : "line-clamp-4 text-sm text-purple-300"
                  }
                >
                  {clip.reason}
                </p>

                {clip.reason.length > 120 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedClipIndex(
                        expandedClipIndex === index ? null : index
                      )
                    }
                    className="mt-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    {expandedClipIndex === index ? "閉じる" : "全文を見る"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ml-4 flex shrink-0 flex-col items-end gap-3">
            {clip.score > 0 && (
              <span
                className={`rounded-full border px-3 py-2 text-xs font-semibold ${getScoreClassName(
                  clip.score
                )}`}
              >
                score {clip.score}
              </span>
            )}

            <button
              type="button"
              onClick={() => previewClip(clip, index)}
              className="rounded-lg border border-cyan-400/30 px-3 py-1 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/10"
            >
              プレビュー
            </button>

            {clips.length > 1 && (
              <button
                type="button"
                onClick={() => removeClip(index)}
                className="rounded-lg border border-red-400/30 px-3 py-1 text-sm font-semibold text-red-400 hover:bg-red-400/10"
              >
                削除
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block mb-1 text-xs text-gray-400">
              開始秒
            </label>

            <input
              type="number"
              placeholder="10"
              value={clip.start}
              onChange={(e) =>
                updateClip(index, "start", e.target.value)
              }
              className="w-full rounded-lg bg-zinc-700 p-2 border border-white/10 focus:outline-none focus:border-cyan-400"
            />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updateClip(
                    index,
                    "start",
                    String(Math.max(0, Number(clip.start) - 5))
                  )
                }
                className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-600"
              >
                -5秒
              </button>

              <button
                type="button"
                onClick={() =>
                  updateClip(
                    index,
                    "start",
                    String(Number(clip.start) + 5)
                  )
                }
                className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-600"
              >
                +5秒
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-xs text-gray-400">
              終了秒
            </label>

            <input
              type="number"
              placeholder="20"
              value={clip.end}
              onChange={(e) =>
                updateClip(index, "end", e.target.value)
              }
              className="w-full rounded-lg bg-zinc-700 p-2 border border-white/10 focus:outline-none focus:border-cyan-400"
            />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updateClip(
                    index,
                    "end",
                    String(Math.max(0, Number(clip.end) - 5))
                  )
                }
                className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-600"
              >
                -5秒
              </button>

              <button
                type="button"
                onClick={() =>
                  updateClip(
                    index,
                    "end",
                    String(Number(clip.end) + 5)
                  )
                }
                className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-600"
              >
                +5秒
              </button>
            </div>
          </div>
        </div>
      </div>
    ))}

    <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-sm text-gray-300">
      生成予定:{" "}
      <span className="font-semibold text-cyan-300">
        {validClips.length}
      </span>
      本 / 合計{" "}
      <span className="font-semibold text-cyan-300">
        {totalClipSeconds}
      </span>
      秒
    </div>
  </div>
)}
{currentStep === 2 && (
  <div id="step-analyze">
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
    <button
      type="button"
      onClick={addClip}
      className="w-full px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 transition"
    >
      ＋ クリップ追加
    </button>
{enableYoutube && (
  <button
    type="button"
    onClick={handleSubtitle}
    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition"
  >
    YouTube字幕取得
  </button>
)}
<button
  type="button"
  onClick={handleAiHighlight}
  disabled={aiLoading || subtitles.length === 0}
  className={
    aiLoading || subtitles.length === 0
      ? "px-4 py-2 rounded-xl bg-gray-600 cursor-not-allowed"
      : "px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 transition"
  }
>
  {aiLoading ? "AI解析中..." : "字幕AIハイライト"}
</button>
{aiLoading && (
  <div className="mt-4 animate-pulse text-purple-300 font-semibold">
    AIが字幕を解析中...
  </div>
)}
<button
  type="button"
  onClick={handleSummary}
  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition"
>
  字幕要約
</button>
<button
  type="button"
  onClick={handleAudioEnergy}
  disabled={loading}
  className={
    loading
      ? "w-full rounded-xl bg-gray-600 px-4 py-2 cursor-not-allowed"
      : "w-full rounded-xl bg-emerald-600 px-4 py-2 transition hover:bg-emerald-500"
  }
>
  音声ハイライト
</button>
    </div>
  </div>
)}
{currentStep === 5 && (
  <div id="step-export">

<div className="col-span-full mb-4 rounded-xl border border-white/10 bg-zinc-900 p-4">
  <p className="mb-3 text-sm font-semibold text-cyan-300">
    出力形式
  </p>

  <div className="grid grid-cols-2 gap-2">
    <button
      type="button"
      onClick={() => setOutputFormat("original")}
      className={
        outputFormat === "original"
          ? "rounded-lg border border-cyan-400 bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-200"
          : "rounded-lg border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-zinc-700"
      }
    >
      通常
    </button>

    <button
      type="button"
      onClick={() => setOutputFormat("shorts")}
      className={
        outputFormat === "shorts"
          ? "rounded-lg border border-pink-400 bg-pink-500/20 px-4 py-3 text-sm font-semibold text-pink-200"
          : "rounded-lg border border-white/10 bg-zinc-800 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-zinc-700"
      }
    >
      Shorts 9:16
    </button>
  </div>

  <p className="mt-3 text-xs leading-5 text-gray-400">
    Shorts 9:16は中央クロップで縦動画として出力します。
  </p>
</div>

<button
  type="button"
  onClick={handleMultiCut}
  disabled={loading}
  className={
    loading
      ? "px-4 py-2 rounded-xl bg-gray-600 cursor-not-allowed"
      : "px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 transition"
  }
>
  {loading ? "生成中..." : "ZIP一括生成"}
</button>

<button
  type="button"
  onClick={resetClips}
  className="w-full rounded-xl bg-zinc-700 px-4 py-2 transition hover:bg-zinc-600"
>
  リセット
</button>





    {loading && (
    <div className="mt-4 animate-pulse text-cyan-300 font-semibold">
      ZIP生成中... クリップ数が多い場合は少し時間がかかります
    </div>
  )}

  {successMessage && (
    <div className="mt-4 text-green-400 font-semibold">
      {successMessage}
    </div>
  )}
 {errorMessage && (
  <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-200">
    <div className="flex items-start justify-between gap-3">
      <p className="whitespace-pre-wrap">
        {errorMessage}
      </p>

      <button
        type="button"
        onClick={() => setErrorMessage("")}
        className="shrink-0 rounded-lg border border-red-300/20 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-400/10"
      >
        閉じる
      </button>
    </div>
  </div>
)}

{zipFileName && generatedClipCount > 0 && (
  <div className="mt-6 rounded-xl border border-green-400/20 bg-green-400/10 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-green-300">
          一括生成完了
        </p>

        <p className="mt-1 text-sm text-gray-300">
          {generatedClipCount}本のクリップをZIPにまとめました
        </p>

        <p className="mt-1 text-xs text-gray-400">
          {zipFileName}
        </p>
      </div>

      <span className="rounded-full border border-green-400/30 px-3 py-1 text-xs font-semibold text-green-300">
        ZIP
      </span>
    </div>
  </div>
)}
  </div>
)}
{resultTab === "script" && scriptResult && (
  <div className="mt-6 rounded-xl border border-amber-500/20 bg-zinc-900/70 p-4">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-amber-300">
          AI台本
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          Hook・本文・締め・全文台本
        </p>
      </div>

      <span className="text-sm text-gray-400">
        {scriptResult.length}秒
      </span>
    </div>

    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-zinc-800 p-4">
        <p className="text-sm font-semibold text-cyan-300">
          Hook
        </p>
        <p className="mt-2 text-white">
          {scriptResult.hook}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-800 p-4">
        <p className="text-sm font-semibold text-cyan-300">
          Script
        </p>
        <p className="mt-2 whitespace-pre-wrap leading-7 text-gray-300">
          {scriptResult.script}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-800 p-4">
        <p className="text-sm font-semibold text-cyan-300">
          Ending
        </p>
        <p className="mt-2 text-white">
          {scriptResult.ending}
        </p>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-amber-300">
            Full Script
          </p>

          <button
            type="button"
            onClick={() => copyText(scriptResult.fullScript)}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500"
          >
            コピー
          </button>
        </div>

        <p className="mt-2 whitespace-pre-wrap leading-7 text-gray-100">
          {scriptResult.fullScript}
        </p>
      </div>
    </div>
  </div>
)}
{currentStep === 4 && (
  <div id="step-assets">
    <div className="mt-6 rounded-xl border border-fuchsia-500/20 bg-zinc-900/70 p-4">
  <h2 className="mb-4 text-lg font-semibold text-fuchsia-300">
    投稿素材を生成
  </h2>
  <button
  type="button"
  onClick={handlePostAssets}
  disabled={loading || isAiCoolingDown || clips.length === 0}
  className={
    loading || clips.length === 0
      ? "w-full rounded-xl bg-gray-600 px-4 py-2 cursor-not-allowed"
      : "w-full rounded-xl bg-fuchsia-600 px-4 py-2 transition hover:bg-fuchsia-500"
  }
>
  {isAiCoolingDown
  ? `待機中 ${aiCooldownSeconds}秒`
  : "投稿素材生成"}
</button>
<p className="mt-3 text-xs leading-5 text-gray-400">
  投稿素材は負荷を抑えるため、入力済みClipの上位3件まで生成します。
</p>

<div className="mt-4 grid grid-cols-2 gap-2">
  <select
    value={scriptLength}
    onChange={(e) =>
      setScriptLength(e.target.value as "15" | "30" | "60" | "90")
    }
    className="w-full rounded-xl bg-zinc-700 px-4 py-2 text-white"
  >
    <option value="15">15秒台本</option>
    <option value="30">30秒台本</option>
    <option value="60">60秒台本</option>
    <option value="90">90秒台本</option>
  </select>

<button
  type="button"
  onClick={handleScriptGenerate}
  disabled={loading || isAiCoolingDown || clips.length === 0}
  className={
    loading || clips.length === 0
      ? "w-full rounded-xl bg-gray-600 px-4 py-2 cursor-not-allowed"
      : "w-full rounded-xl bg-amber-600 px-4 py-2 transition hover:bg-amber-500"
  }
>
  {isAiCoolingDown
    ? `待機中 ${aiCooldownSeconds}秒`
    : "AI台本生成"}
</button>

<button
  type="button"
  onClick={handleTranscriptGenerate}
  className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2 transition hover:bg-sky-500"
>
  自動字幕生成
</button>
{transcriptText && (
  <div className="mt-4 rounded-xl border border-sky-500/20 bg-zinc-900/70 p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-sky-300">
          自動字幕
        </h2>

        <p className="mt-1 text-xs text-gray-400">
          文字起こし結果・字幕テキスト
        </p>
      </div>

      <button
        type="button"
        onClick={() => copyText(transcriptText)}
        className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
      >
        コピー
      </button>
    </div>

    <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-800 p-4 text-sm leading-7 text-gray-200">
      {transcriptText}
    </p>
  </div>
)}
</div>
</div>

{(postAssets.length > 0 || scriptResult) && (
  <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950/70 p-2">
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setResultTab("assets")}
        className={
          resultTab === "assets"
            ? "rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white"
            : "rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-zinc-700"
        }
      >
        投稿素材
        {postAssets.length > 0 && (
          <span className="ml-2 text-xs opacity-80">
            {postAssets.length}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setResultTab("script")}
        className={
          resultTab === "script"
            ? "rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
            : "rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-zinc-700"
        }
      >
        AI台本
        {scriptResult && (
          <span className="ml-2 text-xs opacity-80">
            {scriptResult.length}秒
          </span>
        )}
      </button>
    
{transcriptText && (
  <div className="mt-6 rounded-xl border border-sky-500/20 bg-zinc-900/70 p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-sky-300">
          自動字幕
        </h2>

        <p className="mt-1 text-xs text-gray-400">
          文字起こし結果・字幕テキスト
        </p>
      </div>

      <button
        type="button"
        onClick={() => copyText(transcriptText)}
        className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
      >
        コピー
      </button>
    </div>

    <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-800 p-4 text-sm leading-7 text-gray-200">
      {transcriptText}
    </p>
  </div>
)}
    </div>
  </div>
)}
{resultTab === "assets" && postAssets.length > 0 && (
  <div className="mt-6 rounded-xl border border-fuchsia-500/20 bg-zinc-900/70 p-4">
    <div className="mb-4 flex items-center justify-between">
      <div>
  <h2 className="text-lg font-semibold text-fuchsia-300">
    投稿素材
  </h2>
  <div className="mb-4 rounded-xl border border-white/10 bg-zinc-950/70 p-3">
  <p className="mb-2 text-xs font-semibold text-gray-400">
    サムネテンプレート
  </p>

  <div className="grid grid-cols-3 gap-2">
    {[
      ["impact", "Impact"],
      ["clean", "Clean"],
      ["news", "News"],
    ].map(([value, label]) => (
      <button
        key={value}
        type="button"
        onClick={() =>
          setThumbnailTemplate(value as "impact" | "clean" | "news")
        }
        className={
          thumbnailTemplate === value
            ? "rounded-lg border border-fuchsia-400 bg-fuchsia-500/20 px-3 py-2 text-xs font-semibold text-fuchsia-200"
            : "rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-zinc-700"
        }
      >
        {label}
      </button>
    ))}
  </div>
</div>
  <p className="mt-1 text-xs text-gray-400">
    投稿タイトル・説明文・ハッシュタグ・サムネ案
  </p>
</div>

      <span className="text-sm text-gray-400">
        {postAssets.length} items
      </span>
    </div>

   <div className="space-y-4">
  {postAssets.map((item) => (
    <div
      key={item.clipIndex}
      className="rounded-xl border border-white/10 bg-zinc-800 p-4"
    >
      <p className="text-sm font-semibold text-cyan-300">
        Clip {item.clipIndex}
      </p>

      <div className="mt-3 rounded-lg border border-white/10 bg-zinc-900/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-cyan-300">
            投稿タイトル
          </p>

          <button
            type="button"
            onClick={() => copyText(item.postTitle)}
            className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            コピー
          </button>
        </div>

        <h3 className="font-bold text-white">
          {item.postTitle}
        </h3>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-zinc-900/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-cyan-300">
            説明文
          </p>

          <button
            type="button"
            onClick={() => copyText(item.description)}
            className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            コピー
          </button>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-300">
          {item.description}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-zinc-900/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-cyan-300">
            ハッシュタグ
          </p>

          <button
            type="button"
            onClick={() => copyText(item.hashtags.join(" "))}
            className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            コピー
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {(item.thumbnailText ||
        item.thumbnailSubText ||
        item.thumbnailLayout ||
        item.thumbnailMood) && (
        <div className="mt-4 rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-yellow-300">
              サムネ案
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  copyText(
                    [
                      item.thumbnailText,
                      item.thumbnailSubText,
                      item.thumbnailLayout
                        ? `構成: ${item.thumbnailLayout}`
                        : "",
                      item.thumbnailMood
                        ? `雰囲気: ${item.thumbnailMood}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n")
                  )
                }
                className="rounded-lg bg-yellow-600 px-3 py-1 text-xs font-semibold text-white hover:bg-yellow-500"
              >
                コピー
              </button>

              <button
                type="button"
                onClick={() => downloadThumbnail(item.clipIndex)}
                className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                サムネ画像を保存
              </button>
            </div>
          </div>

          {item.thumbnailText && (
            <div
              id={`thumbnail-preview-${item.clipIndex}`}
              className="mt-3 aspect-video overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-black via-fuchsia-950 to-cyan-950 p-5 shadow-lg shadow-fuchsia-500/10"
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-zinc-950">
                    SHORTS
                  </span>

                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs font-semibold text-white">
                    NEXCUT AI
                  </span>
                </div>

                <div className="max-w-[85%]">
                  <p className="text-3xl font-black leading-tight text-white drop-shadow-lg">
                    {item.thumbnailText}
                  </p>

                  {item.thumbnailSubText && (
                    <p className="mt-2 inline-block rounded bg-cyan-400 px-2 py-1 text-sm font-bold text-zinc-950">
                      {item.thumbnailSubText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 text-sm leading-6 text-gray-300">
            {item.thumbnailLayout && (
              <p>
                <span className="font-semibold text-yellow-300">
                  構成:
                </span>{" "}
                {item.thumbnailLayout}
              </p>
            )}

            {item.thumbnailMood && (
              <p>
                <span className="font-semibold text-yellow-300">
                  雰囲気:
                </span>{" "}
                {item.thumbnailMood}
              </p>
            )}
          </div>
        </div>
      )}
</div>
  ))}
</div>
  </div>
)}

</div>
)}

{summary && (
  <div className="mt-4 p-4 rounded-xl bg-zinc-800">
    <p className="font-bold mb-2">AI要約</p>
    <p className="text-sm text-gray-300">{summary}</p>
  </div>
)}

{/* プレビュー */}
{videoSrc && (
  <video
    ref={videoRef}
    src={videoSrc}
    controls
    onLoadedMetadata={(e) => {
      const duration = Math.floor(e.currentTarget.duration);

      if (Number.isFinite(duration) && duration > 0) {
        setVideoDuration(duration);
      }
    }}
    className="w-full rounded"
  />
)}
  
{loading && (
  <div className="mt-6">

    <div className="flex justify-between text-sm text-cyan-300 mb-2">
      <span>Analyzing Video...</span>
      <span>{progress}%</span>
    </div>

    <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden border border-cyan-500/20">

      <div
        className="
          h-full
          bg-gradient-to-r
          from-cyan-500
          to-blue-500
          transition-all
          duration-500
        "
        style={{
          width: `${progress}%`,
        }}
      />

    </div>

  </div>
)}

{downloadUrl && (
  <div className="mt-6 overflow-hidden rounded-xl border border-cyan-500/20 bg-zinc-950 shadow-xl shadow-cyan-500/10">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
      <div>
        <div className="inline-flex items-center gap-2 text-green-400 text-sm font-semibold">
          <span>●</span>
<span>エンコード完了</span>
        </div>

        <h2 className="mt-2 text-xl font-bold text-cyan-300">
          Clip Complete
        </h2>

        <p className="mt-1 text-sm text-gray-400">
          {start}秒 → {end}秒 / 長さ {Math.max(0, Math.max(0, Number(end) - Number(start)))} 秒
        </p>
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-right">
        <p className="text-xs text-gray-400">
          FORMAT
        </p>
        <p className="text-sm font-semibold text-cyan-300">
          MP4
        </p>
      </div>
    </div>

    <div className="bg-black">
      <video
        src={downloadUrl}
        controls
        className="w-full border-y border-white/10"
      />
    </div>

    <div className="grid grid-cols-3 gap-3 border-t border-white/10 p-4 text-sm">
      <div className="rounded-lg bg-zinc-900 p-3">
        <p className="text-gray-500">
          Start
        </p>
        <p className="font-semibold text-white">
          {start}s
        </p>
      </div>

      <div className="rounded-lg bg-zinc-900 p-3">
        <p className="text-gray-500">
          End
        </p>
        <p className="font-semibold text-white">
          {end}s
        </p>
      </div>

      <div className="rounded-lg bg-zinc-900 p-3">
        <p className="text-gray-500">
          Duration
        </p>
        <p className="font-semibold text-white">
          {Math.max(0, Number(end) - Number(start))}s
        </p>
      </div>
    </div>

       <div className="border-t border-white/10 p-4">
      <a
        href={downloadUrl}
        download="cut.mp4"
        className="block w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3 text-center font-semibold text-white shadow-lg transition-all duration-300 hover:from-cyan-400 hover:to-blue-400 hover:shadow-cyan-500/40"
      >
        ⬇ MP4を保存
      </a>
    </div>
  </div>
)}

            </div>
    </main>
  )
}