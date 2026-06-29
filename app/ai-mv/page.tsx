"use client";

import { useState } from "react";

type AiMvResult = {
  title: string;
  lyrics: string;
  mvConcept: string;
  scenes: {
    time?: string;
    title: string;
    description: string;
  }[];
  jacketDesign: string;
  thumbnailText: string;
  postTitle: string;
  postDescription: string;
  hashtags: string[];
};

export default function AiMvPage() {
  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("J-POP");
  const [mood, setMood] = useState("切ないけど前向き");
  const [length, setLength] = useState("medium");
  const [result, setResult] = useState<AiMvResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hashtagsCopied, setHashtagsCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);

  async function handleGenerate() {
    setError("");
    setResult(null);

    if (story.trim().length < 10) {
      setError("出来事や思い出を10文字以上で入力してください。");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ai-mv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          story,
          genre,
          mood,
          length,
        }),
      });

      if (!res.ok) {
        throw new Error("生成に失敗しました。");
      }

      const data = await res.json();
      setResult(data);
    } catch {
      setError("作品案の生成に失敗しました。少し時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-6">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div className="inline-flex rounded-full border border-cyan-400/40 px-3 py-1 text-xs font-semibold text-cyan-200">
      AI MV生成 β
    </div>

    <a
      href="/"
      className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
    >
      トップへ戻る
    </a>
  </div>

  <h1 className="text-2xl font-bold">あなたの出来事を作品にする</h1>
  <p className="mt-2 text-sm text-slate-300">
    日記、思い出、恋愛、夢、失敗談から、曲タイトル・歌詞・MV構成・投稿素材を生成します。
  </p>
 {[
  {
    label: "仕事帰り",
    text: "今日、会社で怒られた。帰り道で雨が降っていた。でも家に帰ったら家族が笑って迎えてくれた。",
  },
  {
    label: "恋の記憶",
    text: "昔好きだった人のことを、ふと駅のホームで思い出した。もう戻れないけど、少しだけ優しい気持ちになった。",
  },
  {
    label: "夢を追う",
    text: "夢を追って上京したけど、うまくいかない日が続いている。それでもまだ諦めたくない。",
  },
].map((example) => (
  <button
    key={example.label}
    type="button"
    onClick={() => setStory(example.text)}
    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
  >
    {example.label}
  </button>
))}
</div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">出来事・感情</span>
              <textarea
                value={story}
                onChange={(event) => setStory(event.target.value)}
                className="min-h-48 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
                placeholder="例: 今日、会社で怒られた。帰り道で雨が降っていた。でも家に帰ったら家族が笑って迎えてくれた。"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">ジャンル</span>
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
              >
                <option>J-POP</option>
                <option>バラード</option>
                <option>ロック</option>
                <option>HIPHOP</option>
                <option>Lo-fi</option>
                <option>アニソン風</option>
                <option>シティポップ</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">雰囲気</span>
              <select
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
              >
                <option>切ないけど前向き</option>
                <option>明るい</option>
                <option>青春</option>
                <option>映画的</option>
                <option>エモい</option>
                <option>静かで優しい</option>
                <option>力強い</option>
              </select>
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-200">長さ</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["short", "短め"],
                  ["medium", "標準"],
                  ["long", "長め"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLength(value)}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      length === value
                        ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
                        : "border-white/10 bg-slate-900 text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
  <div className="rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
    {error}
  </div>
)}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-md bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "生成中..." : "作品案を生成"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
         {loading ? (
  <div className="flex min-h-[560px] items-center justify-center text-center">
    <div>
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
      <p className="font-semibold text-slate-200">作品案を生成しています</p>
      <p className="mt-2 text-sm text-slate-400">
        出来事から歌詞、MV構成、投稿素材を組み立てています。
      </p>
    </div>
  </div>
) : !result ? (
  <div className="flex min-h-[560px] items-center justify-center text-center text-slate-400">
    <p>生成結果がここに表示されます。</p>
  </div>
) : (
            <div className="space-y-6">
             <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div>
    <p className="text-sm text-cyan-200">曲タイトル</p>
    <h2 className="mt-1 text-3xl font-bold">{result.title}</h2>
  </div>

  <button
    type="button"
    onClick={async () => {
      const text = [
        `曲タイトル: ${result.title}`,
        "",
        "歌詞:",
        result.lyrics,
        "",
        "MVコンセプト:",
        result.mvConcept,
        "",
        "ジャケットデザイン案:",
        result.jacketDesign,
        "",
        "サムネ文言:",
        result.thumbnailText,
        "",
        "投稿タイトル:",
        result.postTitle,
        "",
        "投稿説明文:",
        result.postDescription,
        "",
        "ハッシュタグ:",
        result.hashtags.join(" "),
      ].join("\n");

      await navigator.clipboard.writeText(text);
      setAllCopied(true);
window.setTimeout(() => setAllCopied(false), 1200);
    }}
    className="w-fit rounded-md border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
  >
    {allCopied ? "コピー済み" : "全体をコピー"}
  </button>
</div>

              <ResultBlock title="歌詞" content={result.lyrics} />
              <ResultBlock title="MVコンセプト" content={result.mvConcept} />
              <ResultBlock title="ジャケットデザイン案" content={result.jacketDesign} />
              <ResultBlock title="サムネ文言" content={result.thumbnailText} />
              <ResultBlock title="投稿タイトル" content={result.postTitle} />
              <ResultBlock title="投稿説明文" content={result.postDescription} />

              <div>
                <h3 className="mb-3 text-lg font-semibold">シーン構成</h3>
                <div className="space-y-3">
                  {result.scenes.map((scene, index) => (
                    <div key={`${scene.title}-${index}`} className="rounded-md border border-white/10 bg-slate-900 p-4">
                      <p className="text-xs text-cyan-200">{scene.time || `Scene ${index + 1}`}</p>
                      <h4 className="mt-1 font-semibold">{scene.title}</h4>
                      <p className="mt-2 text-sm text-slate-300">{scene.description}</p>
                    </div>
                  ))}
                </div>
              </div>

            <div>
  <div className="mb-3 flex items-center justify-between gap-3">
    <h3 className="text-lg font-semibold">ハッシュタグ</h3>
<button
  type="button"
  onClick={async () => {
    await navigator.clipboard.writeText(result.hashtags.join(" "));
    setHashtagsCopied(true);
    window.setTimeout(() => setHashtagsCopied(false), 1200);
  }}
  className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
>
  {hashtagsCopied ? "コピー済み" : "コピー"}
</button>
  </div>

  <div className="flex flex-wrap gap-2">
    {result.hashtags.map((tag) => (
      <span key={tag} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">
        {tag}
      </span>
    ))}
  </div>
</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ResultBlock({ title, content }: { title: string; content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
>
  {copied ? "コピー済み" : "コピー"}
</button>
      </div>

      <div className="whitespace-pre-wrap rounded-md border border-white/10 bg-slate-900 p-4 text-sm leading-7 text-slate-200">
        {content}
      </div>
    </div>
  );
}