import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: [
    '@business-os/ui',
    '@business-os/auth',
    '@business-os/database',
    '@business-os/shared',
    '@business-os/core',
    '@business-os/quotation-engine',
    '@business-os/website-builder',
    '@business-os/industry-interior',
  ],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/*': ['../../packages/industry-interior/assets/*.webp'],
  },
  serverExternalPackages: ['playwright'],
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
      {
        source: '/q/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};
export default config;
