import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker self-hosting: NEXT_STANDALONE=1. Vercel handles its own output format.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
