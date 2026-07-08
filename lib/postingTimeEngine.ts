export type PostingPlatform = "youtube" | "tiktok" | "instagram";

export type PostingRecommendation = {
  platform: PostingPlatform;
  recommendedTime: string;
  confidence: number;
  reason: string;
};

const weekdayRecommendations: Record<PostingPlatform, PostingRecommendation> = {
  youtube: {
    platform: "youtube",
    recommendedTime: "18:00",
    confidence: 92,
    reason: "Evening engagement is typically higher.",
  },
  tiktok: {
    platform: "tiktok",
    recommendedTime: "19:00",
    confidence: 86,
    reason: "Short-form viewers are often active after school and work.",
  },
  instagram: {
    platform: "instagram",
    recommendedTime: "19:00",
    confidence: 85,
    reason: "Evening browsing tends to increase story and reel discovery.",
  },
};

const weekendRecommendations: Record<PostingPlatform, PostingRecommendation> = {
  youtube: {
    platform: "youtube",
    recommendedTime: "12:00",
    confidence: 87,
    reason: "Weekend viewers often have more time around midday.",
  },
  tiktok: {
    platform: "tiktok",
    recommendedTime: "12:00",
    confidence: 88,
    reason: "Midday weekend scrolling is a strong discovery window.",
  },
  instagram: {
    platform: "instagram",
    recommendedTime: "19:00",
    confidence: 85,
    reason: "Evening engagement is typically stable on weekends.",
  },
};

export function getRecommendedPostingTime(
  platform: PostingPlatform,
  dayOfWeek: number
): PostingRecommendation {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const recommendationSet = isWeekend
    ? weekendRecommendations
    : weekdayRecommendations;

  return recommendationSet[platform];
}
