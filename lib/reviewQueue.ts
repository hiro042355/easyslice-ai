export type ReviewPlatform = "youtube" | "tiktok" | "instagram" | "x";

export type ReviewStatus =
  | "draft"
  | "ready-for-review"
  | "approved"
  | "rejected"
  | "scheduled";

export type ReviewQueueItem = {
  id: string;
  videoTitle: string;
  description: string;
  hashtags: string[];
  platform: ReviewPlatform;
  postingTime: string;
  creatorStyle: "standard" | "creator";
  animationIntensity: number;
  aiHookEnabled: boolean;
  status: ReviewStatus;
  reviewStatus: ReviewStatus;
  exportedVideoPath?: string;
  exportedAt?: string;
  createdAt: string;
};

const reviewQueueStorageKey = "nexcut-review-queue";

export const mockReviewQueueItems: ReviewQueueItem[] = [
  {
    id: "review-001",
    videoTitle: "How AI saves editing time",
    description: "A short clip prepared for YouTube Shorts.",
    hashtags: ["#AI", "#Shorts", "#Creator"],
    platform: "youtube",
    postingTime: "18:00",
    creatorStyle: "standard",
    animationIntensity: 3,
    aiHookEnabled: true,
    status: "ready-for-review",
    reviewStatus: "ready-for-review",
    exportedVideoPath: "",
    exportedAt: "2026-07-09T09:00:00.000Z",
    createdAt: "2026-07-09T09:00:00.000Z",
  },
  {
    id: "review-002",
    videoTitle: "Creator Style test clip",
    description: "A high-energy cut prepared for TikTok.",
    hashtags: ["#CreatorStyle", "#Video", "#NEXCUT"],
    platform: "tiktok",
    postingTime: "19:00",
    creatorStyle: "creator",
    animationIntensity: 5,
    aiHookEnabled: false,
    status: "ready-for-review",
    reviewStatus: "ready-for-review",
    exportedVideoPath: "",
    exportedAt: "2026-07-09T10:00:00.000Z",
    createdAt: "2026-07-09T10:00:00.000Z",
  },
];

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredReviewQueueItems(): ReviewQueueItem[] {
  if (!canUseLocalStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(reviewQueueStorageKey);

    if (!raw) {
      return [];
    }

    const items = JSON.parse(raw) as ReviewQueueItem[];

    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function saveReviewQueueItems(items: ReviewQueueItem[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(reviewQueueStorageKey, JSON.stringify(items));
}

export function addReviewQueueItem(item: ReviewQueueItem) {
  const currentItems = getStoredReviewQueueItems();
  const nextItems = [item, ...currentItems.filter((current) => current.id !== item.id)];
  saveReviewQueueItems(nextItems);
  return nextItems;
}
