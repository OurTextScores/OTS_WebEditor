import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.BUILD_MODE === 'embed' ? 'export' : undefined,
  basePath: process.env.BUILD_MODE === 'embed' ? '/score-editor' : undefined,
  // Disable image optimization for static export
  images: process.env.BUILD_MODE === 'embed' ? { unoptimized: true } : undefined,
  // Skip type checking during build (run separately with tsc if needed)
  typescript: {
    ignoreBuildErrors: process.env.BUILD_MODE === 'embed',
  },
  async headers() {
    if (process.env.BUILD_MODE === 'embed') {
      return [];
    }
    return [
      {
        source: '/webmscore.lib.wasm',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/webmscore.lib.data',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/webmscore.lib.mem.wasm',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
