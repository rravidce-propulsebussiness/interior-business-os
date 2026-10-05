import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir:
    process.env.E2E_RECOVERY_BUILD === 'true' ? '.next-recovery' : '.next',
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
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
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
