import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@better-auth/core"],
  serverExternalPackages: ["better-auth"],

  // Allow ngrok dev origins so Next.js doesn't block HMR / requests
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok.io"],

  async headers() {
    return [
      {
        // Allow the main app to be framed (e.g. by ngrok interstitial)
        source: "/(.*)",
        headers: [
          // Remove restrictive X-Frame-Options — we control framing via CSP
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // Preview proxy: fully permissive so iframe embedding always works
        source: "/api/preview/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,PATCH,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
