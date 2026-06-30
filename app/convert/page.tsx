"use client";

import { useState } from "react";

export default function ConvertPage() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fileName, setFileName] = useState("");

  async function handleConvert() {
    setError("");
    setDownloadUrl("");
    setFileName("");

    if (!file) {
      setError("動画ファイルを選択してください。");
      return;
    }

    setConverting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "MP4変換に失敗しました。");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setFileName(createOutputName(file.name));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "MP4変換に失敗しました。";
      setError(message);
    } finally {
      setConverting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-cyan-400/40 px-3 py-1 text-xs font-semibold text-cyan-200">
              動画MP4変換
            </div>
            <h1 className="text-3xl font-bold">動画を投稿用MP4に変換</h1>
            <p className="mt-2 text-sm text-slate-300">
              MOV、WEBM、MKV、AVI、画面録画などを、NEXCUT AIで扱いやすいMP4形式に変換します。
            </p>
          </div>

          <a
            href="/"
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
          >
            トップへ戻る
          </a>
        </div>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              変換する動画ファイル
            </span>
            <input
              type="file"
              accept="video/*,.mov,.webm,.mkv,.avi,.m4v"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError("");
                setDownloadUrl("");
                setFileName("");
              }}
              className="block w-full cursor-pointer rounded-md border border-white/10 bg-slate-900 text-sm text-slate-300 file:mr-4 file:border-0 file:bg-cyan-400 file:px-4 file:py-3 file:text-sm file:font-bold file:text-slate-950"
            />
          </label>

          {file && (
            <div className="mt-4 rounded-md border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">
              <p className="font-semibold text-slate-100">{file.name}</p>
              <p className="mt-1">{formatBytes(file.size)}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleConvert}
            disabled={converting}
            className="mt-5 w-full rounded-md bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {converting ? "変換中..." : "MP4に変換"}
          </button>

          {converting && (
            <div className="mt-5 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-4 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
              <p className="text-sm font-semibold text-cyan-100">
                MP4に変換しています
              </p>
              <p className="mt-1 text-xs text-slate-300">
                動画の長さや容量によって時間がかかります。
              </p>
            </div>
          )}

          {downloadUrl && (
            <div className="mt-5 rounded-md border border-emerald-400/30 bg-emerald-950/30 p-4">
              <p className="text-sm font-semibold text-emerald-100">
                変換が完了しました。
              </p>
              <a
                href={downloadUrl}
                download={fileName || "converted.mp4"}
                className="mt-3 inline-flex rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950"
              >
                MP4をダウンロード
              </a>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
          <h2 className="mb-3 text-base font-semibold text-slate-100">
            このツールでできること
          </h2>
          <ul className="list-inside list-disc space-y-2">
            <li>手元の動画ファイルをMP4に変換</li>
            <li>H.264 + AACで書き出し</li>
            <li>NEXCUT AIにアップロードしやすい形式に整える</li>
            <li>YouTubeやTikTokなどのURLダウンロードには対応しません</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function createOutputName(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base || "converted"}-converted.mp4`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}