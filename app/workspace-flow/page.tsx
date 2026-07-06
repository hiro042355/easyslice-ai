"use client";

import { useMemo, useState } from "react";

const steps = [
  {
    id: 1,
    label: "Upload",
    eyebrow: "STEP 1 / 5",
    title: "素材を追加する",
    description: "動画、YouTube URL、字幕ファイルをここに集めます。まずは作る素材を決めるだけです。",
    items: [
      "YouTube URL",
      "動画アップロード",
      "字幕アップロード",
    ],
    note: "主軸は動画アップロードです。YouTube URLはβ導線として扱います。",
  },
  {
    id: 2,
    label: "Analyze",
    eyebrow: "STEP 2 / 5",
    title: "AIで見どころを探す",
    description: "字幕AIまたは音声ハイライトで、ショート動画に使いやすいClip候補を整理します。",
    items: [
      "AI解析",
      "Clip候補",
      "候補理由の確認",
    ],
    note: "このプロトタイプでは解析処理には接続していません。",
  },
  {
    id: 3,
    label: "Creator Style",
    eyebrow: "STEP 3 / 5",
    title: "見え方を選ぶ",
    description: "StandardかCreatorを選び、必要ならAnimation Intensityで字幕の強さを調整します。",
    items: [
      "Standard",
      "Creator",
      "Animation Intensity 1-5",
    ],
    note: "Standardは読みやすく安全。Creatorは字幕に動きと強調を追加します。",
  },
  {
    id: 4,
    label: "Assets",
    eyebrow: "STEP 4 / 5",
    title: "投稿素材を整える",
    description: "字幕、翻訳、タイトル、説明文、ハッシュタグを確認し、投稿できる形へ近づけます。",
    items: [
      "字幕",
      "翻訳",
      "タイトル",
      "説明文",
      "ハッシュタグ",
    ],
    note: "ここでは成果物を増やすより、Previewで確認しやすい状態を目指します。",
  },
  {
    id: 5,
    label: "Export",
    eyebrow: "STEP 5 / 5",
    title: "確認して保存する",
    description: "Previewで最終確認し、MP4やZIPとして保存します。投稿前の最後の確認場所です。",
    items: [
      "Preview",
      "Export",
      "保存",
    ],
    note: "このプロトタイプでは実際のExport処理には接続していません。",
  },
];

export default function WorkspaceFlowPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const activeStep = useMemo(
    () => steps.find((step) => step.id === currentStep) ?? steps[0],
    [currentStep]
  );

  const goBack = () => setCurrentStep((step) => Math.max(1, step - 1));
  const goNext = () => setCurrentStep((step) => Math.min(steps.length, step + 1));

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_82%_28%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_50%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <a href="/workspace" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
              ← Workspace Home
            </a>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Creator Flow Prototype
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            One Screen. One Goal.
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8">
          <div className="mx-auto mb-5 flex w-full max-w-4xl items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              STEP {activeStep.id} / {steps.length}
            </p>
            <p className="text-sm font-semibold text-gray-400">
              {activeStep.label}
            </p>
          </div>

          <article
            key={activeStep.id}
            className="mx-auto w-full max-w-4xl rounded-3xl border border-cyan-300/20 bg-zinc-950/80 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl transition-all duration-300 sm:p-8 lg:min-h-[460px]"
          >
            <div className="flex h-full flex-col justify-between gap-8">
              <div>
                <div className="mb-5 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  {activeStep.eyebrow}
                </div>

                <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                  {activeStep.title}
                </h2>

                <p className="mt-5 max-w-2xl text-sm leading-7 text-gray-300 sm:text-base">
                  {activeStep.description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeStep.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  >
                    <p className="text-sm font-semibold text-white">{item}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Prototype Note
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-300">
                  {activeStep.note}
                </p>
              </div>
            </div>
          </article>

          <div className="mx-auto mt-6 flex w-full max-w-4xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 1}
              className={
                currentStep === 1
                  ? "rounded-xl border border-white/10 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-600"
                  : "rounded-xl border border-white/15 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-200 hover:bg-zinc-800"
              }
            >
              戻る
            </button>

            <div className="flex gap-2">
              {steps.map((step) => (
                <span
                  key={step.id}
                  className={
                    step.id === currentStep
                      ? "h-2 w-8 rounded-full bg-cyan-300"
                      : "h-2 w-2 rounded-full bg-white/20"
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={currentStep === steps.length}
              className={
                currentStep === steps.length
                  ? "rounded-xl border border-white/10 bg-zinc-900 px-5 py-3 text-sm font-semibold text-gray-600"
                  : "rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-cyan-200"
              }
            >
              次へ
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}