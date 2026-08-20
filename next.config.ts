import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audio-energy": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/cut": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/multi-cut": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/burn-subtitle": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/transcript/durable": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/youtube/ingest": [
      "./node_modules/.nexcut-runtime/yt-dlp/yt-dlp",
      "./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*",
    ],
  },
};

export default nextConfig;
