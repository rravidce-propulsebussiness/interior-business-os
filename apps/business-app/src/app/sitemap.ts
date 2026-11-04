import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://sghomesinterior.in/',
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://sghomesinterior.in/solutions/crm',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/quotations',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/construction-project-management',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/interior-project-management',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/billing',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/procurement',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/client-portal',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/solutions/website-builder',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://sghomesinterior.in/privacy-policy',
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: 'https://sghomesinterior.in/terms-of-service',
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: 'https://sghomesinterior.in/data-deletion',
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
