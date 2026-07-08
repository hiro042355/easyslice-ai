export type CreatorInsights = {
  bestPlatform: string;
  bestPostingTime: string;
  preferredCreatorStyle: string;
  averageCreationTime: string;
  weeklyUploads: number;
  consistencyScore: number;
  suggestions: string[];
};

export const mockCreatorInsights: CreatorInsights = {
  bestPlatform: "YouTube",
  bestPostingTime: "18:00",
  preferredCreatorStyle: "Creator",
  averageCreationTime: "2m 40s",
  weeklyUploads: 6,
  consistencyScore: 94,
  suggestions: [
    "Continue posting around 18:00",
    "Creator Style performs well",
    "Keep weekly uploads above 5",
  ],
};
