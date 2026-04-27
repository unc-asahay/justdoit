import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Fix for multiple lockfiles warning
  outputFileTracingRoot: path.join(__dirname),

  // Skip type checking during build (types are verified via tsc separately)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Allow images from GitHub
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
    ],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  // Webpack: allow importing .md files as raw strings + ignore tooling
  // logs that would otherwise put the dev server into a rebuild loop.
  webpack(config, { dev }) {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    if (dev) {
      // The gstack browse skill streams network/console activity into
      // .gstack/*.log every time the browser hits a URL. Without this
      // ignore the dev watcher rebuilds ~1×/sec, which wipes client state.
      const ignored = ['**/node_modules/**', '**/.next/**', '**/.git/**', '**/.gstack/**'];
      config.watchOptions = { ...(config.watchOptions ?? {}), ignored };
    }
    return config;
  },
};

export default nextConfig;
