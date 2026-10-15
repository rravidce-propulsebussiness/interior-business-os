import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://sghomesinterior.in/', changeFrequency: 'weekly', priority: 1 }];
}
