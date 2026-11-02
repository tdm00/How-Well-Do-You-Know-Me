import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  // CI already runs tsc. Repeating it inside `next build` on the small droplet
  // sat in swap until the deploy SSH command timed out.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
