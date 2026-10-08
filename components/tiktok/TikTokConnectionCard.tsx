import { readConnectionView, type ConnectionView } from "../../lib/tiktokConnection/viewCore";

/** Server-rendered, inert foundation. No actions, client storage or API adapter. */
export function TikTokConnectionCard({view}:{view?:ConnectionView}) {
  const presentation=readConnectionView(view);
  return (
    <section aria-labelledby="tiktok-connection-title" className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-xl sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Platform connection</p>
          <h2 id="tiktok-connection-title" className="mt-2 text-2xl font-bold text-white">TikTok</h2>
        </div>
        <p role="status" aria-live="polite" className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100">{presentation.label}</p>
      </div>
      <dl className="mt-6 rounded-xl border border-white/10 bg-black/25 p-4">
        <dt className="text-xs font-semibold text-gray-400">アカウント</dt>
        <dd className="mt-2 break-words text-sm text-gray-100">{presentation.account}</dd>
      </dl>
      <p id="tiktok-connection-guidance" className="mt-5 text-sm leading-7 text-gray-300">{presentation.guidance}</p>
      {presentation.error ? <p role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-200">{presentation.error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled aria-describedby="tiktok-connection-guidance" className="cursor-not-allowed rounded-xl bg-cyan-300/15 px-5 py-3 text-sm font-bold text-cyan-200 opacity-60">{presentation.state==="REAUTH_REQUIRED"?"TikTokを再認証":"TikTokに接続"}</button>
        <button type="button" disabled aria-describedby="tiktok-connection-guidance" className="cursor-not-allowed rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-gray-400">接続を解除</button>
      </div>
      <div className="mt-8 border-t border-white/10 pt-5">
        <p id="tiktok-publication-guidance" className="text-sm leading-7 text-gray-400">TikTokへの投稿はまだ利用できません。接続確認と投稿内容の確認が必要です。</p>
        <button type="button" disabled aria-describedby="tiktok-publication-guidance" className="mt-3 cursor-not-allowed rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-gray-500">TikTokへ投稿</button>
      </div>
    </section>
  );
}
