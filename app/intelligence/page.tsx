import {
  getPerformanceInsights,
  mockCreatorInsights,
  type PerformanceInsight,
} from "../../lib/creatorIntelligence";

const insightCards = [
  {
    label: "Best Platform",
    value: mockCreatorInsights.bestPlatform,
    accent: "cyan",
  },
  {
    label: "Best Posting Time",
    value: mockCreatorInsights.bestPostingTime,
    accent: "purple",
  },
  {
    label: "Favorite Style",
    value: mockCreatorInsights.preferredCreatorStyle,
    accent: "green",
  },
  {
    label: "Average Creation Time",
    value: mockCreatorInsights.averageCreationTime,
    accent: "zinc",
  },
  {
    label: "Weekly Uploads",
    value: String(mockCreatorInsights.weeklyUploads),
    accent: "zinc",
  },
  {
    label: "Consistency",
    value: `${mockCreatorInsights.consistencyScore}%`,
    accent: "cyan",
  },
];

const performanceInsights = getPerformanceInsights(mockCreatorInsights);

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

function priorityClass(priority: PerformanceInsight["priority"]) {
  if (priority === "high") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  if (priority === "medium") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }

  return "border-white/10 bg-white/[0.05] text-gray-300";
}

export default function CreatorIntelligencePage() {
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
              Creator Intelligence
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Understand your creator rhythm.
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200">
            Mock Insights
          </div>
        </header>

        <div className="grid gap-4 py-8 lg:grid-cols-3">
          {insightCards.map((card) => (
            <article
              key={card.label}
              className={`rounded-2xl border p-6 shadow-2xl backdrop-blur-xl ${cardClass(
                card.accent
              )}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                {card.label}
              </p>
              <p className="mt-4 text-4xl font-black text-white">
                {card.value}
              </p>
            </article>
          ))}
        </div>

        <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <h2 className="text-2xl font-black tracking-tight text-white">
            Suggestions
          </h2>

          <div className="mt-6 grid gap-3">
            {mockCreatorInsights.suggestions.map((suggestion) => (
              <div
                key={suggestion}
                className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
              >
                {suggestion}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.05] p-6 shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                AI Insights
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Performance Suggestions
              </h2>
            </div>
            <span className="w-fit rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-bold text-gray-300">
              Rule Based / Mock
            </span>
          </div>

          <div className="mt-6 grid gap-3">
            {performanceInsights.map((insight) => (
              <article
                key={insight.title}
                className="rounded-xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-black text-white">
                      {insight.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                      {insight.description}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${priorityClass(
                      insight.priority
                    )}`}
                  >
                    {insight.priority}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-auto border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
          Creator Intelligence currently uses mock data. AI inference and
          analytics connection are not enabled yet.
        </footer>
      </section>
    </main>
  );
}
