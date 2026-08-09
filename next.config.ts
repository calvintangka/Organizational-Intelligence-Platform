import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The server-owned knowledge-candidate snapshot can exceed Next's default
  // 10 MB middleware body clone limit for mature organizations. Without this
  // explicit limit, the request is truncated before the route can parse JSON,
  // producing a misleading INVALID_REQUEST response and a false persistence
  // failure in the client.
  experimental: {
    middlewareClientMaxBodySize: "32mb"
  }
};

export default nextConfig;
