"use client";

import { useEffect, useState } from "react";
import {
  getStoredReviewQueueItems,
  type ReviewPlatform,
  type ReviewQueueItem,
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

type YouTubeConnectionStatus = {
  connected: boolean;
  scope: string;
  missingEnv: string[];
};

type UploadState = {
  loading: boolean;
  message: string;
  error: string;
  videoId?: string;
  url?: string;
};

export default function ReviewQueuePage() {
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeConnectionStatus>({
    connected: false,
    scope: "",
    missingEnv: [],
  });
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>(
    {}
  );
  const [reviewItems, setReviewItems] = useState<ReviewQueueItem[]>([]);

  useEffect(() => {
    setReviewItems(getStoredReviewQueueItems());

    async function loadYouTubeStatus() {
      try {
        const response = await fetch("/api/youtube/status");
        const data = (await response.json()) as YouTubeConnectionStatus;
        setYoutubeStatus(data);
      } catch {
        setYoutubeStatus({
          connected: false,
          scope: "",
          missingEnv: ["status-check-failed"],
        });
      }
    }

    loadYouTubeStatus();
  }, []);

  const uploadPrivateDraft = async (item: ReviewQueueItem) => {
    setUploadStates((states) => ({
      ...states,
      [item.id]: {
        loading: true,
        message: "",
        error: "",
      },
    }));

    try {
      const response = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ item, videoUrl: item.exportedVideoPath }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        result?: {
          videoId: string;
          url: string;
          privacyStatus: "private";
        };
      };

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || "YouTube private upload failed.");
      }

      const uploadResult = data.result;

      setUploadStates((states) => ({
        ...states,
        [item.id]: {
          loading: false,
          message: "Uploaded as private draft.",
          error: "",
          videoId: uploadResult.videoId,
          url: uploadResult.url,
        },
      }));
    } catch (error) {
      setUploadStates((states) => ({
        ...states,
        [item.id]: {
          loading: false,
          message: "",
          error:
            error instanceof Error
              ? error.message
              : "YouTube private upload failed.",
        },
      }));
    }
  };

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
            Review prepared posting candidates before publishing. YouTube upload
            is private draft only in this MVP.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                YouTube Connection
              </p>
              <h2 className="mt-2 text-xl font-black text-white">
                {youtubeStatus.connected ? "Connected" : "Not connected"}
              </h2>
              <p className="mt-2 text-xs leading-5 text-gray-400">
                Scope: {youtubeStatus.scope || "youtube.upload"} / Uploads are
                private draft only.
              </p>
              {youtubeStatus.missingEnv.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-yellow-200">
                  Missing env: {youtubeStatus.missingEnv.join(", ")}
                </p>
              )}
            </div>

            <a
              href="/api/youtube/oauth/start"
              className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Connect YouTube
            </a>
          </div>
        </section>

        <div className="grid gap-4 py-8">
          {reviewItems.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 text-sm leading-7 text-gray-400 shadow-2xl shadow-black/30 backdrop-blur-xl">
              Review Queue is empty. Export an MP4 from Creator Flow to create a review item.
            </div>
          )}

          {reviewItems.map((item) => (
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
                        {item.creatorStyle === "standard" ? "Standard" : "Creator"} /{" "}
                        {item.animationIntensity}
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
                    {item.exportedAt && (
                      <p className="mt-2 text-xs text-gray-500">
                        Exported: {new Date(item.exportedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    {item.platform === "youtube" && (
                      <button
                        type="button"
                        onClick={() => uploadPrivateDraft(item)}
                        disabled={
                          !youtubeStatus.connected ||
                          uploadStates[item.id]?.loading
                        }
                        className={
                          youtubeStatus.connected
                            ? "rounded-lg border border-red-300/25 bg-red-300/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                            : "cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-500"
                        }
                      >
                        {uploadStates[item.id]?.loading
                          ? "Uploading..."
                          : "Upload as Private Draft"}
                      </button>
                    )}
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

                  {(uploadStates[item.id]?.message ||
                    uploadStates[item.id]?.error ||
                    uploadStates[item.id]?.videoId) && (
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5">
                      {uploadStates[item.id]?.message && (
                        <p className="font-bold text-emerald-200">
                          {uploadStates[item.id]?.message}
                        </p>
                      )}
                      {uploadStates[item.id]?.videoId && (
                        <p className="mt-1 text-gray-300">
                          Video ID: {uploadStates[item.id]?.videoId}
                        </p>
                      )}
                      {uploadStates[item.id]?.url && (
                        <a
                          href={uploadStates[item.id]?.url}
                          className="mt-1 block font-bold text-cyan-300 hover:text-cyan-200"
                          target="_blank"
                        >
                          Open private YouTube draft
                        </a>
                      )}
                      {uploadStates[item.id]?.error && (
                        <p className="font-bold text-red-300">
                          {uploadStates[item.id]?.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
