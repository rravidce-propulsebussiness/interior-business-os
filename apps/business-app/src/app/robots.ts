import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: 'OAI-SearchBot', allow: '/', disallow: ['/dashboard/', '/admin/', '/api/', '/auth/', '/reset-password', '/q/'] },
      { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/admin/', '/api/', '/auth/', '/reset-password', '/q/'] },
    ],
    sitemap: 'https://sghomesinterior.in/sitemap.xml',
  };
}
