import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binaries / sockets must not be bundled.
  serverExternalPackages: ["ffmpeg-static", "ioredis"],
  outputFileTracingIncludes: {
    "/api/video/**": ["./assets/fonts/**", "./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
