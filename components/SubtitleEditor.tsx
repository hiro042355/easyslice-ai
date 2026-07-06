"use client";

import { useEffect, useMemo, useState } from "react";

type EditableSubtitle = {
  id: string;
  start: number;
  end: number;
  text: string;
  edited?: boolean;
};

type SubtitleEditorProps = {
  transcriptText: string;
  videoDuration?: number;
  hasTranslatedText?: boolean;
  onSaveTranscript: (text: string) => void;
  onSaved?: () => void;
  onRequestTranslationSync?: () => void;
};

const formatSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const createSubtitleId = () => `subtitle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createSubtitleRows = (text: string): EditableSubtitle[] => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => ({
    id: `subtitle-${index}`,
    start: index * 2,
    end: index * 2 + 2,
    text: line,
  }));
};

const subtitlesToTranscript = (subtitles: EditableSubtitle[]) =>
  subtitles.map((subtitle) => subtitle.text).join("\n");

export default function SubtitleEditor({
  transcriptText,
  videoDuration,
  hasTranslatedText = false,
  onSaveTranscript,
  onSaved,
  onRequestTranslationSync,
}: SubtitleEditorProps) {
  const initialRows = useMemo(() => createSubtitleRows(transcriptText), [transcriptText]);
  const [subtitles, setSubtitles] = useState<EditableSubtitle[]>(initialRows);
  const [selectedId, setSelectedId] = useState<string>(initialRows[0]?.id ?? "");
  const selectedSubtitle = subtitles.find((subtitle) => subtitle.id === selectedId) ?? subtitles[0];
  const [draftText, setDraftText] = useState(selectedSubtitle?.text ?? "");
  const [draftStart, setDraftStart] = useState(String(selectedSubtitle?.start ?? 0));
  const [draftEnd, setDraftEnd] = useState(String(selectedSubtitle?.end ?? 2));
  const [message, setMessage] = useState("");
  const [syncedTranscriptText, setSyncedTranscriptText] = useState(transcriptText);
  const [translationSyncNeeded, setTranslationSyncNeeded] = useState(false);

  useEffect(() => {
    if (transcriptText === syncedTranscriptText) return;

    const nextRows = createSubtitleRows(transcriptText);

    setSubtitles(nextRows);
    setSelectedId(nextRows[0]?.id ?? "");
    setSyncedTranscriptText(transcriptText);
    setTranslationSyncNeeded(false);
  }, [transcriptText, syncedTranscriptText]);

  useEffect(() => {
    if (!selectedSubtitle) {
      setDraftText("");
      setDraftStart("0");
      setDraftEnd("2");
      return;
    }

    setDraftText(selectedSubtitle.text);
    setDraftStart(String(selectedSubtitle.start));
    setDraftEnd(String(selectedSubtitle.end));
  }, [selectedSubtitle?.id, selectedSubtitle?.start, selectedSubtitle?.end, selectedSubtitle?.text]);

  const syncTranscript = (nextSubtitles: EditableSubtitle[]) => {
    const nextTranscriptText = subtitlesToTranscript(nextSubtitles);

    setSubtitles(nextSubtitles);
    setSyncedTranscriptText(nextTranscriptText);
    onSaveTranscript(nextTranscriptText);

    if (hasTranslatedText) {
      setTranslationSyncNeeded(true);
    }
  };

  const handleAddSubtitle = () => {
    const baseStart = selectedSubtitle?.end ?? subtitles[subtitles.length - 1]?.end ?? 0;
    const nextEnd = videoDuration && videoDuration > 0 ? Math.min(baseStart + 2, videoDuration) : baseStart + 2;
    const newSubtitle: EditableSubtitle = {
      id: createSubtitleId(),
      start: baseStart,
      end: nextEnd > baseStart ? nextEnd : baseStart + 2,
      text: "新しい字幕",
      edited: true,
    };
    const selectedIndex = subtitles.findIndex((subtitle) => subtitle.id === selectedSubtitle?.id);
    const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : subtitles.length;
    const nextSubtitles = [
      ...subtitles.slice(0, insertIndex),
      newSubtitle,
      ...subtitles.slice(insertIndex),
    ];

    setSubtitles(nextSubtitles);
    setSelectedId(newSubtitle.id);
    setDraftText(newSubtitle.text);
    setDraftStart(String(newSubtitle.start));
    setDraftEnd(String(newSubtitle.end));
    setMessage("字幕を追加しました。内容を編集して保存してください。");
  };

  const handleDeleteSubtitle = (subtitleId: string) => {
    const targetSubtitle = subtitles.find((subtitle) => subtitle.id === subtitleId);
    if (!targetSubtitle) return;

    if (!window.confirm("この字幕を削除しますか？")) return;

    const nextSubtitles = subtitles.filter((subtitle) => subtitle.id !== subtitleId);
    const nextSelectedSubtitle =
      nextSubtitles.find((subtitle) => subtitle.start >= targetSubtitle.start) ?? nextSubtitles[nextSubtitles.length - 1];

    setSelectedId(nextSelectedSubtitle?.id ?? "");
    syncTranscript(nextSubtitles);
    setMessage("字幕を削除しました。Preview Studioに反映されます。");
    onSaved?.();
  };

  const handleSave = () => {
    if (!selectedSubtitle) return;

    const start = Number(draftStart);
    const end = Number(draftEnd);

    if (!draftText.trim()) {
      setMessage("字幕テキストを入力してください");
      return;
    }

    if (!Number.isFinite(start) || start < 0) {
      setMessage("開始時間は0秒以上で入力してください");
      return;
    }

    if (!Number.isFinite(end) || end <= start) {
      setMessage("終了時間は開始時間より後にしてください");
      return;
    }

    if (videoDuration && videoDuration > 0 && end > videoDuration) {
      setMessage("終了時間が動画の長さを超えています");
      return;
    }

    const nextSubtitles = subtitles.map((subtitle) =>
      subtitle.id === selectedSubtitle.id
        ? {
            ...subtitle,
            start,
            end,
            text: draftText.trim(),
            edited: true,
          }
        : subtitle
    );

    syncTranscript(nextSubtitles);
    setMessage("字幕を保存しました。Preview Studioに反映されます。");
    onSaved?.();
  };

  const handleTranslationSyncRequest = () => {
    setMessage("翻訳字幕の更新は次のMVPで再生成に接続します。今は同期が必要な状態として記録しました。");
    onRequestTranslationSync?.();
  };

  if (subtitles.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-sky-500/20 bg-zinc-950/70 p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-300">Subtitle Editor</p>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              字幕を追加して、Preview Studioに反映できます。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddSubtitle}
          className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
        >
          ＋字幕追加
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-sky-500/20 bg-zinc-950/70 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-300">Subtitle Editor</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">
            AI字幕を確認し、必要な箇所だけ修正できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-fit rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
            {subtitles.length} lines
          </span>
          <button
            type="button"
            onClick={handleAddSubtitle}
            className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
          >
            ＋字幕追加
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/70 p-3">
          <p className="mb-3 text-xs font-semibold text-gray-400">Subtitle List</p>

          <div className="space-y-2">
            {subtitles.map((subtitle) => {
              const isSelected = subtitle.id === selectedSubtitle?.id;

              return (
                <div
                  key={subtitle.id}
                  className={
                    isSelected
                      ? "rounded-lg border border-sky-400 bg-sky-500/15 p-3"
                      : "rounded-lg border border-white/10 bg-zinc-950/70 p-3 hover:bg-zinc-800"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(subtitle.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-200">
                        <span>
                          {formatSeconds(subtitle.start)} - {formatSeconds(subtitle.end)}
                        </span>
                        {subtitle.edited && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                            Edited
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">
                        {subtitle.text}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSubtitle(subtitle.id)}
                      className="shrink-0 rounded-md border border-red-400/20 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
          <p className="text-xs font-semibold text-gray-400">Selected Subtitle</p>

          <label className="mt-3 block text-xs font-semibold text-sky-200">
            テキスト
          </label>
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={5}
            className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-zinc-950 p-3 text-sm leading-6 text-white outline-none focus:border-sky-400"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-sky-200">
              開始時間（秒）
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-sm text-white outline-none focus:border-sky-400"
              />
            </label>

            <label className="block text-xs font-semibold text-sky-200">
              終了時間（秒）
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftEnd}
                onChange={(event) => setDraftEnd(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-sm text-white outline-none focus:border-sky-400"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="mt-4 w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            保存してPreviewに反映
          </button>

          {hasTranslatedText && translationSyncNeeded && (
            <button
              type="button"
              onClick={handleTranslationSyncRequest}
              className="mt-3 w-full rounded-lg border border-teal-400/30 bg-teal-500/10 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/20"
            >
              翻訳字幕も更新
            </button>
          )}

          {hasTranslatedText && !translationSyncNeeded && (
            <p className="mt-3 rounded-lg border border-teal-400/20 bg-teal-500/5 px-3 py-2 text-xs leading-5 text-teal-200">
              翻訳字幕があります。日本語字幕を保存すると、翻訳字幕の更新導線が表示されます。
            </p>
          )}

          {message && (
            <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs leading-5 text-gray-300">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}