"use client";

import { useState } from "react";
import {
  getRecommendedPostingTime,
  type PostingPlatform,
} from "../../lib/postingTimeEngine";

type UploadSource = "local-video" | "youtube" | "folder-watch";
type ScheduleMode = "manual" | "daily" | "weekly" | "custom";
type PostingTime = "09:00" | "12:00" | "18:00" | "21:00";
type Platform = "youtube" | "tiktok" | "instagram" | "x";
type CreatorStyle = "standard" | "creator";
type AiTask =
  | "analyze"
  | "subtitle"
  | "creator-style"
  | "title"
  | "description"
  | "hashtags"
  | "thumbnail"
  | "ai-music-video";

type AutopilotConfig = {
  enabled: boolean;
  uploadSource: UploadSource;
  schedule: ScheduleMode;
  useRecommendedTime: boolean;
  postingTime: PostingTime;
  platforms: Platform[];
  creatorStyle: CreatorStyle;
  animationIntensity: number;
  aiTasks: AiTask[];
};

const uploadSources: Array<{
  value: UploadSource;
  label: string;
  disabled?: boolean;
}> = [
  { value: "local-video", label: "Local Video" },
  { value: "youtube", label: "YouTube" },
  { value: "folder-watch", label: "Folder Watch", disabled: true },
];

const scheduleModes: Array<{
  value: ScheduleMode;
  label: string;
  disabled?: boolean;
}> = [
  { value: "manual", label: "Manual" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom", disabled: true },
];

const postingTimes: PostingTime[] = ["09:00", "12:00", "18:00", "21:00"];

const platforms: Array<{
  value: Platform;
  label: string;
  disabled?: boolean;
}> = [
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X", disabled: true },
];

const aiTasks: Array<{
  value: AiTask;
  label: string;
  disabled?: boolean;
}> = [
  { value: "analyze", label: "Analyze" },
  { value: "subtitle", label: "Subtitle" },
  { value: "creator-style", label: "Creator Style" },
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
  { value: "hashtags", label: "Hashtags" },
  { value: "thumbnail", label: "Thumbnail", disabled: true },
  { value: "ai-music-video", label: "AI Music Video", disabled: true },
];

const previewWorkflow = [
  "Upload",
  "Analyze",
  "Subtitle",
  "Creator Style",
  "Assets",
  "Export",
  "Review",
  "Confirm",
  "Schedule",
  "Post",
];

const defaultAutopilotConfig: AutopilotConfig = {
  enabled: false,
  uploadSource: "local-video",
  schedule: "manual",
  useRecommendedTime: false,
  postingTime: "18:00",
  platforms: ["youtube"],
  creatorStyle: "standard",
  animationIntensity: 3,
  aiTasks: [
    "analyze",
    "subtitle",
    "creator-style",
    "title",
    "description",
    "hashtags",
  ],
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
      <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function CreatorAutopilotPage() {
  const [autopilotConfig, setAutopilotConfig] = useState<AutopilotConfig>(
    defaultAutopilotConfig
  );
  const [savedMessage, setSavedMessage] = useState("");

  const setConfig = <K extends keyof AutopilotConfig>(
    key: K,
    value: AutopilotConfig[K]
  ) => {
    setAutopilotConfig((current) => ({
      ...current,
      [key]: value,
    }));
    setSavedMessage("");
  };

  const toggleArrayValue = <T extends string>(values: T[], value: T) => {
    return values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  };

  const togglePlatform = (platform: Platform) => {
    setConfig(
      "platforms",
      toggleArrayValue(autopilotConfig.platforms, platform)
    );
  };

  const toggleTask = (task: AiTask) => {
    setConfig("aiTasks", toggleArrayValue(autopilotConfig.aiTasks, task));
  };

  const recommendationPlatform: PostingPlatform =
    autopilotConfig.platforms.find(
      (platform): platform is PostingPlatform => platform !== "x"
    ) ?? "youtube";
  const postingRecommendation = getRecommendedPostingTime(
    recommendationPlatform,
    new Date().getDay()
  );
  const effectivePostingTime = autopilotConfig.useRecommendedTime
    ? postingRecommendation.recommendedTime
    : autopilotConfig.postingTime;

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
              Creator Autopilot
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Autopilot Foundation
            </h1>
          </div>

          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200">
            UI Foundation
          </div>
        </header>

        <div className="grid gap-4 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4">
            <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-5 shadow-2xl shadow-amber-950/20 backdrop-blur-xl">
              <h2 className="text-lg font-black tracking-tight text-amber-100">
                Safety Notice
              </h2>
              <div className="mt-4 grid gap-3 text-sm font-semibold leading-6 text-amber-50/90">
                <p>初期段階では自動投稿は行いません。</p>
                <p>投稿前に必ずクリエイターの確認が必要です。</p>
                <p>SNS連携はまだ未接続です。</p>
              </div>
            </section>

            <Section title="Automation">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-200">
                <input
                  type="checkbox"
                  checked={autopilotConfig.enabled}
                  onChange={(event) => setConfig("enabled", event.target.checked)}
                  className="h-4 w-4 accent-cyan-300"
                />
                Enable Creator Autopilot
              </label>
            </Section>

            <Section title="Upload Source">
              <div className="grid gap-3 sm:grid-cols-3">
                {uploadSources.map((source) => (
                  <label
                    key={source.value}
                    className={
                      source.disabled
                        ? "cursor-not-allowed rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm font-bold text-gray-600"
                        : autopilotConfig.uploadSource === source.value
                        ? "cursor-pointer rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-bold text-white"
                        : "cursor-pointer rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    <input
                      type="radio"
                      name="uploadSource"
                      checked={autopilotConfig.uploadSource === source.value}
                      disabled={source.disabled}
                      onChange={() => setConfig("uploadSource", source.value)}
                      className="mr-2 accent-cyan-300"
                    />
                    {source.label}
                    {source.disabled && (
                      <span className="ml-2 text-xs text-gray-500">
                        Coming Soon
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Schedule">
              <div className="grid gap-3 sm:grid-cols-4">
                {scheduleModes.map((mode) => (
                  <label
                    key={mode.value}
                    className={
                      mode.disabled
                        ? "cursor-not-allowed rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm font-bold text-gray-600"
                        : autopilotConfig.schedule === mode.value
                        ? "cursor-pointer rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-bold text-white"
                        : "cursor-pointer rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    <input
                      type="radio"
                      name="schedule"
                      checked={autopilotConfig.schedule === mode.value}
                      disabled={mode.disabled}
                      onChange={() => setConfig("schedule", mode.value)}
                      className="mr-2 accent-cyan-300"
                    />
                    {mode.label}
                    {mode.disabled && (
                      <span className="ml-2 text-xs text-gray-500">
                        Coming Soon
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Posting Time">
              <label
                className={
                  autopilotConfig.useRecommendedTime
                    ? "mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-bold text-white"
                    : "mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                }
              >
                <input
                  type="checkbox"
                  checked={autopilotConfig.useRecommendedTime}
                  onChange={(event) =>
                    setConfig("useRecommendedTime", event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-cyan-300"
                />
                <span>
                  AIおすすめ時間を使う
                  <span className="mt-1 block text-xs font-semibold text-gray-500">
                    選択中のPlatformに合わせて投稿時間を提案します。
                  </span>
                </span>
              </label>

              {autopilotConfig.useRecommendedTime && (
                <div className="mb-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                        Recommended
                      </p>
                      <p className="mt-2 text-3xl font-black text-white">
                        {postingRecommendation.recommendedTime}
                      </p>
                    </div>

                    <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-black text-cyan-100">
                      Confidence {postingRecommendation.confidence}%
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Reason
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-gray-200">
                      {postingRecommendation.reason}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                {postingTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => {
                      setConfig("postingTime", time);
                      setConfig("useRecommendedTime", false);
                    }}
                    className={
                      !autopilotConfig.useRecommendedTime &&
                      autopilotConfig.postingTime === time
                        ? "rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-black text-white"
                        : "rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    {time}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-sm font-semibold text-gray-300">
                Active posting time:{" "}
                <span className="font-black text-cyan-200">
                  {effectivePostingTime}
                </span>
              </div>
            </Section>

            <Section title="Platforms">
              <p className="mb-4 rounded-xl border border-white/10 bg-black/25 p-3 text-xs font-semibold leading-5 text-gray-400">
                YouTube / TikTok / Instagram posting requires official API
                verification. 現時点ではUI previewです。
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                {platforms.map((platform) => (
                  <label
                    key={platform.value}
                    className={
                      platform.disabled
                        ? "cursor-not-allowed rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm font-bold text-gray-600"
                        : autopilotConfig.platforms.includes(platform.value)
                        ? "cursor-pointer rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-bold text-white"
                        : "cursor-pointer rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={autopilotConfig.platforms.includes(platform.value)}
                      disabled={platform.disabled}
                      onChange={() => togglePlatform(platform.value)}
                      className="mr-2 accent-cyan-300"
                    />
                    {platform.label}
                    {platform.disabled && (
                      <span className="ml-2 text-xs text-gray-500">
                        Coming Soon
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Section>
          </div>

          <div className="grid gap-4">
            <Section title="Today's Recommendation">
              <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                      {postingRecommendation.platform}
                    </p>
                    <p className="mt-3 text-4xl font-black text-white">
                      {effectivePostingTime}
                    </p>
                  </div>

                  <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-black text-cyan-100">
                    {autopilotConfig.useRecommendedTime
                      ? `Confidence ${postingRecommendation.confidence}%`
                      : "Manual Time"}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Reason
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-gray-200">
                    {postingRecommendation.reason}
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Creator Style">
              <div className="grid gap-3 sm:grid-cols-2">
                {(["standard", "creator"] as CreatorStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setConfig("creatorStyle", style)}
                    className={
                      autopilotConfig.creatorStyle === style
                        ? "rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-left text-sm font-black text-white"
                        : "rounded-xl border border-white/10 bg-black/25 p-4 text-left text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    {style === "standard" ? "Standard" : "Creator"}
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white">
                    Animation Intensity
                  </span>
                  <span className="font-black text-cyan-200">
                    {autopilotConfig.animationIntensity}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={autopilotConfig.animationIntensity}
                  onChange={(event) =>
                    setConfig("animationIntensity", Number(event.target.value))
                  }
                  className="mt-3 w-full accent-cyan-300"
                />
                <div className="mt-2 flex justify-between text-xs font-semibold text-gray-500">
                  <span>1</span>
                  <span>3</span>
                  <span>5</span>
                </div>
              </div>
            </Section>

            <Section title="AI Tasks">
              <div className="grid gap-3 sm:grid-cols-2">
                {aiTasks.map((task) => (
                  <label
                    key={task.value}
                    className={
                      task.disabled
                        ? "cursor-not-allowed rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm font-bold text-gray-600"
                        : autopilotConfig.aiTasks.includes(task.value)
                        ? "cursor-pointer rounded-xl border border-cyan-300 bg-cyan-300/15 p-4 text-sm font-bold text-white"
                        : "cursor-pointer rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-gray-300 hover:border-cyan-300/40"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={autopilotConfig.aiTasks.includes(task.value)}
                      disabled={task.disabled}
                      onChange={() => toggleTask(task.value)}
                      className="mr-2 accent-cyan-300"
                    />
                    {task.label}
                    {task.disabled && (
                      <span className="ml-2 text-xs text-gray-500">
                        Coming Soon
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Preview Workflow">
              <div className="grid gap-2">
                {previewWorkflow.map((step, index) => (
                  <div key={step}>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-gray-200">
                      {step}
                    </div>
                    {index < previewWorkflow.length - 1 && (
                      <div className="py-1 text-center text-cyan-300">↓</div>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <button
              type="button"
              onClick={() =>
                setSavedMessage(
                  "設定を保存しました。現在はPreviewのみで、自動投稿は行われません。"
                )
              }
              className="rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-200"
            >
              Save Configuration
            </button>

            {savedMessage && (
              <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-200">
                {savedMessage}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
