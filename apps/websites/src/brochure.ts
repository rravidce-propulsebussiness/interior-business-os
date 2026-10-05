import 'server-only';
import { cache } from 'react';
import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { validateDocument } from '@business-os/brochure-builder';
export const publicBrochure = cache(async (business: string, slug: string) => {
  if (
    !isSupabaseConfigured() ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(business) ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
  )
    return null;
  const r = await createPublicDatabase().rpc('brochure_public', {
    p_business: business,
    p_slug: slug,
  });
  if (r.error || !r.data || typeof r.data !== 'object' || Array.isArray(r.data))
    return null;
  return {
    document: validateDocument(r.data.document),
    sequence: Number(r.data.sequence),
    businessName: String(r.data.businessName),
    publishedAt: String(r.data.publishedAt),
    formsEnabled: r.data.formsEnabled === true,
  };
});
