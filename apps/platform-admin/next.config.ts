import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: [
    '@business-os/ui',
    '@business-os/auth',
    '@business-os/database',
    '@business-os/shared',
    '@business-os/core',
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
