"use client";

import { useState, useRef, useEffect } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

export default function Home() {
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [clips, setClips] = useState([
  {
    start: "",
    end: "",
    reason: "",
  },
]);
const [successMessage, setSuccessMessage] = useState("");
const addClip = () => {
  setClips([
    ...clips,
    {
      start: "",
      end: "",
      reason: "",
    },
  ]);
};
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
    const infoRes = await fetch("http://localhost:3001/youtube", {
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

    const downloadRes = await fetch("http://localhost:3001/youtube-download", {
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

    setVideoSrc(
      "http://localhost:3001/downloads/downloaded.mp4?t=" + Date.now()
    );

    setProgress(100);
    alert("ダウンロード完了");
  } catch (err) {
    console.error(err);
    alert("失敗");
  } finally {
    clearInterval(interval);
    setLoading(false);
  }
};
const handleMultiCut = async () => {
  const validClips = clips.filter(
    (clip) =>
      clip.start.trim() !== "" &&
      clip.end.trim() !== ""
  );

  if (validClips.length === 0) {
    alert("クリップを入力してください");
    return;
  }

  const hasInvalidClip = validClips.some(
    (clip) => Number(clip.end) <= Number(clip.start)
  );

  if (hasInvalidClip) {
    alert("終了時間は開始時間より後にしてください");
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

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}_clips.zip`;
    a.click();

    URL.revokeObjectURL(url);

    setSuccessMessage(
      `🎉 ${validClips.length}個のクリップ生成完了`
    );
  } catch (err) {
    console.error(err);

    alert(
      err instanceof Error
        ? err.message
        : "不明なエラー"
    );
  } finally {
    setLoading(false);
  }
};
const handleAiSuggest = async () => {
  try {
    setLoading(true);
    setSuccessMessage("");

   const res = await fetch(
  "/api/ai-suggest",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      duration: videoDuration,
    }),
  }
);

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "AI候補生成に失敗しました");
    }

    const data = await res.json();

    setClips(
  data.clips.map(
    (clip: { start: string; end: string; reason: string }) => ({
      start: clip.start,
      end: clip.end,
      reason: clip.reason,
    })
  )
);

    setSuccessMessage("AI候補を生成しました");
  } catch (err) {
    console.error(err);

    alert(
      err instanceof Error
        ? err.message
        : "不明なエラー"
    );
  } finally {
    setLoading(false);
  }
};
const setCurrentTimeAsStart = () => {
  if (!videoRef.current) return;

  setStart(
    String(
      Math.floor(
        videoRef.current.currentTime
      )
    )
  );
};

const setCurrentTimeAsEnd = () => {
  if (!videoRef.current) return;

  setEnd(
    String(
      Math.floor(
        videoRef.current.currentTime
      )
    )
  );
};
  // ⏱ 開始時間でプレビュー移動
  useEffect(() => {
    if (!videoRef.current) return;
    const sec = Number(start);
    if (!isNaN(sec)) {
      videoRef.current.currentTime = sec;
    }
  }, [start]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-blue-900 text-white p-6">
      <div className="max-w-xl mx-auto mt-10 backdrop-blur-md bg-white/10 p-8 rounded-xl shadow-xl border border-white/20 animate-fadeIn">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          EasySlice.AI
        </h1>
<p className="text-zinc-400 text-sm mt-2">
AI Video Clipper for Shorts & TikTok
</p>
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
        <button
          onClick={handleFetchYoutube}
          className="
w-full py-3 mb-4 rounded-xl
font-semibold
bg-gradient-to-r
from-cyan-500
to-blue-500
hover:from-cyan-400
hover:to-blue-400
transition-all
duration-300
shadow-lg
hover:shadow-cyan-500/40
"
        >
          🔽 YouTube から動画を取得する
        </button>

        {/* ファイル選択 */}
        <label className="block mb-2">動画ファイルを選択</label>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setVideo(e.target.files?.[0] || null)}
          className="mb-4"
        />

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

  <h2 className="text-lg font-semibold mb-4">
    複数クリップ
  </h2>
{/* 複数クリップ */}
<div className="mt-6 rounded-xl border border-cyan-500/20 bg-zinc-900/70 p-4">
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
      className="mb-4 rounded-xl border border-white/10 bg-zinc-800 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-cyan-300 font-semibold">
          Clip {index + 1}
        </p>
{clip.reason && (
  <p className="mb-3 text-sm text-purple-300">
    {clip.reason}
  </p>
)}
        {clips.length > 1 && (
          <button
            type="button"
            onClick={() => removeClip(index)}
            className="text-sm text-red-400 hover:text-red-300"
          >
            削除
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        </div>
      </div>
    </div>
  ))}

  <div className="flex gap-2">
    <button
      type="button"
      onClick={addClip}
      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 transition"
    >
      ＋ クリップ追加
    </button>
<button
  type="button"
  onClick={handleAiSuggest}
  disabled={loading}
  className={
    loading
      ? "px-4 py-2 rounded-xl bg-gray-600 cursor-not-allowed"
      : "px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 transition"
  }
>
  AI候補生成
</button>
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
      {loading ? "生成中..." : "一括生成"}
    </button>
  </div>

  {loading && (
    <div className="mt-4 animate-pulse text-cyan-300 font-semibold">
      📦 ZIP生成中...
    </div>
  )}

  {successMessage && (
    <div className="mt-4 text-green-400 font-semibold">
      {successMessage}
    </div>
  )}
</div>

{/* プレビュー */}
{(video || videoSrc) && (
  <video
    ref={videoRef}
    src={videoSrc}
    controls
    className="w-full rounded"
  />
)}

<div className="flex gap-2 mt-3">
  <button
  onClick={setStartFromCurrent}
 className="
px-4 py-2
bg-zinc-700
hover:bg-zinc-600
text-white
rounded-xl
transition
shadow-md
"
>
  現在位置を開始に設定
</button>

<button
  onClick={setEndFromCurrent}
 className="
px-4 py-2
bg-zinc-700
hover:bg-zinc-600
text-white
rounded-xl
transition
shadow-md
ml-2
"
>
  現在位置を終了に設定
</button>
</div>

{/* 切り抜き */}
<form onSubmit={(e) => e.preventDefault()}>
  <button
  type="button"
  onClick={handleCut}
    disabled={loading}
    className={
      loading
        ? "w-full py-3 mt-4 rounded-lg font-semibold bg-gray-500 cursor-not-allowed"
        : "w-full py-3 mt-4 rounded-lg font-semibold bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 transition-all duration-300 shadow-lg hover:shadow-cyan-400/40 hover:scale-[1.02]"
    }
  >
    ✂️ 切り抜きを開始する
  </button>
</form>

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
          {start}秒 → {end}秒 / 長さ {Number(end) - Number(start)} 秒
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
          {Number(end) - Number(start)}s
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