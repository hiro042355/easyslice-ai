const systemHealth = [
  { label: "API", status: "Operational" },
  { label: "Export", status: "Operational" },
  { label: "Creator Flow", status: "Operational" },
  { label: "Analytics", status: "Operational" },
];

const todayActivity = [
  { label: "Workspace Open", value: "1,254" },
  { label: "Upload", value: "842" },
  { label: "Analyze", value: "796" },
  { label: "Export", value: "621" },
  { label: "Feedback", value: "37" },
];

const errors = [
  { label: "Export Errors", value: "4" },
  { label: "Analyze Errors", value: "7" },
  { label: "API Errors", value: "3" },
  { label: "Today's Error Count", value: "14" },
];

const performance = [
  { label: "Average Analyze Time", value: "42s" },
  { label: "Average Export Time", value: "1m 18s" },
  { label: "Average Creation Time", value: "3m 06s" },
];

const recentEvents = [
  { label: "Workspace Open", time: "09:12" },
  { label: "Analyze", time: "09:15" },
  { label: "Export", time: "09:18" },
  { label: "Feedback", time: "09:24" },
];

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default function OperationsDashboardPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_24%,rgba(168,85,247,0.1),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a
              href="/workspace"
              className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
            >
              ← Workspace Home
            </a>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Operations Dashboard
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Monitor NEXCUT at a glance.
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200">
            Mock Data
          </div>
        </header>

        <div className="grid gap-4 py-8">
          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              System Health
            </h2>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {systemHealth.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-emerald-300/20 bg-black/25 p-4"
                >
                  <p className="text-lg font-black text-white">{item.label}</p>
                  <p className="mt-2 text-sm font-bold text-emerald-200">
                    🟢 {item.status}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Today's Activity
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {todayActivity.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-red-300/20 bg-red-300/[0.05] p-6 shadow-2xl shadow-red-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Errors
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {errors.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
            <section className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-6 shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Performance
              </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {performance.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Creator Autopilot
              </h2>
              <div className="mt-6 rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Current Status
                </p>
                <p className="mt-3 text-3xl font-black text-white">Preview</p>
                <p className="mt-2 text-sm font-bold text-gray-400">
                  Coming Soon
                </p>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <h2 className="text-2xl font-black tracking-tight text-white">
              Recent Events
            </h2>
            <div className="mt-6 grid gap-3">
              {recentEvents.map((event) => (
                <div
                  key={`${event.label}-${event.time}`}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-bold text-white">
                    {event.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {event.time}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-auto border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
          Operations Dashboard currently uses mock data. API and analytics
          connections are not enabled yet.
        </footer>
      </section>
    </main>
  );
}
