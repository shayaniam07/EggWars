import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime-uploaded assets (admin item icons, Binance payment screenshots) are
  // written to public/uploads after the build, so they are not in Next's static
  // manifest. This rewrite streams them through a validated route handler while
  // keeping the stored "/uploads/..." URLs stable.
  async rewrites() {
    return [{ source: "/uploads/:kind/:name", destination: "/api/uploads/:kind/:name" }];
  },
  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
