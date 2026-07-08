const workspaceOptions = [
  {
    title: "Short Video",
    description: "長尺動画から\nショート動画を作成します。",
    button: "制作を始める",
    href: "/workspace-flow",
    primary: true,
  },
  {
    title: "AI Music Video β",
    description: "AIでMV作品の企画・構成を作成します。",
    button: "試してみる",
    href: "/ai-mv",
    primary: false,
  },
  {
    title: "Video Convert",
    description: "動画をMP4へ変換します。",
    button: "開く",
    href: "/convert",
    primary: false,
  },
];

export default function WorkspaceHomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_78%_24%,rgba(168,85,247,0.1),transparent_28%),linear-gradient(135deg,#050505_0%,#111827_50%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto mb-8 w-full max-w-3xl text-center sm:mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            NEXCUT
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Workspace Home
          </h1>

          <p className="mt-5 text-2xl font-bold leading-tight text-gray-100 sm:text-3xl">
            今日は何を作りますか？
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr] lg:items-stretch">
          <article className="group rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl transition hover:border-cyan-300/50 hover:bg-cyan-300/[0.11] sm:p-8 lg:min-h-[360px]">
            <div className="flex h-full flex-col justify-between gap-10">
              <div>
                <div className="mb-5 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  Main Workflow
                </div>

                <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  {workspaceOptions[0].title}
                </h2>

                <p className="mt-5 whitespace-pre-line text-lg font-semibold leading-8 text-gray-200 sm:text-xl">
                  {workspaceOptions[0].description}
                </p>
              </div>

              <a
                href={workspaceOptions[0].href}
                className="w-full rounded-xl bg-cyan-300 px-5 py-3 text-center text-sm font-black text-zinc-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-black sm:w-auto sm:self-start sm:px-8"
              >
                {workspaceOptions[0].button}
              </a>
            </div>
          </article>

          <div className="grid gap-4">
            {workspaceOptions.slice(1).map((option) => (
              <article
                key={option.title}
                className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl transition hover:border-cyan-300/25 hover:bg-white/[0.04]"
              >
                <div className="flex h-full flex-col justify-between gap-8">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-white">
                      {option.title}
                    </h2>

                    <p className="mt-4 text-sm leading-7 text-gray-300">
                      {option.description}
                    </p>
                  </div>

                  <a
                    href={option.href}
                    className="w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-center text-sm font-bold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-black"
                  >
                    {option.button}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-center">
          <a
            href="/feedback"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Feedback
          </a>

          <a
            href="/analytics"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Analytics
          </a>

          <a
            href="/creator"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Creator
          </a>

          <a
            href="/autopilot"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Autopilot
          </a>

          <a
            href="/roadmap"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Roadmap
          </a>

          <a
            href="/releases"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Release Notes
          </a>

          <a
            href="/status"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            Status
          </a>

          <a
            href="/about"
            className="text-xs font-semibold text-gray-600 transition hover:text-cyan-300"
          >
            About
          </a>
        </div>
      </section>
    </main>
  );
}
