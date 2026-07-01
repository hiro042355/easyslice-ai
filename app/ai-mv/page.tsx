"use client";

import { useState } from "react";

type PlatformPosts = {
  tiktok: string;
  shorts: string;
  reels: string;
};

type AiMvScore = {
  emotion: number;
  visualMatch: number;
  snsHook: number;
  originality: number;
  improvement: string;
};

type AiMvResult = {
  title: string;
  hook: string;
  lyrics: string;
  mvConcept: string;
  visualHook: string;
  shortMvPlan: string;
  thirtySecondMvPlan: string;
  scenes: {
    time?: string;
    title: string;
    description: string;
  }[];
  lyricVisualMatches: LyricVisualMatch[];
  jacketDesign: string;
  jacketPrompt: string;
  thumbnailText: string;
postTitle: string;
postDescription: string;
platformPosts: PlatformPosts;
hashtags: string[];
score: AiMvScore;
};

type LyricVisualMatch = {
  lyric: string;
  visual: string;
  intent: string;
};

export default function AiMvPage() {
  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("J-POP");
  const [mood, setMood] = useState("切ないけど前向き");
  const [revisionMode, setRevisionMode] = useState("");
  const [length, setLength] = useState("medium");
  const [theme, setTheme] = useState("日記");
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
  theme,
  genre,
  mood,
  length,
  revisionMode,
}),
      });

if (!res.ok) {
  const data = await res.json().catch(() => null);
  throw new Error(data?.error || "生成に失敗しました。");
}

      const data = await res.json();
      setResult(data);
} catch (err) {
  const message =
    err instanceof Error
      ? err.message
      : "作品案の生成に失敗しました。少し時間をおいて再度お試しください。";

  setError(message);
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
  <div className="mt-4 rounded-md border border-yellow-400/30 bg-yellow-950/30 p-3 text-xs leading-6 text-yellow-100">
  現在はβ版です。動画・楽曲・画像そのものは生成せず、MV作品案、歌詞、投稿素材、ジャケット用プロンプトを生成します。
</div>
{getThemeExamples(theme).map((example) => (
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
<div>
  <span className="mb-2 block text-sm font-medium text-slate-200">テーマ</span>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {["日記", "失恋", "恋愛", "仕事", "夢", "家族", "友情", "再出発"].map((item) => (
      <button
        key={item}
        type="button"
        onClick={() => setTheme(item)}
        className={`rounded-md border px-3 py-2 text-sm ${
          theme === item
            ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
            : "border-white/10 bg-slate-900 text-slate-300"
        }`}
      >
        {item}
      </button>
    ))}
  </div>
</div>
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
  <span className="mb-2 block text-sm font-medium text-slate-200">
    改善方向
  </span>

  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {[
      { label: "標準", value: "" },
      { label: "もっと泣ける", value: "もっと泣ける作品にする" },
      { label: "もっとバズる", value: "SNSでバズりやすい作品にする" },
      { label: "映像を派手に", value: "映像表現をもっと派手で印象的にする" },
      { label: "短く鋭く", value: "歌詞と構成を短く鋭くする" },
    ].map((item) => (
      <button
        key={item.label}
        type="button"
        onClick={() => setRevisionMode(item.value)}
        className={`rounded-md border px-3 py-2 text-sm ${
          revisionMode === item.value
            ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
            : "border-white/10 bg-slate-900 text-slate-300"
        }`}
      >
        {item.label}
      </button>
    ))}
  </div>
</div>
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
  {result.score && (
  <div className="mt-5 rounded-md border border-white/10 bg-slate-900 p-4">
    <h3 className="text-sm font-semibold text-cyan-200">AI評価スコア</h3>

    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["感情", result.score.emotion],
        ["歌詞と映像", result.score.visualMatch],
        ["SNSフック", result.score.snsHook],
        ["独自性", result.score.originality],
      ].map(([label, value]) => (
        <div key={label} className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          <div className="mt-2 h-1.5 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full bg-cyan-400"
              style={{ width: `${Number(value)}%` }}
            />
          </div>
        </div>
      ))}
    </div>

    {result.score.improvement && (
      <div className="mt-4 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-3">
        <p className="text-xs font-semibold text-cyan-200">改善ポイント</p>
        <p className="mt-2 text-sm leading-6 text-slate-100">
          {result.score.improvement}
        </p>
      </div>
    )}
  </div>
)}
  {result.hook && (
  <div className="mt-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-4">
    <p className="text-xs font-semibold text-cyan-200">冒頭3秒フック</p>
    <p className="mt-2 text-lg font-bold text-white">{result.hook}</p>
  </div>
)}

  <button
    type="button"
    onClick={async () => {
    const text = [
  `曲タイトル: ${result.title}`,
  "",
  "AI評価スコア:",
`感情: ${result.score?.emotion ?? 0}`,
`歌詞と映像: ${result.score?.visualMatch ?? 0}`,
`SNSフック: ${result.score?.snsHook ?? 0}`,
`独自性: ${result.score?.originality ?? 0}`,
`改善ポイント: ${result.score?.improvement ?? ""}`,
"",
  "冒頭3秒フック:",
  result.hook,
  "",
  "歌詞:",
        result.lyrics,
        "",
"MVコンセプト:",
result.mvConcept,
"",
"映像フック:",
result.visualHook,
"",
"歌詞と映像の対応表:",
...(result.lyricVisualMatches || []).flatMap((item, index) => [
  `${index + 1}. 歌詞: ${item.lyric}`,
  `映像: ${item.visual}`,
  `意図: ${item.intent}`,
  "",
]),
"15秒版MV構成:",
result.shortMvPlan,
"",
"30秒版MV構成:",
result.thirtySecondMvPlan,
"",
"ジャケットデザイン案:",
result.jacketDesign,
"",
"画像生成用プロンプト:",
result.jacketPrompt,
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
"TikTok向け投稿文:",
result.platformPosts?.tiktok || "",
"",
"YouTube Shorts向け投稿文:",
result.platformPosts?.shorts || "",
"",
"Instagram Reels向け投稿文:",
result.platformPosts?.reels || "",
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
{result.visualHook && (
  <ResultBlock title="映像フック" content={result.visualHook} />
)}
{result.shortMvPlan && (
  <ResultBlock title="15秒版MV構成" content={result.shortMvPlan} />
)}
{result.thirtySecondMvPlan && (
  <ResultBlock title="30秒版MV構成" content={result.thirtySecondMvPlan} />
)}
{result.lyricVisualMatches?.length > 0 && (
  <div>
    <h3 className="mb-3 text-lg font-semibold">歌詞と映像の対応表</h3>

    <div className="space-y-3">
      {result.lyricVisualMatches.map((item, index) => (
        <div
          key={`${item.lyric}-${index}`}
          className="rounded-md border border-white/10 bg-slate-900 p-4"
        >
          <p className="text-xs font-semibold text-cyan-200">歌詞</p>
          <p className="mt-1 text-sm text-slate-100">{item.lyric}</p>

          <p className="mt-3 text-xs font-semibold text-cyan-200">映像</p>
          <p className="mt-1 text-sm text-slate-300">{item.visual}</p>

          <p className="mt-3 text-xs font-semibold text-cyan-200">意図</p>
          <p className="mt-1 text-sm text-slate-300">{item.intent}</p>
        </div>
      ))}
    </div>
  </div>
)}
<ResultBlock title="ジャケットデザイン案" content={result.jacketDesign} />
{result.jacketPrompt && (
  <ResultBlock title="画像生成用プロンプト" content={result.jacketPrompt} />
)}
<ResultBlock title="サムネ文言" content={result.thumbnailText} />
<ResultBlock title="投稿タイトル" content={result.postTitle} />
<ResultBlock title="投稿説明文" content={result.postDescription} />
{result.platformPosts && (
  <>
    <ResultBlock title="TikTok向け投稿文" content={result.platformPosts.tiktok} />
    <ResultBlock title="YouTube Shorts向け投稿文" content={result.platformPosts.shorts} />
    <ResultBlock title="Instagram Reels向け投稿文" content={result.platformPosts.reels} />
  </>
)}
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
function getThemeExamples(theme: string) {
  const examples: Record<string, { label: string; text: string }[]> = {
    日記: [
      {
        label: "仕事帰り",
        text: "今日、会社で怒られた。帰り道で雨が降っていた。でも家に帰ったら家族が笑って迎えてくれた。",
      },
      {
        label: "何気ない一日",
        text: "特別なことはなかったけど、帰り道の空がきれいだった。少しだけ明日も頑張れそうな気がした。",
      },
      {
        label: "小さな幸せ",
        text: "コンビニで好きなお菓子を見つけた。たったそれだけなのに、今日は少し救われた気がした。",
      },
    ],
    失恋: [
      {
        label: "駅の記憶",
        text: "昔好きだった人のことを、ふと駅のホームで思い出した。もう戻れないけど、少しだけ優しい気持ちになった。",
      },
      {
        label: "最後のLINE",
        text: "最後に送ったLINEを何度も見返している。返事はもう来ないと分かっているのに、まだ消せない。",
      },
      {
        label: "忘れたい夜",
        text: "忘れたいのに、夜になると思い出してしまう。好きだった時間まで嘘にしたくなくて苦しい。",
      },
    ],
    恋愛: [
      {
        label: "片想い",
        text: "好きな人と少し話せただけで、一日中その言葉を思い出していた。まだ何も始まっていないのに嬉しかった。",
      },
      {
        label: "初デート",
        text: "初めて二人で歩いた帰り道、何を話したかは覚えていない。でも隣にいたことだけはずっと覚えている。",
      },
      {
        label: "会いたい",
        text: "忙しいふりをしているけど、本当はただ会いたい。通知が鳴るたびに少し期待してしまう。",
      },
    ],
    仕事: [
      {
        label: "悔しい日",
        text: "今日、仕事で失敗してしまった。悔しくて帰り道ずっと黙っていたけど、まだ終わりにしたくない。",
      },
      {
        label: "残業帰り",
        text: "終電近くの電車に乗って、窓に映る自分を見ていた。疲れているけど、ここで負けたくないと思った。",
      },
      {
        label: "認められたい",
        text: "頑張っているつもりなのに、なかなか認められない。それでもいつか結果で返したいと思っている。",
      },
    ],
    夢: [
      {
        label: "上京",
        text: "夢を追って上京したけど、うまくいかない日が続いている。それでもまだ諦めたくない。",
      },
      {
        label: "まだ途中",
        text: "周りはどんどん前に進んでいる気がする。自分だけ遅れているようで怖いけど、まだ途中だと思いたい。",
      },
      {
        label: "小さな一歩",
        text: "今日も少しだけ前に進めた。誰にも気づかれない一歩だけど、自分には大事な一歩だった。",
      },
    ],
    家族: [
      {
        label: "ただいま",
        text: "疲れて帰ったら、家族がいつも通り迎えてくれた。その普通の声に、今日一日が少しだけほどけた。",
      },
      {
        label: "ありがとう",
        text: "照れくさくて言えないけど、本当はずっと感謝している。いつかちゃんと言葉にしたい。",
      },
      {
        label: "思い出",
        text: "昔の写真を見つけた。何でもない日の笑顔が、今になって宝物みたいに見えた。",
      },
    ],
    友情: [
      {
        label: "久しぶり",
        text: "久しぶりに友達と話した。くだらない話ばかりだったけど、あの時間に救われた気がした。",
      },
      {
        label: "味方",
        text: "何も言わずに隣にいてくれる友達がいる。それだけで、もう少し頑張れると思えた。",
      },
      {
        label: "昔の約束",
        text: "昔、一緒に夢を語った友達を思い出した。今は別々の道だけど、あの約束はまだ胸にある。",
      },
    ],
    再出発: [
      {
        label: "やり直し",
        text: "一度失敗したけど、もう一度やってみようと思った。怖さはあるけど、今度は自分を信じたい。",
      },
      {
        label: "朝が来た",
        text: "長い夜が終わって、少しだけ朝の光が見えた。まだ完全じゃないけど、前を向けそうな気がした。",
      },
      {
        label: "ここから",
        text: "過去を消すことはできない。でも、その続きをどう書くかは自分で決められると思った。",
      },
    ],
  };

  return examples[theme] ?? examples.日記;
}