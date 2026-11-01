import type { NextConfig } from "next";
import { apiProxyRewrites } from "./src/lib/proxyConfig";

const rewrites = apiProxyRewrites(process.env.REPOPROOF_API_ORIGIN, process.env.NEXT_PUBLIC_API_BASE_URL, process.env.VERCEL === "1");
const nextConfig: NextConfig = {
  async rewrites() { return rewrites; },
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
