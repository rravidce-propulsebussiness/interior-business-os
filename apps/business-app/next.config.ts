import type { NextConfig } from 'next';
const isProduction = process.env.NODE_ENV === 'production';
const config: NextConfig = {
  distDir:
    process.env.E2E_RECOVERY_BUILD === 'true' ? '.next-recovery' : '.next',
  transpilePackages: [
    '@business-os/ui',
    '@business-os/auth',
    '@business-os/database',
    '@business-os/shared',
    '@business-os/core',
    '@business-os/quotation-engine',
    '@business-os/website-builder',
    '@business-os/brochure-builder',
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
          ...(isProduction
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/q/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/auth/recovery',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/reset-password',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};
export default config;
