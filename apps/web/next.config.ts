import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@qapipex/shared-types",
    "@qapipex/db",
    "@qapipex/ai-service",
    "@qapipex/bug-tracker-client",
  ],
};

export default nextConfig;
