"use client";

import type { CreatorStyle, CreatorStyleConfig } from "../lib/creatorStyleConfig";

type CreatorStylePanelProps = {
  creatorStyle: CreatorStyle;
  animationIntensity: number;
  creatorStyleConfig: CreatorStyleConfig;
  onCreatorStyleChange: (style: CreatorStyle) => void;
  onAnimationIntensityChange: (intensity: number) => void;
};

const styleOptions: Array<{
  id: CreatorStyle;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    id: "standard",
    label: "Standard",
    description: "現在のNEXCUT。演出を追加せず、いつもの出力を維持します。",
    badge: "Default",
  },
  {
    id: "creator",
    label: "Creator",
    description: "作品を少し目立たせるための演出設定です。動画処理への接続は次のMVPで行います。",
    badge: "MVP",
  },
];

const intensityOptions = [1, 2, 3, 4, 5];

export default function CreatorStylePanel({
  creatorStyle,
  animationIntensity,
  creatorStyleConfig,
  onCreatorStyleChange,
  onAnimationIntensityChange,
}: CreatorStylePanelProps) {
  const isCreator = creatorStyle === "creator";

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/20 bg-zinc-950/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cyan-300">Creator Style</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">
            作品の見え方を選びます。MVPではExportへ渡せる演出パラメータを生成します。
          </p>
        </div>

        <span className="w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
          {creatorStyle === "standard" ? "Standard" : `Creator / ${animationIntensity}`}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {styleOptions.map((option) => {
          const selected = creatorStyle === option.id;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onCreatorStyleChange(option.id)}
              className={
                selected
                  ? "rounded-xl border border-cyan-400 bg-cyan-500/15 p-4 text-left shadow-lg shadow-cyan-500/10"
                  : "rounded-xl border border-white/10 bg-zinc-900/70 p-4 text-left hover:border-cyan-400/40 hover:bg-zinc-800"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{option.label}</span>
                <span
                  className={
                    selected
                      ? "rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs font-semibold text-cyan-200"
                      : "rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-gray-400"
                  }
                >
                  {option.badge}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-400">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-cyan-200">Animation Intensity</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Creator選択時に使う演出強度です。Standardでは出力に影響しません。
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400">Level {animationIntensity}</span>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          {intensityOptions.map((intensity) => (
            <button
              key={intensity}
              type="button"
              onClick={() => onAnimationIntensityChange(intensity)}
              className={
                animationIntensity === intensity
                  ? "rounded-lg border border-fuchsia-300 bg-fuchsia-500/20 px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm font-semibold text-gray-400 hover:bg-zinc-800"
              }
              aria-pressed={animationIntensity === intensity}
            >
              {intensity}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2">
            <p className="font-semibold text-gray-500">Zoom</p>
            <p className="mt-1 text-cyan-200">{creatorStyleConfig.zoomStrength}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2">
            <p className="font-semibold text-gray-500">Subtitle</p>
            <p className="mt-1 text-cyan-200">{creatorStyleConfig.subtitleAnimation}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2">
            <p className="font-semibold text-gray-500">Tempo</p>
            <p className="mt-1 text-cyan-200">{creatorStyleConfig.cutTempo}</p>
          </div>
        </div>

        {!isCreator && (
          <p className="mt-3 text-xs leading-5 text-gray-500">
            Standardでは現在のNEXCUTと同じ出力を維持します。
          </p>
        )}
      </div>
    </div>
  );
}