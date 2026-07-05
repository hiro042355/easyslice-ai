export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative min-h-[88vh] overflow-hidden border-b border-white/10 bg-black">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_82%_28%,rgba(168,85,247,0.1),transparent_28%),linear-gradient(135deg,#050505_0%,#111827_50%,#06111f_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-cyan-300">
                NEXCUT AI
              </p>

              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                Open Beta 0.1.0
              </span>
            </div>

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

            <p className="mt-5 max-w-2xl text-xs leading-6 text-zinc-500">
              現在は公開テスト版です。皆さまからのフィードバックをもとに改善を続けています。
            </p>

            <div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-400">
              <span>動画アップロード対応</span>
              <span>字幕AIハイライト</span>
              <span>音声ハイライト</span>
              <span>ZIP一括生成</span>
              <span>元動画に近い画質で出力</span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/20 bg-zinc-950/75 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-7">
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-cyan-300">
                  Preview
                </p>
                <p className="text-xs text-zinc-500">
                  AIが投稿準備を整理
                </p>
              </div>

              <span className="rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-xs font-semibold text-green-300">
                Ready
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Best Clip
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
                一番熱い瞬間
              </h2>

              <p className="mt-3 text-sm leading-7 text-zinc-400">
                音声の盛り上がりと字幕内容から、ショート動画向けの候補を整理します。
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold text-cyan-300">
                  Assets
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  タイトル・説明文・ハッシュタグ
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold text-cyan-300">
                  Export
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  MP4 / ZIP / 字幕付き動画
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-cyan-500 px-4 py-3 text-center text-sm font-semibold text-zinc-950">
              投稿準備までまとめてサポート
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