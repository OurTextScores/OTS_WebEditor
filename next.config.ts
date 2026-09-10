import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || undefined,
  output: process.env.BUILD_MODE === 'embed' ? 'export' : undefined,
  basePath: process.env.BUILD_MODE === 'embed' ? '/score-editor' : undefined,
  // The dev-tools portal can cover modal controls and the player's sticky rail.
  devIndicators: false,
  // Disable image optimization for static export
  images: process.env.BUILD_MODE === 'embed' ? { unoptimized: true } : undefined,
  // Skip Next build type-check when explicitly requested (or for embed export).
  // Run `npm run typecheck` separately in these flows.
  typescript: {
    ignoreBuildErrors:
      process.env.BUILD_MODE === 'embed' || process.env.SKIP_NEXT_TYPECHECK === '1',
  },
  async headers() {
    if (process.env.BUILD_MODE === 'embed') {
      // Static export can't emit headers; the embed host (OurTextScores / reverse proxy /
      // Vercel) is responsible for the response CSP + hardening headers. See docs/BUILD_EMBED.md
      // ("Recommended host security headers"). The client-side SVG sanitizer still ships here.
      return [];
    }
    // Hardening headers for the non-embed app (served by score_editor_api, publicly reachable).
    // `script-src` stays 'self' (blocks third-party script hosts) but keeps 'unsafe-inline'/
    // 'unsafe-eval' because Next's App Router streams inline hydration scripts and a nonce
    // would require middleware — which is incompatible with the `output: 'export'` embed build.
    // The primary XSS vector (engine SVG → innerHTML) is closed in-app by sanitizeEngineSvg.
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    ].join('; ');
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
      },
    ];
    return [
      {
        source: '/webmscore.lib.wasm',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/webmscore.lib.data',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/webmscore.lib.mem.wasm',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
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

      // Define MSCORE_SCRIPT_URL globally for webmscore WASM loader
      // This must be set at build time so webmscore can find WASM files at the correct path
      if (process.env.BUILD_MODE === 'embed') {
        const webpack = require('webpack');
        config.plugins.push(
          new webpack.DefinePlugin({
            MSCORE_SCRIPT_URL: JSON.stringify('/score-editor/'),
          }),
        );
      }
    }
    return config;
  },
};

export default nextConfig;
