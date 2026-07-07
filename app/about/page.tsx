const philosophyItems = [
  "AI is the engine.",
  "Workflow is the product.",
  "Automation never removes creativity.",
  "Creators always decide.",
];

const builtWithItems = ["Next.js", "TypeScript", "Gemini", "FFmpeg", "PostHog"];

const roadToV2Items = [
  "Creator Autopilot",
  "AI Music Video",
  "Creator Style Expansion",
  "Visual Style",
  "Mobile Experience",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_24%,rgba(168,85,247,0.1),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-white/10 pb-8">
          <a
            href="/workspace"
            className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
          >
            ← Workspace Home
          </a>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            About NEXCUT
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            NEXCUT is an AI Creator Workspace.
          </h1>

          <p className="mt-6 max-w-2xl text-xl font-bold leading-9 text-gray-100">
            Our mission is simple.
            <br />
            Help creators spend less time editing and more time creating.
          </p>
        </header>

        <div className="grid gap-4 py-8">
          <article className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.07] p-6 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              Why NEXCUT
            </h2>

            <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-gray-200">
              Editing should never slow creativity.
              <br />
              NEXCUT combines AI, Creator Flow, Creator Style, and intelligent
              automation into one workspace.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              Philosophy
            </h2>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {philosophyItems.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-6 shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Built With
              </h2>

              <div className="mt-6 grid gap-3">
                {builtWithItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Road to v2
              </h2>

              <div className="mt-6 grid gap-3">
                {roadToV2Items.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>

        <footer className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-6 text-sm leading-7 text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Made with ❤️ for creators.</span>
          <span className="font-semibold text-cyan-200">Open Beta v1.0 RC</span>
        </footer>
      </section>
    </main>
  );
}
