import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Type errors fail the production build. `bunx tsc --noEmit` is the
    // development-time equivalent used in this sandbox.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
