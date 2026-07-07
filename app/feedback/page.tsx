"use client";

import { useMemo, useState } from "react";

type FeedbackType = "Bug Report" | "Feature Request" | "General Feedback";

const feedbackTypes: FeedbackType[] = [
  "Bug Report",
  "Feature Request",
  "General Feedback",
];

export default function FeedbackPage() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("General Feedback");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  const mailtoHref = useMemo(() => {
    const subject = `[NEXCUT Feedback] ${feedbackType}: ${title || "No title"}`;
    const message = [
      `Type: ${feedbackType}`,
      `Title: ${title || "No title"}`,
      email ? `Email: ${email}` : "Email: Not provided",
      "",
      body || "No message provided",
    ].join("\n");

    return `mailto:nexcut.ai@gmail.com?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(message)}`;
  }, [body, email, feedbackType, title]);

  const handleSubmit = () => {
    const feedback = {
      type: feedbackType,
      title,
      body,
      email,
      timestamp: new Date().toISOString(),
    };

    console.log("[feedback]", feedback);
    setSentMessage("メールアプリを開きます。送信前に内容を確認してください。");
    window.location.href = mailtoHref;
  };

  const canSubmit = title.trim() !== "" && body.trim() !== "";

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_22%,rgba(168,85,247,0.11),transparent_28%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-6">
          <a href="/workspace" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
            ← Workspace Home
          </a>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Open Beta Feedback
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Feedback Center
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400">
            改善要望、不具合、使ってみた感想を送れます。Open Betaの改善に使わせていただきます。
          </p>
        </header>

        <div className="rounded-3xl border border-cyan-300/15 bg-zinc-950/85 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-6">
          <div>
            <p className="text-sm font-bold text-white">種類</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {feedbackTypes.map((type) => {
                const selected = feedbackType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFeedbackType(type)}
                    className={
                      selected
                        ? "rounded-2xl border border-cyan-300 bg-cyan-300/15 p-4 text-left text-sm font-bold text-white shadow-lg shadow-cyan-950/20"
                        : "rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm font-bold text-gray-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                    }
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="text-sm font-bold text-white">タイトル</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例: 字幕編集で困ったこと"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/60 focus:bg-cyan-300/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-white">内容</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="困ったこと、分かりにくかったこと、良かったことなどを書いてください。"
                rows={7}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/60 focus:bg-cyan-300/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-white">メールアドレス（任意）</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="返信が必要な場合だけ入力してください"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/60 focus:bg-cyan-300/10"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-gray-500">
              現在はメール送信で受け付けています。将来はDiscord / GitHub / Notion / Slack / Google Formsへ接続できます。
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={
                canSubmit
                  ? "rounded-xl bg-cyan-300 px-6 py-3 text-sm font-black text-zinc-950 transition hover:bg-cyan-200"
                  : "rounded-xl border border-white/10 bg-zinc-900 px-6 py-3 text-sm font-bold text-gray-600"
              }
            >
              送信
            </button>
          </div>

          {sentMessage && (
            <p className="mt-4 rounded-2xl border border-green-300/20 bg-green-300/10 p-3 text-sm font-semibold text-green-200">
              {sentMessage}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
