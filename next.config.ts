import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@better-auth/core"],
  serverExternalPackages: ["better-auth"],
};

export default nextConfig;
