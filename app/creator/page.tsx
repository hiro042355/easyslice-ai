const todayStats = [
  { label: "Videos Created", value: "4" },
  { label: "Videos Exported", value: "3" },
  { label: "Average Creation Time", value: "3m 12s" },
];

const weekStats = [
  { label: "Videos Created", value: "18" },
  { label: "Creator Style Usage", value: "62%" },
  { label: "Animation Intensity Distribution", value: "3.8 avg" },
];

const creatorStats = [
  { label: "Total Projects", value: "42" },
  { label: "Total Exports", value: "31" },
  { label: "Current Streak", value: "5 days" },
  { label: "Longest Streak", value: "12 days" },
];

const quickStats = [
  { label: "Standard", value: "38%" },
  { label: "Creator", value: "62%" },
];

const recentActivity = [
  { label: "Export MP4", time: "Today 14:20" },
  { label: "Analyze", time: "Today 14:16" },
  { label: "Upload", time: "Today 14:12" },
];

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default function CreatorDashboardPage() {
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
              Creator Dashboard
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Your Creator Insights
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200">
            Mock Data
          </div>
        </header>

        <div className="grid gap-4 py-8">
          <article className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.07] p-6 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              Today
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {todayStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-6 shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              This Week
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {weekStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <article className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Creator Stats
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {creatorStats.map((stat) => (
                  <StatCard key={stat.label} {...stat} />
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Quick Stats
              </h2>
              <p className="mt-2 text-sm font-semibold text-emerald-100">
                Creator Style
              </p>
              <div className="mt-6 grid gap-4">
                {quickStats.map((stat) => (
                  <StatCard key={stat.label} {...stat} />
                ))}
              </div>
            </article>
          </div>

          <article className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              Recent Activity
            </h2>
            <div className="mt-6 grid gap-3">
              {recentActivity.map((activity) => (
                <div
                  key={`${activity.label}-${activity.time}`}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-bold text-white">
                    {activity.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <footer className="mt-auto border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
          Creator Dashboard currently uses mock data. Live creator insights will
          connect to usage data in a future release.
        </footer>
      </section>
    </main>
  );
}
