import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audio-energy": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
