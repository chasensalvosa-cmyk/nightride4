import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The preview gateway 301s some page paths to a trailing-slash form
  // (/dashboard -> /dashboard/). Next's default answers that with a 308 back
  // to the stripped form -> 301 <-> 308 forever = ERR_TOO_MANY_REDIRECTS.
  // Serving BOTH forms directly (no redirects at all) ends the cycle whoever
  // adds the slash, and keeps API calls single-hop.
  skipTrailingSlashRedirect: true,
  typescript: {
    // Type errors fail the production build. `bunx tsc --noEmit` is the
    // development-time equivalent used in this sandbox.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
