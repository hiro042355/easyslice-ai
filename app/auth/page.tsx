export default function AuthPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_48%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-5 py-8 sm:px-8 lg:px-10">
        <div className="grid w-full gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="flex min-h-[360px] flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-10 lg:min-h-[640px]">
            <div>
              <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                Public Beta
              </div>

              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                NEXCUT
              </h1>

              <p className="mt-6 max-w-md text-3xl font-bold leading-tight text-white sm:text-4xl">
                動画を、
                <br />
                投稿できる形へ。
              </p>
            </div>

            <div className="mt-14 space-y-8">
              <div className="grid gap-3 text-xl font-semibold text-gray-200 sm:grid-cols-3 lg:grid-cols-1">
                <p>Choose.</p>
                <p>Create.</p>
                <p>Publish.</p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-cyan-300/40 via-white/10 to-transparent" />

              <p className="max-w-sm text-sm leading-7 text-gray-300">
                あなたの次の作品を、ここから。
              </p>
            </div>
          </div>

          <div className="flex min-h-[460px] flex-col justify-center rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10 lg:min-h-[640px]">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Auth Entry
                </p>

                <h2 className="mt-4 text-3xl font-black tracking-tight text-white">
                  NEXCUTへ入る
                </h2>

                <p className="mt-4 text-sm leading-7 text-gray-300">
                  作りかけの動画も、
                  <br />
                  新しい作品づくりも、ここから始められます。
                </p>
              </div>

              <div className="space-y-4">
                <a
                  href="/workspace"
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-sm font-black text-zinc-900">
                    G
                  </span>
                  Googleで続ける
                </a>

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <div className="h-px flex-1 bg-white/10" />
                  <span>または</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <a
                  href="/workspace"
                  className="block w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-center text-sm font-bold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
                >
                  メールで続ける
                </a>
              </div>

              <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-6 text-gray-400">
                初めての方も、すでに利用中の方もそのまま続けられます。
              </p>

              <div className="mt-8 flex items-center justify-between gap-3 text-xs text-gray-500">
                <a href="mailto:nexcut.ai@gmail.com" className="transition hover:text-cyan-300">
                  ヘルプ
                </a>

                <p>Public Beta / Build 0.x</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
