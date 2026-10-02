import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { createPublishedBuildCache } from '@business-os/website-builder/cache';
const publishedBuilds = createPublishedBuildCache();
import { renderWebsite } from '@business-os/website-builder/render';
export function normalizeHostname(host: string | null) {
  if (!host || host.length > 260 || /[\s/@\\]/.test(host)) return null;
  const value = host.toLowerCase().replace(/:\d{1,5}$/, '');
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ? value : null;
}
export const currentWebsite = cache(async () => {
  const host = normalizeHostname((await headers()).get('host'));
  if (!host || !isSupabaseConfigured()) return null;
  const r = await createPublicDatabase().rpc('website_public', {
    p_hostname: host,
  });
  if (r.error) throw new Error('Website lookup unavailable');
  if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data))
    return null;
  const raw = r.data;
  const supplied = raw.build;
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied))
    return null;
  const build = publishedBuilds.get(
    host,
    String(raw.version),
    supplied.document,
  );
  return {
    host,
    build,
    version: String(raw.version),
    formsEnabled: raw.formsEnabled === true,
    publishedAt: String(raw.publishedAt),
  };
});
export async function websiteMetadata(path: string): Promise<Metadata> {
  const site = await currentWebsite();
  if (!site) return {};
  const r = renderWebsite(site.build, path, {
    formsEnabled: site.formsEnabled,
  });
  if (!r) return { robots: { index: false, follow: false } };
  const url = `https://${site.host}${path}`;
  return {
    title: { absolute: r.title },
    description: r.description,
    robots: { index: !r.noindex, follow: !r.noindex },
    alternates: { canonical: r.canonical ?? url },
    icons: site.build.document.settings.favicon
      ? {
          icon:
            '/assets/' +
            site.build.document.assets.find(
              (a) => a.id === site.build.document.settings.favicon,
            )?.assetId,
        }
      : undefined,
    openGraph: {
      title: r.ogTitle,
      description: r.ogDescription,
      url,
      ...(r.image ? { images: [`https://${site.host}${r.image}`] } : {}),
    },
  };
}
export async function PublishedWebsite({
  site,
  path,
}: {
  site: NonNullable<Awaited<ReturnType<typeof currentWebsite>>>;
  path: string;
}) {
  const r = renderWebsite(site.build, path, {
    formsEnabled: site.formsEnabled,
  });
  if (!r) return null;
  await createPublicDatabase().rpc('website_record_view', {
    p_hostname: site.host,
    p_path: path,
  });
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.build.document.settings.name,
    url: `https://${site.host}`,
    telephone: site.build.document.settings.phone,
    email: site.build.document.settings.email,
  }).replace(/</g, '\\u003c');
  return (
    <>
      <style>{r.css}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ld }}
      />
      <div dangerouslySetInnerHTML={{ __html: r.body }} />
    </>
  );
}
