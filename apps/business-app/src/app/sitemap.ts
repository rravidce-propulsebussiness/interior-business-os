import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://sghomesinterior.in/',
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `https://sghomesinterior.in/solutions/crm`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/quotations`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/construction-project-management`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/interior-project-management`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/billing`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/procurement`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/client-portal`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `https://sghomesinterior.in/solutions/website-builder`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
  ];
}
