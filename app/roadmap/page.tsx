const roadmapSections = [
  {
    title: "In Progress",
    badge: "In Progress",
    accent: "cyan",
    items: [
      "Creator Flow Polish",
      "Production Readiness",
      "Stability Improvements",
    ],
  },
  {
    title: "Planned",
    badge: "Planned",
    accent: "purple",
    items: [
      "Creator Autopilot",
      "Auto Schedule",
      "Translation Sync",
      "Subtitle Timeline",
      "Creator Style Expansion",
      "AI Music Video",
    ],
  },
  {
    title: "Research",
    badge: "Research",
    accent: "zinc",
    items: [
      "Visual Style",
      "Brand Style",
      "AI Voice",
      "Multi Platform Publish",
      "Mobile App",
      "Team Workspace",
    ],
  },
  {
    title: "Completed",
    badge: "Completed",
    accent: "green",
    items: [
      "Creator Flow",
      "Creator Style",
      "Subtitle Editor",
      "Analytics",
      "Feedback Center",
      "PostHog Integration",
    ],
  },
];

function badgeClass(accent: string) {
  if (accent === "cyan") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  }

  if (accent === "purple") {
    return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-200";
  }

  if (accent === "green") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  return "border-white/15 bg-white/[0.06] text-gray-300";
}

function cardClass(accent: string) {
  if (accent === "cyan") {
    return "border-cyan-300/25 bg-cyan-300/[0.07] shadow-cyan-950/25";
  }

  if (accent === "purple") {
    return "border-fuchsia-300/20 bg-fuchsia-300/[0.06] shadow-fuchsia-950/20";
  }

  if (accent === "green") {
    return "border-emerald-300/20 bg-emerald-300/[0.06] shadow-emerald-950/20";
  }

  return "border-white/10 bg-zinc-950/75 shadow-black/25";
}

export default function RoadmapPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_24%,rgba(168,85,247,0.1),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a
              href="/workspace"
              className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
            >
              ← Workspace Home
            </a>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              NEXCUT Roadmap
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Open Beta v1.0 RC
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200">
            Public Roadmap
          </div>
        </header>

        <div className="grid gap-4 py-8 lg:grid-cols-2">
          {roadmapSections.map((section) => (
            <article
              key={section.title}
              className={`rounded-2xl border p-6 shadow-2xl backdrop-blur-xl ${cardClass(
                section.accent
              )}`}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-black tracking-tight text-white">
                  {section.title}
                </h2>

                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${badgeClass(
                    section.accent
                  )}`}
                >
                  {section.badge}
                </span>
              </div>

              <div className="mt-6 grid gap-3">
                {section.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-auto border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
          Roadmap is updated from Open Beta feedback. Items may change as user
          evidence grows.
        </footer>
      </section>
    </main>
  );
}
