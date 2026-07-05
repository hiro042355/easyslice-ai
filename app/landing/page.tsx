export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="min-h-[88vh] border-b border-white/10 bg-zinc-950">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold text-cyan-300">
              NEXCUT AI
            </p>

            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight text-white sm:text-6xl">
  動画を入れるだけで、ショート動画の投稿準備までAIがサポート
</h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-gray-300 sm:text-lg">
  NEXCUT AIは、動画から切り抜き候補を作成し、投稿タイトル、説明文、ハッシュタグ、サムネ案、AI台本、Shorts向け動画出力までまとめて支援します。
</p>

           <div className="mt-8 flex flex-wrap gap-3">
  <a
    href="/auth"
    className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400"
  >
    無料で始める
  </a>
  <a
    href="/guide#video"
    className="inline-flex items-center justify-center rounded-lg border border-cyan-400/30 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
  >
    2分デモを見る
  </a>
</div>

<div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-400">
  <span>動画アップロード対応</span>
  <span>字幕AIハイライト</span>
  <span>音声ハイライト</span>
  <span>ZIP一括生成</span>
  <span>元動画に近い画質で出力</span>
</div>
          </div>

          <div className="rounded-xl border border-cyan-400/20 bg-zinc-900 p-4 shadow-2xl shadow-cyan-500/10">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-sm font-semibold text-cyan-300">
                  Clip候補
                </p>
                <p className="text-xs text-zinc-500">
                  字幕AI + 音声ハイライト
                </p>
              </div>

              <span className="rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-xs font-semibold text-green-300">
                Ready
              </span>
            </div>

            <div className="space-y-3">
              {[
                ["まさかの展開", "字幕AIハイライト", "score 8"],
                ["一番熱い瞬間", "音声ハイライト", "score 7"],
                ["結論の入り口", "字幕を要約する", "score 6"],
              ].map(([title, type, score], index) => (
                <div
                  key={title}
                  className="rounded-lg border border-white/10 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-cyan-300">
                        Clip {index + 1}
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {title}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {type}
                      </p>
                    </div>

                    <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-300">
                      {score}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded bg-zinc-800 px-3 py-2 text-zinc-300">
                      Start 00:{String(index * 12 + 8).padStart(2, "0")}
                    </div>
                    <div className="rounded bg-zinc-800 px-3 py-2 text-zinc-300">
                      End 00:{String(index * 12 + 38).padStart(2, "0")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-cyan-500 px-4 py-3 text-center text-sm font-semibold text-zinc-950">
              ZIP一括生成
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold text-white">
            動画切り抜きに必要な流れをひとつに
          </h2>

<div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
  {[
    [
      "字幕AIハイライト",
      "txt / srt / vtt の字幕ファイルから、内容を理解して切り抜き候補を作成。",
    ],
    [
      "音声ハイライト",
      "字幕がない動画や音楽動画でも、音声の盛り上がりから候補を作成。",
    ],
    [
      "投稿素材生成",
      "投稿タイトル、説明文、ハッシュタグ、サムネ文言までAIがまとめて生成。",
    ],
     [
    "AI台本生成",
    "15秒・30秒・60秒・90秒のショート動画台本を生成。",
  ],
    [
      "ZIP一括生成",
      "複数ClipをまとめてMP4化し、ZIPで一括ダウンロード。",
    ],
  ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-zinc-900 p-5"
              >
                <h3 className="font-semibold text-cyan-300">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl rounded-xl border border-white/10 bg-zinc-900 p-8">
          <h2 className="text-2xl font-bold">
            公開版はアップロード動画を中心に
          </h2>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
            YouTube URL取得はローカル環境向けの実験機能です。
            公開版では、動画アップロード、字幕ファイル、音声ハイライト、字幕AIハイライトを中心に提供します。
          </p>

   <div className="mt-6 flex flex-wrap gap-3">
  <a
    href="/auth"
    className="inline-block rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400"
  >
    無料で始める
  </a>

  <a
    href="/guide"
    className="inline-block rounded-lg border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
  >
    詳しい使い方
  </a>
</div>
        </div>
      </section>
    </main>
  );
}
