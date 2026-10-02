import { notFound } from 'next/navigation';
import {
  currentWebsite,
  PublishedWebsite,
  websiteMetadata,
} from '../../website';
export const dynamic = 'force-dynamic';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  return websiteMetadata('/' + (await params).path.join('/'));
}
export default async function PublicPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const path = '/' + (await params).path.join('/');
  const site = await currentWebsite();
  if (!site || !site.build.document.pages.some((p) => p.path === path))
    notFound();
  return <PublishedWebsite site={site} path={path} />;
}
