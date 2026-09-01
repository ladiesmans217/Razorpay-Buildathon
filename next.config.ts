import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phone WebView must cache hashed /_next/static assets (critical over ngrok).
  headers: async () => [
    {
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable"
        }
      ]
    }
  ],
  turbopack: {
    root: process.cwd()
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "motion"]
  }
};

export default nextConfig;
