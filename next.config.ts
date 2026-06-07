import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pdfjs-dist', 'pdf-parse'],
  turbopack: {},
};

export default nextConfig;
