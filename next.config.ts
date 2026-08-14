import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The CMS media endpoint accepts images up to 10 MB; keep a small envelope
    // for multipart boundaries and platform headers.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
