import {
  mockReviewQueueItems,
  type ReviewPlatform,
  type ReviewStatus,
} from "../../lib/reviewQueue";

const actionClass =
  "rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-gray-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100";

const platformLabels: Record<ReviewPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

const statusLabels: Record<ReviewStatus, string> = {
  draft: "Draft",
  "ready-for-review": "Ready for Review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
};

export default function ReviewQueuePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_22%,rgba(168,85,247,0.1),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-white/10 pb-8">
          <a
            href="/workspace"
            className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
          >
            ← Workspace Home
          </a>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Creator Autopilot
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Review Queue
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400">
            Autopilotが準備した投稿候補を、公開前に確認するためのMock UIです。
            SNS投稿やAPI接続はまだ行いません。
          </p>
        </header>

        <div className="grid gap-4 py-8">
          {mockReviewQueueItems.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl"
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr_0.8fr] lg:items-stretch">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Video
                  </p>
                  <h2 className="mt-3 text-2xl font-black text-white">
                    {item.videoTitle}
                  </h2>
                  <div className="mt-5 grid gap-2 text-sm font-semibold text-gray-300">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Platform</span>
                      <span>{platformLabels[item.platform]}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Posting Time</span>
                      <span>{item.postingTime}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Creator Style</span>
                      <span>
                        {item.creatorStyle === "standard" ? "Standard" : "Creator"} / {item.animationIntensity}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">AI Hook</span>
                      <span>{item.aiHookEnabled ? "On" : "Off"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Post Assets
                    </p>
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-200">
                      {statusLabels[item.status]}
                    </span>
                  </div>

                  <h3 className="mt-4 text-xl font-black text-white">
                    {item.videoTitle}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    {item.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.hashtags.map((hashtag) => (
                      <span
                        key={hashtag}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold text-gray-300"
                      >
                        {hashtag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Status
                    </p>
                    <p className="mt-3 text-lg font-black text-white">
                      {statusLabels[item.status]}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      Creator confirmation is required before publishing.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <button type="button" className={actionClass}>
                      Approve: Preview only
                    </button>
                    <button type="button" className={actionClass}>
                      Reject: Preview only
                    </button>
                    <button type="button" className={actionClass}>
                      Edit: Coming Soon
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
