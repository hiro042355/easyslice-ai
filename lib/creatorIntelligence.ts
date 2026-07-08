export type CreatorInsights = {
  bestPlatform: string;
  bestPostingTime: string;
  preferredCreatorStyle: string;
  averageCreationTime: string;
  weeklyUploads: number;
  consistencyScore: number;
  creatorStyleUsageRate: number;
  aiHookUsageRate: number;
  suggestions: string[];
};

export type PerformanceInsight = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
};

export const mockCreatorInsights: CreatorInsights = {
  bestPlatform: "YouTube",
  bestPostingTime: "18:00",
  preferredCreatorStyle: "Creator",
  averageCreationTime: "2m 40s",
  weeklyUploads: 6,
  consistencyScore: 94,
  creatorStyleUsageRate: 84,
  aiHookUsageRate: 56,
  suggestions: [
    "Continue posting around 18:00",
    "Creator Style performs well",
    "Keep weekly uploads above 5",
  ],
};

export function getPerformanceInsights(
  insights: CreatorInsights
): PerformanceInsight[] {
  const performanceInsights: PerformanceInsight[] = [];

  if (insights.creatorStyleUsageRate >= 80) {
    performanceInsights.push({
      title: "Creator Style is working well.",
      description: "Keep using it for videos that need stronger presentation.",
      priority: "high",
    });
  }

  if (insights.aiHookUsageRate >= 50) {
    performanceInsights.push({
      title: "AI Hook improves retention in your recent videos.",
      description: "Use AI Hook when the opening needs a stronger moment.",
      priority: "medium",
    });
  }

  if (insights.weeklyUploads >= 5) {
    performanceInsights.push({
      title: "Excellent consistency.",
      description: "Keep weekly uploads above 5 to maintain creator momentum.",
      priority: "high",
    });
  }

  if (performanceInsights.length === 0) {
    performanceInsights.push({
      title: "Keep building your posting rhythm.",
      description: "Upload consistently to unlock stronger recommendations.",
      priority: "low",
    });
  }

  return performanceInsights;
}
