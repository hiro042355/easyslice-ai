import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audio-energy": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/cut": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
    "/api/multi-cut": ["./node_modules/.nexcut-runtime/ffmpeg/ffmpeg*"],
  },
};

export default nextConfig;
