import {sandboxUiRequested} from "../../../lib/server/tiktokApplication/uiAvailability";
import {TikTokReviewPanel} from "../../../components/tiktok/TikTokReviewPanel";
import {TikTokSandboxConnectionPanel} from "../../../components/tiktok/TikTokSandboxConnectionPanel";

export default function ConnectionsPage() {
  // Default remains unavailable. Local/test services are explicitly injected by tests.
  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <a href="/workspace" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">← Workspace Home</a>
        <header className="my-8">
          <h1 className="text-3xl font-bold tracking-tight">アカウント連携</h1>
          <p className="mt-3 text-sm leading-7 text-gray-400">連携するプラットフォームと接続状況を確認できます。</p>
        </header>
        <TikTokSandboxConnectionPanel enabled={sandboxUiRequested()}/>
        <TikTokReviewPanel/>
      </div>
    </main>
  );
}
