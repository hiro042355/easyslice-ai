const workspaceMetrics = [
  { label: "Workspace Open", value: "1,254", change: "+18%" },
  { label: "Upload Started", value: "842", change: "+12%" },
  { label: "Analyze Started", value: "701", change: "+9%" },
  { label: "Analyze Completed", value: "668", change: "+8%" },
];

const exportMetrics = [
  { label: "MP4 Export", value: "412" },
  { label: "ZIP Export", value: "129" },
  { label: "Burn Subtitle Export", value: "286" },
];

const intensityDistribution = [
  { level: 1, value: 8 },
  { level: 2, value: 14 },
  { level: 3, value: 38 },
  { level: 4, value: 19 },
  { level: 5, value: 21 },
];

const funnelSteps = [
  { label: "Upload", value: "842", width: "100%" },
  { label: "Analyze", value: "701", width: "83%" },
  { label: "Creator Style", value: "516", width: "61%" },
  { label: "Export", value: "412", width: "49%" },
];

function MetricCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight text-white">{value}</p>
        {change && (
          <span className="rounded-full border border-green-300/20 bg-green-300/10 px-2 py-1 text-xs font-bold text-green-200">
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const environment =
    process.env.NODE_ENV === "production" ? "Production" : "Development";

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_84%_20%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(135deg,#050505_0%,#101827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a
              href="/workspace"
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
            >
              ← Workspace Home
            </a>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              NEXCUT Analytics
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Operations Dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400">
              Open Betaの利用状況を毎日確認するための運営ダッシュボードです。現在はMock Dataで表示しています。
            </p>
          </div>

          <div className="w-fit rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100">
            Mock Data
          </div>
        </header>

        <div className="mt-8 grid gap-5">
          <section className="rounded-3xl border border-cyan-300/15 bg-zinc-950/80 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">Workspace</h2>
              <span className="text-xs font-semibold text-gray-500">
                Creator Flow
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workspaceMetrics.map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-fuchsia-300/15 bg-zinc-950/80 p-5 shadow-2xl shadow-fuchsia-950/10 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Creator Style</h2>
                <span className="text-xs font-semibold text-fuchsia-200">
                  Style Mix
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Creator Style Selected" value="516" change="+21%" />
                <MetricCard label="Standard %" value="32%" />
                <MetricCard label="Creator %" value="68%" />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Intensity 1-5 Distribution
                </p>
                <div className="mt-4 grid grid-cols-5 gap-3">
                  {intensityDistribution.map((item) => (
                    <div key={item.level} className="flex flex-col items-center gap-2">
                      <div className="flex h-28 w-full items-end rounded-xl border border-white/10 bg-black/30 p-2">
                        <div
                          className="w-full rounded-lg bg-gradient-to-t from-fuchsia-500 to-cyan-300"
                          style={{ height: `${item.value * 2}%` }}
                        />
                      </div>
                      <p className="text-xs font-bold text-white">Lv {item.level}</p>
                      <p className="text-xs text-gray-500">{item.value}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-green-300/15 bg-zinc-950/80 p-5 shadow-2xl shadow-green-950/10 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Export</h2>
                <span className="text-xs font-semibold text-green-200">Output</span>
              </div>
              <div className="grid gap-3">
                {exportMetrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <section className="rounded-3xl border border-cyan-300/15 bg-zinc-950/80 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Funnel</h2>
                <span className="text-xs font-semibold text-cyan-200">
                  Upload → Export
                </span>
              </div>

              <div className="space-y-4">
                {funnelSteps.map((step, index) => (
                  <div key={step.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-bold text-white">
                        {index + 1}. {step.label}
                      </span>
                      <span className="font-semibold text-gray-400">{step.value}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400"
                        style={{ width: step.width }}
                      />
                    </div>
                    {index < funnelSteps.length - 1 && (
                      <div className="mx-4 mt-3 h-5 border-l border-dashed border-white/15" />
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">System</h2>
                <span className="text-xs font-semibold text-gray-500">Runtime</span>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Build Version
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">Open Beta v1.0 RC</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Environment
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{environment}</p>
                </div>

                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Data Source
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-300">
                    PostHog API connection is not enabled yet. This dashboard currently uses mock data.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
