import { notFound } from 'next/navigation';
import {
  currentWebsite, PublishedWebsite, websiteMetadata,
} from '../../../../../websites/src/website';

export const dynamic = 'force-dynamic';

type PublicSiteParams = { path?: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<PublicSiteParams>;
}) {
  const path = '/' + ((await params).path ?? []).join('/');
  return websiteMetadata(path);
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<PublicSiteParams>;
}) {
  const path = '/' + ((await params).path ?? []).join('/');
  const site = await currentWebsite();
  if (!site || !site.build.document.pages.some((page) => page.path === path))
    notFound();
  return <PublishedWebsite site={site} path={path} />;
}
